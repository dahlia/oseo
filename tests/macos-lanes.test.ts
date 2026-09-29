import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import { test } from "node:test";
import { isString } from "../tools/value-kinds.ts";
import type { StructuredDataValue } from "../tools/structured-data.ts";
import { parse } from "yaml";
import {
  generateMacosWorkflow,
  macosJobs,
  macosLanes,
} from "../tools/generate-macos-lanes.ts";

interface Job {
  readonly name?: string;
  readonly "runs-on": string;
  readonly if?: string;
  readonly needs?: string | readonly string[];
  readonly strategy?: {
    readonly "fail-fast": boolean;
    readonly matrix: Readonly<Record<string, readonly StructuredDataValue[]>>;
  };
  readonly steps: readonly Record<string, StructuredDataValue>[];
  readonly [key: string]: StructuredDataValue | undefined;
}
interface Workflow {
  readonly jobs: Readonly<Record<string, Job>>;
}

const template = readFileSync("tools/main-workflow.template.yaml", "utf8");
const generated = generateMacosWorkflow(template);
// SAFETY: The checked-in workflow schema is validated by actionlint.
const before = parse(template) as Workflow;
// SAFETY: Generation retains the checked-in workflow schema.
const after = parse(generated) as Workflow;

function entries(
  job: Job,
): readonly Readonly<Record<string, StructuredDataValue>>[] {
  const matrix = job.strategy?.matrix;
  if (matrix == null) return [{}];
  if (matrix.include != null) {
    // SAFETY: include entries in this workflow are named matrix records.
    return matrix.include as readonly Readonly<
      Record<string, StructuredDataValue>
    >[];
  }
  let rows: Readonly<Record<string, StructuredDataValue>>[] = [{}];
  for (const [key, values] of Object.entries(matrix)) {
    rows = rows.flatMap((row) =>
      values.map((value) => Object.assign({}, row, { [key]: value })),
    );
  }
  return rows;
}

function expand(
  text: string,
  row: Readonly<Record<string, StructuredDataValue>>,
): string {
  return text.replace(/\$\{\{ matrix\.([\w.]+) }}/g, (_, path: string) => {
    let value: unknown = row;
    for (const key of path.split(".")) {
      // SAFETY: Matrix paths reference objects in this fixed workflow.
      value = (value as Readonly<Record<string, StructuredDataValue>>)[key];
    }
    return String(value);
  });
}

function names(workflow: Workflow): readonly string[] {
  return Object.entries(workflow.jobs)
    .flatMap(([id, job]) =>
      entries(job).map((row) =>
        job.name == null
          ? job.strategy == null
            ? id
            : `${id} (${Object.values(row).join(", ")})`
          : expand(job.name, row),
      ),
    )
    .toSorted();
}

test("every check name and concurrency policy is preserved", () => {
  assert.deepEqual(names(after), names(before));
  assert.equal(names(after).length, 58);
  const { jobs: _beforeJobs, ...beforeHeader } = before;
  const { jobs: _afterJobs, ...afterHeader } = after;
  assert.deepEqual(afterHeader, beforeHeader);
});

test("every macOS job occurs exactly once in five LPT chains", () => {
  const lanes = macosLanes();
  assert.equal(lanes.length, 5);
  const jobs = lanes.flat();
  assert.equal(jobs.length, 31);
  assert.equal(new Set(jobs.map((job) => job.id)).size, 31);
  assert.deepEqual(
    jobs.map((job) => job.name).toSorted(),
    macosJobs()
      .map((job) => job.name)
      .toSorted(),
  );
  const macIds = Object.entries(after.jobs)
    .filter(([, job]) => job["runs-on"].startsWith("macos-"))
    .map(([id]) => id)
    .toSorted();
  assert.deepEqual(macIds, jobs.map((job) => job.id).toSorted());
  for (const lane of lanes) {
    for (const [index, planned] of lane.entries()) {
      const actual = after.jobs[planned.id]!;
      assert.equal(actual.if, "${{ !cancelled() }}");
      assert.equal(actual.needs, lane[index - 1]?.id);
      assert.equal(actual.name, planned.name);
      assert.equal(actual["runs-on"], planned.os);
      assert.deepEqual(entries(actual), [planned.matrix]);
      assert.equal(actual.strategy?.["fail-fast"], false);
      if (index > 0) assert.ok(lane[index - 1]!.seconds >= planned.seconds);
    }
  }
  // Derived from the measured seconds in main run 36516215200.
  assert.equal(
    Math.max(
      ...lanes.map((lane) => lane.reduce((sum, job) => sum + job.seconds, 0)),
    ),
    8872,
  );
});

test("commands, timeouts, environments and artifacts are unchanged", () => {
  for (const planned of macosJobs()) {
    const original = before.jobs[planned.sourceId]!;
    const actual = after.jobs[planned.id]!;
    const {
      name: _name,
      strategy: _strategy,
      "runs-on": _os,
      ...originalContract
    } = original;
    const {
      name: _newName,
      strategy: _newStrategy,
      "runs-on": _newOs,
      if: _if,
      needs: _needs,
      ...actualContract
    } = actual;
    assert.deepEqual(actualContract, originalContract, planned.name);
    assert.ok(
      entries(original).some(
        (row) => JSON.stringify(row) === JSON.stringify(planned.matrix),
      ),
    );
  }
  for (const id of [
    "check",
    "test",
    "test_native",
    "test_sanitizer",
    "test_test262",
    "test_native_support",
  ]) {
    const original = before.jobs[id]!;
    const actual = after.jobs[id]!;
    const { strategy: _strategy, ...originalContract } = original;
    const { strategy: _newStrategy, ...actualContract } = actual;
    assert.deepEqual(actualContract, originalContract, id);
    assert.deepEqual(
      entries(actual),
      entries(original).filter(
        (row) => !expand(original["runs-on"], row).startsWith("macos-"),
      ),
    );
  }
});

test("native aggregate explicitly requires all native and test262 jobs", () => {
  const nativeIds = before.jobs.native!.needs;
  if (nativeIds == null || isString(nativeIds)) {
    throw new Error("Template aggregate requires a dependency list");
  }
  const expected = [
    ...nativeIds,
    ...macosJobs()
      .filter((job) => nativeIds.includes(job.sourceId))
      .map((job) => job.id),
  ].toSorted();
  const aggregate = after.jobs.native!;
  assert.equal(aggregate.if, "${{ always() }}");
  const needs = aggregate.needs;
  if (needs == null || isString(needs)) {
    throw new Error("Aggregate requires an explicit dependency list");
  }
  assert.deepEqual(needs.toSorted(), expected);
  assert.equal(expected.length, 30);
  assert.deepEqual(aggregate.steps[0]!.env, {
    RESULTS: "${{ toJSON(needs.*.result) }}",
  });
  const command = String(aggregate.steps[0]!.run);
  const script = /^node -e '([\s\S]*)'\s*$/.exec(command);
  assert.ok(script);
  for (const verdict of ["success", "failure", "skipped", "cancelled"]) {
    const result: SpawnSyncReturns<Buffer> = spawnSync(
      "node",
      ["-e", script[1]!],
      {
        env: { ...process.env, RESULTS: JSON.stringify(["success", verdict]) },
      },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status === 0, verdict === "success", verdict);
  }
  const empty = spawnSync("node", ["-e", script[1]!], {
    env: { ...process.env, RESULTS: "[]" },
  });
  assert.equal(empty.status, 1);
});

test("aggregate follows additional dependencies in the source template", () => {
  const changed = template.replace(
    "      - test_test262\n",
    "      - test_test262\n      - test_sanitizer\n",
  );
  // SAFETY: This mutation only adds an existing job to a valid needs list.
  const workflow = parse(generateMacosWorkflow(changed)) as Workflow;
  const needs = workflow.jobs.native!.needs;
  assert.ok(needs != null && !isString(needs));
  assert.ok(needs.includes("test_sanitizer"));
  assert.equal(needs.length, 31);
});

test("committed workflow matches generator output exactly", () => {
  assert.equal(readFileSync(".github/workflows/main.yaml", "utf8"), generated);
});
