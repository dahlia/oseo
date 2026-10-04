import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import { runnerSelections } from "../tools/selfhosted-mac/availability.ts";
import { configuredSelfHostedLanes } from "../tools/macos-lane-config.ts";
import { selectNativeTestShard } from "../tools/native-shard.ts";

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
    assert.deepEqual(actual.steps[0], {
      name: "Record macOS host version",
      run: "sw_vers -productVersion",
    });
    assert.deepEqual(
      executedSteps({ ...actual, steps: actual.steps.slice(1) }, {}),
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
  assert.equal(
    readFileSync(".github/workflows/main.yaml", "utf8"),
    generateMacosWorkflow(template, configuredSelfHostedLanes),
  );
});

test("zero self-hosted lanes route every macOS job to hosted", () => {
  // SAFETY: The generated workflow schema is checked by actionlint.
  const zero = parse(generated) as Workflow;
  assert.equal(zero.jobs.mac_ready, undefined);
  for (const job of macosJobs()) {
    assert.equal(zero.jobs[job.id]!["runs-on"], job.os);
  }
});

test("lane-count preview leaves the committed workflow alone", () => {
  const beforePreview = readFileSync(".github/workflows/main.yaml", "utf8");
  const preview = spawnSync(
    process.execPath,
    ["tools/generate-macos-lanes.ts", "--self-hosted-lanes", "1"],
    { encoding: "utf8" },
  );
  assert.equal(preview.error, undefined);
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(preview.stdout, generateMacosWorkflow(template, 1));
  assert.equal(
    readFileSync(".github/workflows/main.yaml", "utf8"),
    beforePreview,
  );
});

test("one extra lane retains every job and aggregate dependency", () => {
  const lanes = macosLanes(1);
  assert.equal(lanes.length, 6);
  assert.equal(lanes.flat().length, 34);
  assert.equal(new Set(lanes.flat().map((job) => job.id)).size, 34);
  assert.ok(lanes[5]!.length > 0);
  assert.deepEqual(
    lanes[5]!
      .filter((job) => job.family === "own-key cases")
      .map((job) => job.id)
      .toSorted(),
    [
      "test_property_case_macos_1",
      "test_property_case_macos_2",
      "test_property_case_macos_3",
    ],
  );
  assert.ok(
    lanes
      .slice(5)
      .flat()
      .every((job) =>
        ["native", "native support", "test262", "own-key cases"].includes(
          job.family,
        ),
      ),
  );
  assert.ok(
    lanes
      .slice(0, 5)
      .flat()
      .some((job) => job.family === "test"),
  );
  assert.ok(
    lanes
      .slice(0, 5)
      .flat()
      .some((job) => job.family === "host C sanitizers"),
  );
  assert.throws(() => macosLanes(2));
  const rendered = generateMacosWorkflow(template, 1);
  if (process.platform !== "win32") {
    const lint = spawnSync(
      "actionlint",
      ["-stdin-filename", ".github/workflows/main.yaml", "-"],
      { input: rendered },
    );
    assert.equal(lint.error, undefined);
    assert.equal(lint.status, 0, lint.stderr.toString());
  }
  // SAFETY: actionlint validates this generated workflow schema.
  const workflow = parse(rendered) as Workflow;
  for (const planned of macosJobs().filter(
    (entry) => entry.family === "test" || entry.family === "host C sanitizers",
  )) {
    const actual = workflow.jobs[planned.id]!;
    assert.equal(actual["runs-on"], planned.os);
    assert.ok(
      actual.needs == null ||
        !JSON.stringify(actual.needs).includes("mac_ready"),
    );
  }
  assert.deepEqual(
    names(workflow).filter((name) => name !== "macOS self-hosted availability"),
    names(before),
  );
  const aggregate = workflow.jobs.native!;
  assert.deepEqual(aggregate.needs, after.jobs.native!.needs);
  const readiness = workflow.jobs.mac_ready!;
  assert.equal(readiness["timeout-minutes"], 5);
  const miseStep = readiness.steps.find(
    (step) => step.uses === "jdx/mise-action@v4",
  );
  assert.ok(miseStep);
  assert.deepEqual(miseStep.with, {
    install: true,
    install_args: "node",
  });
  const outputs = parsedMapping(readiness.outputs, "Readiness outputs");
  assert.deepEqual(Object.keys(outputs).toSorted(), ["r1"]);
  const probe = readiness.steps.find((step) => step.id === "probe");
  assert.ok(probe);
  const condition = String(probe.if);
  for (const required of [
    "github.event_name == 'push'",
    "github.repository == 'dahlia/oseo'",
  ]) {
    assert.ok(condition.includes(required));
  }
  for (let index = 5; index < 6; index++) {
    for (const job of lanes[index]!) {
      const actual = workflow.jobs[job.id]!;
      assert.equal(actual.name, job.name);
      assert.match(
        actual["runs-on"],
        new RegExp(`mac_ready\\.outputs\\.r${index - 4}`),
      );
      assert.ok(`    runs-on: ${actual["runs-on"]}`.length <= 80);
      assert.match(actual["runs-on"], /\|\| '"macos-15"'/);
      assert.ok(Array.isArray(actual.needs));
      assert.ok(actual.needs.includes("mac_ready"));
      assert.equal(actual.if, "${{ !cancelled() }}");
    }
  }
});

async function unavailableRunnerApi(): Promise<never> {
  throw new Error("offline");
}

async function oneAvailableRunner() {
  return {
    ok: true,
    json: async () => ({
      runners: [
        {
          status: "online",
          busy: false,
          labels: [{ name: "oseo-mac-1" }],
        },
      ],
    }),
  };
}

test("availability fails to hosted without skipping a lane", async () => {
  const eligible = {
    OSEO_SELFHOSTED_LANES: "1",
    OSEO_SELFHOSTED_ENABLED: "true",
    OSEO_EVENT: "push",
    OSEO_REPOSITORY: "dahlia/oseo",
    OSEO_REF: "refs/heads/main",
    OSEO_RUNNER_STATUS_TOKEN: "test-token",
  };
  const hosted = ['"macos-15"'];
  assert.deepEqual(
    await runnerSelections(eligible, unavailableRunnerApi),
    hosted,
  );
  assert.deepEqual(
    await runnerSelections(
      {
        ...eligible,
        OSEO_EVENT: "pull_request",
      },
      unavailableRunnerApi,
    ),
    hosted,
  );
  assert.deepEqual(
    await runnerSelections(
      {
        ...eligible,
        OSEO_SELFHOSTED_ENABLED: "false",
      },
      oneAvailableRunner,
    ),
    hosted,
  );
  assert.deepEqual(await runnerSelections(eligible, oneAvailableRunner), [
    '["self-hosted","macOS","ARM64","oseo-mac-1"]',
  ]);
  assert.deepEqual(
    await runnerSelections(
      { ...eligible, OSEO_REF: "refs/heads/u22-measurement" },
      oneAvailableRunner,
    ),
    ['["self-hosted","macOS","ARM64","oseo-mac-1"]'],
  );
  const rejectedContexts = [
    { OSEO_REPOSITORY: "someone/oseo" },
    { OSEO_RUNNER_STATUS_TOKEN: "" },
  ];
  for (const result of await Promise.all(
    rejectedContexts.map((changes) =>
      runnerSelections({ ...eligible, ...changes }, oneAvailableRunner),
    ),
  )) {
    assert.deepEqual(result, hosted);
  }
  const rejectedRunners = [
    { status: "offline", busy: false, labels: [{ name: "oseo-mac-1" }] },
    { status: "online", busy: true, labels: [{ name: "oseo-mac-1" }] },
    { status: "online", busy: false, labels: [{ name: "other" }] },
  ];
  for (const result of await Promise.all(
    rejectedRunners.map((runner) =>
      runnerSelections(eligible, async () => ({
        ok: true,
        json: async () => ({ runners: [runner] }),
      })),
    ),
  )) {
    assert.deepEqual(result, hosted);
  }
  const rejectedResponses = [
    { ok: false, json: async () => ({ runners: [] }) },
    { ok: true, json: async () => ({}) },
  ];
  for (const result of await Promise.all(
    rejectedResponses.map((response) =>
      runnerSelections(eligible, async () => response),
    ),
  )) {
    assert.deepEqual(result, hosted);
  }
});

test("faster native support work uses additional capacity", () => {
  const lanes = macosLanes(1);
  const hosted = lanes.slice(0, 5).flat();
  const dedicated = lanes.slice(5).flat();
  const dedicatedNative = dedicated.filter(
    (job) => job.family === "native support",
  ).length;
  const hostedNative = hosted.filter(
    (job) => job.family === "native support",
  ).length;
  assert.ok(dedicatedNative > 0);
  assert.ok(dedicatedNative > hostedNative / 5);
  assert.throws(() => macosLanes(-1), /zero or one/);
  assert.throws(() => macosLanes(1.5), /zero or one/);
});

test("availability finds the one runner after a full page", async () => {
  const env = {
    OSEO_SELFHOSTED_LANES: "1",
    OSEO_SELFHOSTED_ENABLED: "true",
    OSEO_EVENT: "push",
    OSEO_REPOSITORY: "dahlia/oseo",
    OSEO_REF: "refs/heads/main",
    OSEO_RUNNER_STATUS_TOKEN: "test-token",
  };
  const filler = Array.from({ length: 100 }, () => ({
    status: "offline",
    busy: false,
    labels: [{ name: "other" }],
  }));
  const pages: string[] = [];
  const selected = await runnerSelections(env, async (url, init) => {
    pages.push(url);
    assert.ok(init.signal instanceof AbortSignal);
    return {
      ok: true,
      json: async () => ({
        runners: url.endsWith("&page=1")
          ? filler
          : [
              {
                status: "online",
                busy: false,
                labels: [{ name: "oseo-mac-1" }],
              },
            ],
      }),
    };
  });
  assert.deepEqual(selected, ['["self-hosted","macOS","ARM64","oseo-mac-1"]']);
  assert.equal(pages.length, 2);
  let calls = 0;
  assert.deepEqual(
    await runnerSelections(env, async () => {
      calls++;
      return { ok: true, json: async () => ({ runners: filler }) };
    }),
    ['"macos-15"'],
  );
  assert.equal(calls, 10);
});

test("macOS extended shard one contains own-keys", () => {
  const files = readdirSync("tests/property")
    .filter((name) => name.endsWith(".property.test.ts"))
    .map((name) => `tests/property/${name}`);
  assert.ok(
    selectNativeTestShard(files, { index: 1, total: 12 }, "darwin").includes(
      "tests/property/m5-object-own-keys.property.test.ts",
    ),
  );
});

test(
  "Mac cleanup preserves prepared job files until completion",
  {
    skip: process.platform === "win32" ? "requires Bash" : false,
  },
  () => {
    const root = mkdtempSync(join(tmpdir(), "oseo-mac-cleanup-"));
    try {
      const runner = join(root, "runner");
      const bin = join(root, "bin");
      const checkout = join(runner, "_work", "oseo", "oseo");
      const actions = join(runner, "_work", "_actions");
      const temp = join(runner, "_work", "_temp");
      mkdirSync(checkout, { recursive: true });
      mkdirSync(actions);
      mkdirSync(temp);
      mkdirSync(join(runner, "oseo-temp"));
      mkdirSync(bin);
      writeFileSync(join(runner, ".runner"), "registered");
      writeFileSync(join(checkout, "stale"), "stale");
      writeFileSync(join(actions, "action.yml"), "prepared");
      writeFileSync(join(temp, "event.json"), "prepared");
      writeFileSync(join(temp, "duration.json"), "stale");
      writeFileSync(join(runner, "oseo-temp", "stale"), "stale");
      const uname = join(bin, "uname");
      writeFileSync(uname, "#!/bin/sh\necho Darwin\n");
      chmodSync(uname, 0o700);
      const env = {
        ...process.env,
        HOME: root,
        OSEO_RUNNER_ROOT: runner,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
      };
      const cleanup = "tools/selfhosted-mac/cleanup.sh";
      const started = spawnSync("bash", [cleanup, "started"], { env });
      assert.equal(started.status, 0, String(started.stderr));
      assert.ok(!existsSync(join(checkout, "stale")));
      assert.ok(existsSync(join(actions, "action.yml")));
      assert.ok(existsSync(join(temp, "event.json")));
      assert.ok(!existsSync(join(temp, "duration.json")));
      const completed = spawnSync("bash", [cleanup, "completed"], { env });
      assert.equal(completed.status, 0, String(completed.stderr));
      assert.ok(!existsSync(actions));
      assert.ok(existsSync(temp));
      assert.ok(!existsSync(join(temp, "event.json")));
      assert.ok(!existsSync(join(runner, "oseo-temp", "stale")));
      assert.ok(existsSync(join(runner, ".runner")));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  "Mac setup scripts parse and their dry runs avoid macOS changes",
  {
    skip: process.platform === "win32" ? "requires Bash" : false,
  },
  () => {
    const env = {
      ...process.env,
      OSEO_RUNNER_ROOT: "/tmp/oseo-runner",
      OSEO_RUNNER_USER: "oseo-runner",
    };
    for (const name of readdirSync("tools/selfhosted-mac")) {
      if (!name.endsWith(".sh")) continue;
      const path = `tools/selfhosted-mac/${name}`;
      const syntax = spawnSync("bash", ["-n", path]);
      assert.equal(syntax.status, 0, `${path}: ${syntax.stderr}`);
      if (name === "install-service.sh" || name === "measure.sh") {
        const args =
          name === "measure.sh"
            ? [path, "probe", "cold", "--dry-run"]
            : [path, "--dry-run"];
        const dry = spawnSync("bash", args, { env });
        assert.equal(dry.status, 0, `${path}: ${dry.stderr}`);
      }
    }
  },
);
