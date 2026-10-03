import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import { test } from "node:test";
import { isNumber, isObject, isString } from "../tools/value-kinds.ts";
import type {
  StructuredDataRecord,
  StructuredDataValue,
} from "../tools/structured-data.ts";
import { parsedMapping } from "../tools/structured-data.ts";
import { parse } from "yaml";
import {
  generateMacosWorkflow,
  macosJobs,
  macosLanes,
} from "../tools/generate-macos-lanes.ts";
import { ownKeyCaseContract } from "../tools/check-property-case-durations.ts";

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
interface NameBaseline {
  readonly sourceRun: number;
  readonly checkNamesObserved: readonly string[];
}

const template = readFileSync("tools/main-workflow.template.yaml", "utf8");
const generated = generateMacosWorkflow(template);
// SAFETY: The checked-in workflow schema is validated by actionlint.
const before = parse(template) as Workflow;
// SAFETY: Generation retains the checked-in workflow schema.
const after = parse(generated) as Workflow;
// SAFETY: This checked-in fixture is the named GitHub run's string name list.
const nameBaseline = JSON.parse(
  readFileSync("docs/evidence/u16/baseline-check-names.json", "utf8"),
) as NameBaseline;

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
          : job.strategy != null && !job.name.includes("matrix.")
            ? `${job.name} (${Object.values(row).join(", ")})`
            : expand(job.name, row),
      ),
    )
    .toSorted();
}

function numberFrom(text: string, pattern: RegExp): number {
  const matches = [...text.matchAll(pattern)];
  assert.equal(matches.length, 1);
  return Number(matches[0]![1]!.replaceAll("_", ""));
}

// This evaluator compares observable step inputs independently of the
// generator's textual binding. Its domain is this template's expressions.
function evaluate(
  expression: string,
  row: Readonly<Record<string, StructuredDataValue>>,
): string | number | boolean | undefined {
  const text = expression.trim();
  const equality = /^(.+?)\s*==\s*(.+)$/.exec(text);
  if (equality != null) {
    const left = evaluate(equality[1]!, row);
    const right = evaluate(equality[2]!, row);
    return left == null || right == null ? undefined : left === right;
  }
  const format = /^format\(\s*'([^']+)',([\s\S]+)\)$/.exec(text);
  if (format != null) {
    const args = format[2]!.split(",").map((arg) => evaluate(arg, row));
    assert.ok(args.every((arg) => arg != null));
    return format[1]!.replace(/\{(\d+)}/g, (_, index: string) =>
      String(args[Number(index)]),
    );
  }
  const path = /^matrix\.([\w.]+)$/.exec(text);
  if (path != null) {
    let value: StructuredDataValue | undefined = row;
    for (const key of path[1]!.split(".")) {
      value = parsedMapping(value, "Test matrix")[key];
    }
    assert.ok(isString(value) || isNumber(value));
    return value;
  }
  const quoted = /^'(.*)'$/.exec(text);
  if (quoted != null) return quoted[1]!.replaceAll("''", "'");
  if (/^\d+$/.test(text)) return Number(text);
  return undefined;
}

function normalize(
  value: StructuredDataValue | undefined,
  row: Readonly<Record<string, StructuredDataValue>>,
): StructuredDataValue | undefined {
  if (isString(value)) {
    const wrapped = /^\$\{\{([\s\S]*?)}}$/.exec(value);
    if (wrapped != null) {
      const result = evaluate(wrapped[1]!, row);
      if (result != null) return result;
    }
    const evaluated = evaluate(value, row);
    if (evaluated != null) return evaluated;
    return value.replace(
      /\$\{\{([\s\S]*?)}}/g,
      (whole: string, expression: string) =>
        String(evaluate(expression, row) ?? whole),
    );
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalize(entry, row) ?? null);
  }
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalize(entry, row)]),
    );
  }
  return value;
}

function executedSteps(
  job: Job,
  row: Readonly<Record<string, StructuredDataValue>>,
): readonly StructuredDataRecord[] {
  const steps: StructuredDataRecord[] = [];
  for (const step of job.steps) {
    const normalized = parsedMapping(normalize(step, row), "Test step");
    const { if: condition, ...unconditional } = normalized;
    if (condition === false) continue;
    steps.push(condition === true ? unconditional : normalized);
  }
  return steps;
}

test("every check name and concurrency policy is preserved", () => {
  assert.deepEqual(names(after), names(before));
  assert.equal(nameBaseline.sourceRun, 36516215200);
  const existingNames = names(after).filter(
    (name) => !name.startsWith("own-key cases ("),
  );
  assert.deepEqual(existingNames, nameBaseline.checkNamesObserved.toSorted());
  assert.equal(names(after).length, 64);
  const { jobs: _beforeJobs, ...beforeHeader } = before;
  const { jobs: _afterJobs, ...afterHeader } = after;
  assert.deepEqual(afterHeader, beforeHeader);
});

test("case duration contract matches the suite and extended task", () => {
  const source = readFileSync(
    "tests/property/m5-object-own-keys.property.test.ts",
    "utf8",
  );
  const mise = readFileSync("mise.toml", "utf8");
  const header = '[tasks."test:property:extended:native:shard".env]';
  const section = mise.split(header)[1]?.split("\n[")[0];
  assert.ok(section);
  const ordinaryRuns = numberFrom(source, /\bnumRuns:\s*([\d_]+)/gu);
  const ordinaryLimit = numberFrom(
    source,
    /\btimeLimitMilliseconds:\s*([\d_]+)/gu,
  );
  const scale = numberFrom(section, /\bOSEO_PROPERTY_RUN_SCALE = "(\d+)"/gu);
  const seed = numberFrom(section, /\bOSEO_PROPERTY_SEED = "(\d+)"/gu);
  const profile = /\bprofile:\s*"([^"]+)"/u.exec(source)?.[1];
  assert.equal(ordinaryRuns * scale, ownKeyCaseContract.numRuns);
  assert.equal(ordinaryLimit * scale, ownKeyCaseContract.limitMilliseconds);
  assert.equal(seed, ownKeyCaseContract.seed);
  assert.equal(profile, ownKeyCaseContract.profile);
});

test("literal names acquire a suffix when a matrix remains", () => {
  const workflow: Workflow = {
    jobs: {
      sample: {
        name: "host C sanitizers (macOS, native)",
        "runs-on": "macos-15",
        strategy: {
          "fail-fast": false,
          matrix: { include: [{ suite: "native" }] },
        },
        steps: [],
      },
    },
  };
  assert.deepEqual(names(workflow), [
    "host C sanitizers (macOS, native) (native)",
  ]);
});

test("every macOS job occurs exactly once in five LPT chains", () => {
  const lanes = macosLanes();
  assert.equal(lanes.length, 5);
  const jobs = lanes.flat();
  assert.equal(jobs.length, 34);
  assert.equal(new Set(jobs.map((job) => job.id)).size, 34);
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
      assert.equal(
        actual.strategy,
        undefined,
        "macOS jobs must not acquire automatic matrix name suffixes",
      );
      if (index > 0) assert.ok(lane[index - 1]!.seconds >= planned.seconds);
    }
  }
  // Estimates include three case-shard jobs pending CI measurement.
  assert.equal(
    Math.max(
      ...lanes.map((lane) => lane.reduce((sum, job) => sum + job.seconds, 0)),
    ),
    9414,
  );
});

test("commands, timeouts, environments and artifacts are unchanged", () => {
  for (const planned of macosJobs()) {
    const original = before.jobs[planned.sourceId]!;
    const actual = after.jobs[planned.id]!;
    const {
      name: _name,
      strategy: _strategy,
      steps: _steps,
      "runs-on": _os,
      ...originalContract
    } = original;
    const {
      name: _newName,
      strategy: _newStrategy,
      steps: _newSteps,
      "runs-on": _newOs,
      if: _if,
      needs: _needs,
      ...actualContract
    } = actual;
    assert.deepEqual(
      normalize(actualContract, {}),
      normalize(originalContract, planned.matrix),
      planned.name,
    );
    assert.deepEqual(
      executedSteps(actual, {}),
      executedSteps(original, planned.matrix),
      planned.name,
    );
    assert.ok(!JSON.stringify(actual).includes("matrix."));
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
    "test_property_case",
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
  assert.equal(expected.length, 34);
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
  const download = aggregate.steps.find(
    (step) => step.uses === "actions/download-artifact@v7",
  );
  assert.ok(download);
  assert.equal(
    parsedMapping(download.with, "Duration download").pattern,
    "own-key-duration-*",
  );
  assert.match(
    String(aggregate.steps.at(-1)?.run),
    /mise run check:property-case-durations/u,
  );
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
  assert.equal(needs.length, 35);
});

test("committed workflow matches generator output exactly", () => {
  assert.equal(readFileSync(".github/workflows/main.yaml", "utf8"), generated);
});
