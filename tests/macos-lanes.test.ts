import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { isNumber, isObject, isString } from "../tools/value-kinds.ts";
import type {
  StructuredDataRecord,
  StructuredDataValue,
} from "../tools/structured-data.ts";
import { parsedMapping } from "../tools/structured-data.ts";
import { parse } from "yaml";
import type { MacosLaneJob } from "../tools/generate-macos-lanes.ts";
import {
  generateMacosWorkflow,
  macosJobs,
  macosLaneEnds,
  macosLanes,
  selfHostedLaneEnds,
} from "../tools/generate-macos-lanes.ts";
import { macosLaneReport, parseAttempt } from "../tools/macos-lane-report.ts";
import { ownKeyCaseContract } from "../tools/check-property-case-durations.ts";
import { runnerSelections } from "../tools/selfhosted-mac/availability.ts";
import { configuredSelfHostedLanes } from "../tools/macos-lane-config.ts";
import {
  hostedFallbackTimeScale,
  macosFixedSetupSeconds,
  selfHostedFamilySpeedRatios,
  selfHostedJobSeconds,
  selfHostedPairSlowdowns,
  selfHostedProbeSeconds,
} from "../tools/macos-job-costs.ts";
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
  // Hosted medians of seven measured run attempts, all on hosted lanes.
  assert.equal(
    Math.max(
      ...lanes.map((lane) => lane.reduce((sum, job) => sum + job.seconds, 0)),
    ),
    9135,
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
  assert.throws(() => macosLanes(3));
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
          name: "oseo-mac-1",
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
    {
      name: "oseo-mac-1",
      status: "offline",
      busy: false,
      labels: [{ name: "oseo-mac-1" }],
    },
    {
      name: "oseo-mac-1",
      status: "online",
      busy: true,
      labels: [{ name: "oseo-mac-1" }],
    },
    {
      name: "oseo-mac-1",
      status: "online",
      busy: false,
      labels: [{ name: "other" }],
    },
    {
      name: "other",
      status: "online",
      busy: false,
      labels: [{ name: "oseo-mac-1" }],
    },
    {
      name: "oseo-mac-1",
      status: "online",
      busy: false,
      labels: [{ name: "oseo-mac-1" }, { name: "oseo-mac-2" }],
    },
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

test("own-key cases lead the Mac lane with measured Mac seconds", () => {
  const lanes = macosLanes(1);
  const mac = lanes[5]!;
  assert.deepEqual(
    mac.slice(0, 3).map((job) => job.family),
    ["own-key cases", "own-key cases", "own-key cases"],
  );
  // Without the pin, longer jobs would precede them on the Mac lane.
  assert.ok(mac.slice(3).some((job) => job.seconds > mac[0]!.seconds));
  for (const lane of [...lanes.slice(0, 5), mac.slice(3)]) {
    for (const [index, job] of lane.entries()) {
      if (index > 0) assert.ok(lane[index - 1]!.seconds >= job.seconds);
    }
  }
  assert.ok(Object.keys(selfHostedJobSeconds).length > 0);
  for (const name of Object.keys(selfHostedJobSeconds)) {
    const job = macosJobs().find((candidate) => candidate.name === name);
    assert.ok(job != null, name);
    assert.equal(job.os, "macos-15");
    assert.ok(
      ["native", "native support", "test262", "own-key cases"].includes(
        job.family,
      ),
    );
  }
  // The modeled Mac lane uses the measured seconds where present.
  const modeled = mac.reduce(
    (sum, job) =>
      sum +
      (selfHostedJobSeconds[job.name] ??
        macosFixedSetupSeconds +
          (job.seconds - macosFixedSetupSeconds) /
            selfHostedFamilySpeedRatios[job.family]!),
    selfHostedProbeSeconds,
  );
  assert.equal(Math.round(modeled), 5609);
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
  for (const invalid of [-1, 1.5, 3]) {
    assert.throws(() => macosLanes(invalid), /zero, one, or two/);
  }
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
                name: "oseo-mac-1",
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

test("two Mac lanes route each label with its own hosted fallback", () => {
  assert.equal(configuredSelfHostedLanes, 2);
  const lanes = macosLanes(2);
  assert.equal(lanes.length, 7);
  assert.equal(lanes.flat().length, 34);
  assert.equal(new Set(lanes.flat().map((job) => job.id)).size, 34);
  assert.ok(lanes[5]!.length > 0 && lanes[6]!.length > 0);
  // One readiness output, so one runner class, for the shared deadline.
  assert.deepEqual(
    lanes
      .flat()
      .filter((job) => job.family === "own-key cases")
      .map((job) => lanes.findIndex((lane) => lane.includes(job))),
    [5, 5, 5],
  );
  for (const job of lanes.slice(5).flat()) {
    assert.equal(job.os, "macos-15");
    assert.ok(
      ["native", "native support", "test262", "own-key cases"].includes(
        job.family,
      ),
    );
  }
  const rendered = readFileSync(".github/workflows/main.yaml", "utf8");
  // SAFETY: actionlint validates this generated workflow schema.
  const workflow = parse(rendered) as Workflow;
  assert.deepEqual(
    names(workflow).filter((name) => name !== "macOS self-hosted availability"),
    names(before),
  );
  assert.deepEqual(workflow.jobs.native!.needs, after.jobs.native!.needs);
  const readiness = workflow.jobs.mac_ready!;
  const outputs = parsedMapping(readiness.outputs, "Readiness outputs");
  assert.deepEqual(Object.keys(outputs).toSorted(), ["r1", "r2"]);
  const probe = readiness.steps.find((step) => step.id === "probe");
  assert.ok(probe);
  assert.equal(
    parsedMapping(probe.env, "Probe environment").OSEO_SELFHOSTED_LANES,
    2,
  );
  assert.match(String(probe.if), /github\.event_name == 'push'/);
  for (const [index, lane] of lanes.entries()) {
    for (const job of lane) {
      const actual = workflow.jobs[job.id]!;
      assert.equal(actual.name, job.name);
      if (index < 5) {
        assert.equal(actual["runs-on"], job.os);
        assert.ok(!JSON.stringify(actual.needs ?? "").includes("mac_ready"));
        continue;
      }
      assert.equal(
        actual["runs-on"],
        `\${{ fromJSON(needs.mac_ready.outputs.r${index - 4}` +
          ` || '"macos-15"') }}`,
      );
      assert.deepEqual(actual.needs, ["mac_ready"]);
      assert.equal(actual.if, "${{ !cancelled() }}");
    }
  }
});

/** The job-level scale a Mac-lane property job carries, by lane output. */
function fallbackEnvironment(runnerOutput: string) {
  return {
    OSEO_PROPERTY_TIME_SCALE:
      `\${{ contains(needs.mac_ready.outputs.${runnerOutput},` +
      ` 'self-hosted') && '1' || '${hostedFallbackTimeScale}' }}`,
  };
}

test("hosted fallback widens only Mac-lane property deadlines", () => {
  // The scale restores the margin a Mac lane gives the fixed budgets, so
  // it must cover the family ratio the lane model converts walls with.
  assert.ok(Number.isSafeInteger(hostedFallbackTimeScale));
  assert.ok(hostedFallbackTimeScale >= 1);
  assert.ok(
    hostedFallbackTimeScale >= selfHostedFamilySpeedRatios["native support"]!,
  );
  const rendered = readFileSync(".github/workflows/main.yaml", "utf8");
  // SAFETY: actionlint validates this generated workflow schema.
  const workflow = parse(rendered) as Workflow;
  const lanes = macosLanes(configuredSelfHostedLanes);
  let scaled = 0;
  for (const [index, lane] of lanes.entries()) {
    for (const job of lane) {
      const actual = workflow.jobs[job.id]!;
      if (index >= 5 && job.family === "native support") {
        assert.deepEqual(actual.env, fallbackEnvironment(`r${index - 4}`));
        scaled++;
        continue;
      }
      assert.deepEqual(actual.env, before.jobs[job.sourceId]!.env, job.id);
      // Own-key duration records pin the original limit for the aggregate
      // deadline check, and test262 and native fixtures run no property.
      if (["own-key cases", "test262", "native"].includes(job.family)) {
        assert.ok(
          !JSON.stringify(actual).includes("OSEO_PROPERTY_TIME_SCALE"),
          job.id,
        );
      }
    }
  }
  assert.ok(scaled > 0);
  assert.equal(
    scaled,
    lanes
      .slice(5)
      .flat()
      .filter((job) => job.family === "native support").length,
  );
  // Without a Mac lane every job is hosted by design and keeps its limit.
  assert.ok(!generated.includes("OSEO_PROPERTY_TIME_SCALE: >-\n        $"));
  for (const job of macosJobs()) {
    assert.deepEqual(
      after.jobs[job.id]!.env,
      before.jobs[job.sourceId]!.env,
      job.id,
    );
  }
  // SAFETY: actionlint validates this generated workflow schema.
  const one = parse(generateMacosWorkflow(template, 1)) as Workflow;
  for (const job of macosLanes(1)[5]!) {
    assert.deepEqual(
      one.jobs[job.id]!.env,
      job.family === "native support"
        ? fallbackEnvironment("r1")
        : before.jobs[job.sourceId]!.env,
      job.id,
    );
  }
  // The always-hosted macOS test job widens the ordinary own-key limit by
  // a fixed factor; the same expression yields 1 on Linux and Windows.
  const hostedScale = {
    OSEO_PROPERTY_TIME_SCALE: "${{ runner.os == 'macOS' && '2' || '1' }}",
  };
  for (const [id, run] of [
    ["test_macos_node", "mise run test:node"],
    ["test_macos_deno", "mise run test:deno"],
    ["test", "mise run test:${{ matrix.runtime }}"],
  ] as const) {
    const step = workflow.jobs[id]!.steps.find((entry) => entry.run === run);
    assert.ok(step, id);
    assert.deepEqual(step.env, hostedScale, id);
  }
  for (const line of rendered.split("\n")) {
    if (line.includes("OSEO_PROPERTY_TIME_SCALE") || line.includes("'1' ||")) {
      assert.ok(line.length <= 80, line);
    }
  }
});

function laneJob(family: string, name: string): MacosLaneJob {
  return {
    id: name,
    name,
    sourceId: name,
    matrix: {},
    os: "macos-15",
    seconds: 0,
    family,
  };
}

test("Mac lane overlap applies measured pair slowdowns", () => {
  const t262 = laneJob("test262", "t");
  const support = laneJob("native support", "n");
  const own = laneJob("own-key cases", "o");
  const costs = new Map([
    [t262, 100],
    [support, 300],
    [own, 50],
  ]);
  const seconds = (job: MacosLaneJob): number => costs.get(job)!;
  const probe = selfHostedProbeSeconds;
  // One lane is a plain sum after the readiness allowance.
  assert.deepEqual(selfHostedLaneEnds([[t262, own, support]], seconds), [
    probe + 450,
  ]);
  // Both lanes busy: each runs slower; the survivor then runs alone.
  const ends = selfHostedLaneEnds([[t262], [support]], seconds);
  const shared = 100 * selfHostedPairSlowdowns.test262!["native support"]!;
  const supportDone =
    shared / selfHostedPairSlowdowns["native support"]!.test262!;
  assert.ok(Math.abs(ends[0]! - (probe + shared)) < 1e-6);
  assert.ok(Math.abs(ends[1]! - (probe + shared + 300 - supportDone)) < 1e-6);
  assert.ok(ends[1]! > probe + 300);
  // An empty lane ends with the allowance and slows nothing.
  assert.deepEqual(selfHostedLaneEnds([[own], []], seconds), [
    probe + 50,
    probe,
  ]);
  assert.throws(
    () => selfHostedLaneEnds([[t262], [support], [own]], seconds),
    /More than two Mac lanes/,
  );
  for (const [family, partners] of Object.entries(selfHostedPairSlowdowns)) {
    for (const partner of Object.keys(selfHostedPairSlowdowns)) {
      const factor = partners[partner];
      assert.ok(factor != null && factor >= 1 && factor < 2, family);
    }
  }
});

test("two Mac lanes shorten the derived makespan in every attempt", () => {
  const directory = "docs/evidence/u25/model";
  const attempts = readdirSync(directory)
    .filter((name) => /^jobs-\d+-\d+\.tsv$/.test(name))
    .toSorted()
    .map((name) =>
      parseAttempt(name, readFileSync(join(directory, name), "utf8")),
    );
  assert.equal(attempts.length, 10);
  const report = macosLaneReport(attempts);
  const rows = report
    .split("\n")
    .filter((line) => line.startsWith("jobs-"))
    .map((line) => line.split("\t").slice(1).map(Number));
  assert.equal(rows.length, 10);
  for (const [one, two] of rows) assert.ok(two! < one!, report);
  assert.match(report, /^Range\t[\d.]+-[\d.]+\t[\d.]+-[\d.]+$/m);
  const one = Math.max(...macosLaneEnds(macosLanes(1)));
  const two = Math.max(...macosLaneEnds(macosLanes(2)));
  assert.ok(two < one);
  assert.throws(
    () => parseAttempt("bad", "name\trunner\tnot-a-date\talso-not\n"),
    /Invalid job wall/,
  );
  assert.throws(() => parseAttempt("bad", "name only\n"), /Malformed/);
});

interface FakeRunner {
  readonly name: string;
  readonly status: string;
  readonly busy: boolean;
  readonly labels: readonly { readonly name: string }[];
}

const twoRunners: readonly FakeRunner[] = [
  {
    name: "oseo-mac-1",
    status: "online",
    busy: false,
    labels: [{ name: "self-hosted" }, { name: "oseo-mac-1" }],
  },
  {
    name: "oseo-mac-2",
    status: "online",
    busy: false,
    labels: [{ name: "self-hosted" }, { name: "oseo-mac-2" }],
  },
];

test("availability decides each Mac lane independently", async () => {
  const env = {
    OSEO_SELFHOSTED_LANES: "2",
    OSEO_SELFHOSTED_ENABLED: "true",
    OSEO_EVENT: "push",
    OSEO_REPOSITORY: "dahlia/oseo",
    OSEO_RUNNER_STATUS_TOKEN: "test-token",
  };
  const hosted = '"macos-15"';
  const mac1 = '["self-hosted","macOS","ARM64","oseo-mac-1"]';
  const mac2 = '["self-hosted","macOS","ARM64","oseo-mac-2"]';
  const select = (
    runners: readonly FakeRunner[],
    changes: Readonly<Record<string, string>> = {},
  ) =>
    runnerSelections({ ...env, ...changes }, async () => ({
      ok: true,
      json: async () => ({ runners }),
    }));
  assert.deepEqual(await select(twoRunners), [mac1, mac2]);
  assert.deepEqual(await select(twoRunners, { OSEO_SELFHOSTED_LANES: "1" }), [
    mac1,
  ]);
  const [first, second] = twoRunners;
  assert.deepEqual(await select([first!, { ...second!, status: "offline" }]), [
    mac1,
    hosted,
  ]);
  assert.deepEqual(await select([{ ...first!, busy: true }, second!]), [
    hosted,
    mac2,
  ]);
  assert.deepEqual(await select([first!]), [mac1, hosted]);
  // A second carrier of a label makes that lane's routing ambiguous.
  assert.deepEqual(
    await select([...twoRunners, { ...second!, name: "spare" }]),
    [mac1, hosted],
  );
  // One runner carrying both lane labels could take both lanes' jobs.
  assert.deepEqual(
    await select([
      {
        ...first!,
        labels: [{ name: "oseo-mac-1" }, { name: "oseo-mac-2" }],
      },
    ]),
    [hosted, hosted],
  );
  // A lane needs its runner's name to equal its label.
  assert.deepEqual(await select([first!, { ...second!, name: "oseo-mac-3" }]), [
    mac1,
    hosted,
  ]);
  assert.deepEqual(await select(twoRunners, { OSEO_EVENT: "pull_request" }), [
    hosted,
    hosted,
  ]);
  assert.deepEqual(
    await runnerSelections(env, async () => {
      throw new Error("offline");
    }),
    [hosted, hosted],
  );
  await Promise.all(
    ["0", "3", "1.5", ""].map((lanes) =>
      assert.rejects(
        select(twoRunners, { OSEO_SELFHOSTED_LANES: lanes }),
        /one or two/,
      ),
    ),
  );
});

test(
  "Mac installer keeps the oseo-mac-1 plist and names each runner",
  {
    skip: process.platform === "win32" ? "requires Bash" : false,
  },
  () => {
    const installer = "tools/selfhosted-mac/install-service.sh";
    const runners = [
      { label: undefined, fixture: "oseo-mac-1", user: "oseo-runner" },
      { label: "oseo-mac-2", fixture: "oseo-mac-2", user: "oseo-runner2" },
    ];
    for (const { label, fixture, user } of runners) {
      const inherited = Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) =>
            key !== "OSEO_RUNNER_LABEL" && key !== "OSEO_ZIG_CACHE_CAP_GIB",
        ),
      );
      const base = {
        ...inherited,
        OSEO_RUNNER_ROOT: `/Users/${user}/actions-runner`,
        OSEO_RUNNER_USER: user,
        OSEO_RUNNER_HOME: `/Users/${user}`,
      };
      // The default runner is selected by leaving the label unset.
      const env = label == null ? base : { ...base, OSEO_RUNNER_LABEL: label };
      const printed = spawnSync("bash", [installer, "--print-plist"], {
        env,
      });
      assert.equal(printed.status, 0, printed.stderr.toString());
      assert.equal(
        printed.stdout.toString(),
        readFileSync(`tests/fixtures/selfhosted-mac/${fixture}.plist`, "utf8"),
      );
      const dry = spawnSync("bash", [installer, "--dry-run"], {
        encoding: "utf8",
        env,
      });
      assert.match(
        dry.stdout,
        new RegExp(`org\\.oseo\\.runner\\.${fixture}\\.plist for ${user}`),
      );
    }
    for (const invalid of ["oseo-mac-0", "oseo-mac-3", "oseo-mac-1 ", "x"]) {
      const env = {
        ...process.env,
        OSEO_RUNNER_ROOT: "/tmp/oseo-runner",
        OSEO_RUNNER_USER: "oseo-runner",
        OSEO_RUNNER_HOME: "/tmp",
        OSEO_RUNNER_LABEL: invalid,
      };
      for (const args of [
        [installer, "--dry-run"],
        [installer, "--print-plist"],
        ["tools/selfhosted-mac/health.sh"],
      ]) {
        const rejected = spawnSync("bash", args, { encoding: "utf8", env });
        assert.equal(rejected.status, 2, `${invalid}: ${args.join(" ")}`);
        assert.match(rejected.stderr, /oseo-mac-1 or oseo-mac-2/u);
      }
    }
  },
);

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
  "Mac cleanup clears job files but preserves listener IPC",
  {
    skip: process.platform === "win32" ? "requires Bash" : false,
  },
  () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "oseo-mac-cleanup-")));
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
      writeFileSync(join(runner, "oseo-temp", "listener.pipe"), "live");
      const uname = join(bin, "uname");
      writeFileSync(uname, "#!/bin/sh\necho Darwin\n");
      chmodSync(uname, 0o700);
      const df = join(bin, "df");
      writeFileSync(
        df,
        "#!/bin/sh\n" +
          "echo 'Filesystem Blocks Used Available'\n" +
          "echo 'disk 1 1 50000000'\n",
      );
      chmodSync(df, 0o700);
      const env = {
        ...process.env,
        HOME: root,
        OSEO_RUNNER_ROOT: runner,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
      };
      const cleanup = "tools/selfhosted-mac/cleanup.sh";
      symlinkSync(runner, join(root, "linked-root"));
      symlinkSync(root, join(root, "linked-parent"));
      for (const linkedRoot of [
        join(root, "linked-root"),
        join(root, "linked-parent", "runner"),
      ]) {
        const linked = spawnSync("/bin/bash", [cleanup, "started"], {
          env: { ...env, OSEO_RUNNER_ROOT: linkedRoot },
        });
        assert.equal(linked.status, 2);
        assert.match(String(linked.stderr), /linked runner root/u);
        assert.ok(existsSync(join(checkout, "stale")));
      }
      const patternRoot = join(root, "a?c");
      const patternCheckout = join(patternRoot, "_work", "oseo", "oseo");
      mkdirSync(patternCheckout, { recursive: true });
      writeFileSync(join(patternRoot, ".runner"), "registered");
      writeFileSync(join(patternCheckout, "stale"), "stale");
      symlinkSync(patternRoot, join(root, "abc"));
      const patternLink = spawnSync("/bin/bash", [cleanup, "started"], {
        env: { ...env, OSEO_RUNNER_ROOT: join(root, "abc") },
      });
      assert.equal(patternLink.status, 2);
      assert.match(String(patternLink.stderr), /linked runner root/u);
      assert.ok(existsSync(join(patternCheckout, "stale")));
      const parentTraversal = spawnSync("/bin/bash", [cleanup, "started"], {
        env: { ...env, OSEO_RUNNER_ROOT: `${runner}/../runner` },
      });
      assert.equal(parentTraversal.status, 2);
      assert.match(String(parentTraversal.stderr), /linked runner root/u);
      assert.ok(existsSync(join(checkout, "stale")));
      const started = spawnSync("/bin/bash", [cleanup, "started"], { env });
      assert.equal(started.status, 0, String(started.stderr));
      assert.ok(!existsSync(join(checkout, "stale")));
      assert.ok(existsSync(join(actions, "action.yml")));
      assert.ok(existsSync(join(temp, "event.json")));
      assert.ok(!existsSync(join(temp, "duration.json")));
      const completed = spawnSync("/bin/bash", [cleanup, "completed"], { env });
      assert.equal(completed.status, 0, String(completed.stderr));
      assert.ok(!existsSync(actions));
      assert.ok(!existsSync(join(runner, "_work", "oseo")));
      assert.ok(existsSync(temp));
      assert.ok(!existsSync(join(temp, "event.json")));
      assert.ok(existsSync(join(runner, "oseo-temp", "listener.pipe")));
      assert.ok(existsSync(join(runner, ".runner")));
      const trailingSlash = spawnSync("/bin/bash", [cleanup, "started"], {
        env: { ...env, OSEO_RUNNER_ROOT: `${runner}/` },
      });
      assert.equal(trailingSlash.status, 0, String(trailingSlash.stderr));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  "Mac cleanup refuses a linked Zig cache parent",
  {
    skip: process.platform === "win32" ? "requires Bash" : false,
  },
  () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "oseo-mac-cache-")));
    const external = realpathSync(
      mkdtempSync(join(tmpdir(), "oseo-mac-external-")),
    );
    try {
      const runner = join(root, "runner");
      const bin = join(root, "bin");
      mkdirSync(runner);
      mkdirSync(bin);
      writeFileSync(join(runner, ".runner"), "registered");
      for (const [name, body] of [
        ["uname", "#!/bin/sh\necho Darwin\n"],
        ["id", '#!/bin/sh\n[ "$*" = "-un" ] || exit 1\necho oseo-runner\n'],
        [
          "dscl",
          [
            "#!/bin/sh\n",
            '[ "$*" = ". -read /Users/oseo-runner NFSHomeDirectory" ]',
            " || exit 1\n",
            '[ -n "$OSEO_TEST_ACCOUNT_HOME" ] || exit 1\n',
            `printf 'NFSHomeDirectory: %s\\n' "$OSEO_TEST_ACCOUNT_HOME"\n`,
          ].join(""),
        ],
        [
          "df",
          "#!/bin/sh\n" +
            "echo 'Filesystem Blocks Used Available'\n" +
            "echo 'disk 1 1 100'\n",
        ],
      ] as const) {
        const executable = join(bin, name);
        writeFileSync(executable, body);
        chmodSync(executable, 0o700);
      }
      mkdirSync(join(external, "zig"));
      const externalMarker = join(external, "zig", "keep");
      writeFileSync(externalMarker, "keep");
      symlinkSync(external, join(root, ".cache"));
      const env = {
        ...process.env,
        HOME: root,
        OSEO_TEST_ACCOUNT_HOME: root,
        OSEO_RUNNER_ROOT: runner,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
      };
      const cleanup = "tools/selfhosted-mac/cleanup.sh";
      const linked = spawnSync("/bin/bash", [cleanup, "completed"], { env });
      assert.equal(linked.status, 0, String(linked.stderr));
      assert.ok(existsSync(externalMarker));
      assert.doesNotMatch(String(linked.stdout), /Pruned Zig cache/u);
      assert.match(String(linked.stderr), /unsafe home or cache path/u);
      const externalCache = join(external, ".cache", "zig");
      mkdirSync(externalCache, { recursive: true });
      const linkedHomeMarker = join(externalCache, "keep-home");
      writeFileSync(linkedHomeMarker, "keep");
      const linkedHome = join(root, "linked-home");
      symlinkSync(external, linkedHome);
      const homeResult = spawnSync("/bin/bash", [cleanup, "completed"], {
        env: {
          ...env,
          HOME: linkedHome,
          OSEO_TEST_ACCOUNT_HOME: external,
        },
      });
      assert.equal(homeResult.status, 0, String(homeResult.stderr));
      assert.ok(existsSync(linkedHomeMarker));
      assert.doesNotMatch(String(homeResult.stdout), /Pruned Zig cache/u);
      assert.match(String(homeResult.stderr), /unsafe home or cache path/u);
      const linkedAccountHome = spawnSync("/bin/bash", [cleanup, "completed"], {
        env: { ...env, OSEO_TEST_ACCOUNT_HOME: linkedHome },
      });
      assert.equal(
        linkedAccountHome.status,
        0,
        String(linkedAccountHome.stderr),
      );
      assert.match(
        String(linkedAccountHome.stderr),
        /account home unavailable or linked/u,
      );
      rmSync(join(root, ".cache"));
      const localCache = join(root, ".cache", "zig");
      mkdirSync(localCache, { recursive: true });
      writeFileSync(join(localCache, "prune"), "prune");
      const local = spawnSync("/bin/bash", [cleanup, "completed"], { env });
      assert.equal(local.status, 0, String(local.stderr));
      assert.ok(!existsSync(localCache));
      assert.match(String(local.stdout), /Pruned Zig cache/u);
      mkdirSync(localCache);
      writeFileSync(join(localCache, "prune-again"), "prune");
      const trailingHome = spawnSync("/bin/bash", [cleanup, "completed"], {
        env: { ...env, HOME: `${root}/` },
      });
      assert.equal(trailingHome.status, 0, String(trailingHome.stderr));
      assert.ok(!existsSync(localCache));
      mkdirSync(localCache);
      writeFileSync(join(localCache, "keep-account"), "keep");
      const otherHome = join(root, "other-home");
      const otherCache = join(otherHome, ".cache", "zig");
      mkdirSync(otherCache, { recursive: true });
      writeFileSync(join(otherCache, "prune"), "prune");
      const mismatched = spawnSync("/bin/bash", [cleanup, "completed"], {
        env: { ...env, HOME: otherHome },
      });
      assert.equal(mismatched.status, 0, String(mismatched.stderr));
      assert.ok(existsSync(otherCache));
      assert.ok(existsSync(join(localCache, "keep-account")));
      assert.match(String(mismatched.stderr), /unsafe home or cache path/u);
      const noAccountHome = spawnSync("/bin/bash", [cleanup, "completed"], {
        env: { ...env, OSEO_TEST_ACCOUNT_HOME: "" },
      });
      assert.equal(noAccountHome.status, 0, String(noAccountHome.stderr));
      assert.ok(existsSync(join(localCache, "keep-account")));
      assert.match(String(noAccountHome.stderr), /account home unavailable/u);
      const matchingAccountHome = spawnSync(
        "/bin/bash",
        [cleanup, "completed"],
        {
          env: {
            ...env,
            HOME: otherHome,
            OSEO_TEST_ACCOUNT_HOME: otherHome,
          },
        },
      );
      assert.equal(
        matchingAccountHome.status,
        0,
        String(matchingAccountHome.stderr),
      );
      assert.ok(!existsSync(otherCache));
      mkdirSync(otherCache);
      writeFileSync(join(otherCache, "keep-on-error"), "keep");
      const failingRm = join(bin, "rm");
      writeFileSync(failingRm, "#!/bin/sh\nexit 1\n");
      chmodSync(failingRm, 0o700);
      const removalFailure = spawnSync("/bin/bash", [cleanup, "completed"], {
        env: {
          ...env,
          HOME: otherHome,
          OSEO_TEST_ACCOUNT_HOME: otherHome,
        },
      });
      assert.equal(removalFailure.status, 0, String(removalFailure.stderr));
      assert.ok(existsSync(join(otherCache, "keep-on-error")));
      assert.match(String(removalFailure.stderr), /removal failed/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  },
);

test(
  "Mac cleanup caps the account Zig cache by size",
  {
    skip: process.platform === "win32" ? "requires Bash" : false,
  },
  () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "oseo-mac-cap-")));
    const external = realpathSync(
      mkdtempSync(join(tmpdir(), "oseo-mac-cap-external-")),
    );
    try {
      const runner = join(root, "runner");
      const bin = join(root, "bin");
      const duLog = join(root, "du.log");
      mkdirSync(runner);
      mkdirSync(bin);
      writeFileSync(join(runner, ".runner"), "registered");
      for (const [name, body] of [
        ["uname", "#!/bin/sh\necho Darwin\n"],
        ["id", '#!/bin/sh\n[ "$*" = "-un" ] || exit 1\necho oseo-runner\n'],
        [
          "dscl",
          "#!/bin/sh\n" +
            `printf 'NFSHomeDirectory: %s\\n' "$OSEO_TEST_ACCOUNT_HOME"\n`,
        ],
        [
          "df",
          "#!/bin/sh\n" +
            "echo 'Filesystem Blocks Used Available'\n" +
            'echo "disk 1 1 $OSEO_TEST_FREE_KIB"\n',
        ],
        [
          "du",
          [
            "#!/bin/sh\n",
            `printf '%s %s\\n' "$PWD" "$*" >> "$OSEO_TEST_DU_LOG"\n`,
            '[ "$OSEO_TEST_DU_KIB" = fail ] && exit 1\n',
            '[ -n "$OSEO_TEST_DU_KIB" ] || exec /usr/bin/du "$@"\n',
            `printf '%s\\tzig\\n' "$OSEO_TEST_DU_KIB"\n`,
          ].join(""),
        ],
      ] as const) {
        const executable = join(bin, name);
        writeFileSync(executable, body);
        chmodSync(executable, 0o700);
      }
      const cacheParent = join(root, ".cache");
      const cache = join(cacheParent, "zig");
      const marker = join(cache, "entry");
      const fillCache = () => {
        mkdirSync(cache, { recursive: true });
        writeFileSync(marker, "entry");
      };
      const env = {
        ...process.env,
        HOME: root,
        OSEO_TEST_ACCOUNT_HOME: root,
        OSEO_TEST_DU_LOG: duLog,
        OSEO_TEST_FREE_KIB: "100000000",
        OSEO_RUNNER_ROOT: runner,
        OSEO_ZIG_CACHE_CAP_GIB: "2",
        PATH: `${bin}:${process.env.PATH ?? ""}`,
      };
      const cleanup = "tools/selfhosted-mac/cleanup.sh";
      const run = (
        phase: string,
        overrides: Readonly<Record<string, string>>,
      ) => {
        rmSync(duLog, { force: true });
        const result = spawnSync("/bin/bash", [cleanup, phase], {
          encoding: "utf8",
          env: { ...env, ...overrides },
        });
        assert.equal(result.status, 0, result.stderr);
        const duCalls = existsSync(duLog)
          ? readFileSync(duLog, "utf8").trim().split("\n")
          : [];
        return { ...result, duCalls };
      };

      fillCache();
      const real = run("started", {});
      assert.ok(existsSync(marker));
      assert.deepEqual(real.duCalls, [`${cacheParent} -skPx zig`]);
      assert.doesNotMatch(real.stdout, /Pruned Zig cache/u);
      assert.equal(real.stderr, "");

      const atCap = run("completed", { OSEO_TEST_DU_KIB: "2097152" });
      assert.ok(existsSync(marker));
      assert.doesNotMatch(atCap.stdout, /Pruned Zig cache/u);

      for (const phase of ["started", "completed"]) {
        fillCache();
        const over = run(phase, { OSEO_TEST_DU_KIB: "2097153" });
        assert.ok(!existsSync(cache));
        assert.ok(existsSync(cacheParent));
        assert.match(
          over.stdout,
          /Pruned Zig cache because it exceeded the 2 GiB cap/u,
        );
      }

      fillCache();
      const defaultCap = run("completed", {
        OSEO_TEST_DU_KIB: String(30 * 1048576),
        OSEO_ZIG_CACHE_CAP_GIB: "",
      });
      assert.ok(existsSync(marker));
      assert.doesNotMatch(defaultCap.stdout, /Pruned Zig cache/u);
      for (const invalid of ["0", "-1", "1.5", "30GiB", "39", "100"]) {
        fillCache();
        const result = run("completed", {
          OSEO_TEST_DU_KIB: String(30 * 1048576 + 1),
          OSEO_ZIG_CACHE_CAP_GIB: invalid,
        });
        assert.match(result.stderr, /using the 30 GiB default/u);
        assert.match(result.stdout, /exceeded the 30 GiB cap/u);
        assert.ok(!existsSync(cache));
      }

      fillCache();
      const failed = run("completed", { OSEO_TEST_DU_KIB: "fail" });
      assert.ok(existsSync(marker));
      assert.match(failed.stderr, /size measurement failed/u);

      const lowFree = run("completed", {
        OSEO_TEST_DU_KIB: "1",
        OSEO_TEST_FREE_KIB: "100",
      });
      assert.ok(!existsSync(cache));
      assert.deepEqual(lowFree.duCalls, []);
      assert.match(
        lowFree.stdout,
        /Pruned Zig cache because free disk fell below 40 GiB/u,
      );

      const externalCache = join(external, "zig");
      const externalMarker = join(externalCache, "keep");
      mkdirSync(externalCache);
      writeFileSync(externalMarker, "keep");
      symlinkSync(externalCache, cache);
      const linkedCache = run("completed", { OSEO_TEST_DU_KIB: "9999999999" });
      assert.ok(existsSync(externalMarker));
      assert.deepEqual(linkedCache.duCalls, []);
      assert.match(linkedCache.stderr, /unsafe home or cache path/u);
      rmSync(cache);

      rmSync(cacheParent, { recursive: true });
      symlinkSync(external, cacheParent);
      const linkedParent = run("completed", {
        OSEO_TEST_DU_KIB: "9999999999",
      });
      assert.ok(existsSync(externalMarker));
      assert.deepEqual(linkedParent.duCalls, []);
      assert.match(linkedParent.stderr, /unsafe home or cache path/u);
      rmSync(cacheParent);

      const otherHome = join(root, "other-home");
      const otherCache = join(otherHome, ".cache", "zig");
      mkdirSync(otherCache, { recursive: true });
      writeFileSync(join(otherCache, "keep"), "keep");
      fillCache();
      const otherAccount = run("completed", {
        HOME: otherHome,
        OSEO_TEST_DU_KIB: "9999999999",
      });
      assert.ok(existsSync(join(otherCache, "keep")));
      assert.ok(existsSync(marker));
      assert.deepEqual(otherAccount.duCalls, []);
      assert.match(otherAccount.stderr, /unsafe home or cache path/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  },
);

test(
  "Mac service setup repairs parent and credential permissions",
  {
    skip: process.platform === "win32" ? "requires Bash" : false,
  },
  () => {
    const root = mkdtempSync(join(tmpdir(), "oseo-mac-service-"));
    try {
      const home = join(root, "home");
      const runner = join(home, "actions-runner");
      const prefix = join(root, "usr", "local");
      mkdirSync(runner, { recursive: true, mode: 0o755 });
      mkdirSync(prefix, { recursive: true, mode: 0o700 });
      writeFileSync(join(runner, ".credentials"), "token");
      writeFileSync(join(runner, ".credentials_rsaparams"), "key");
      chmodSync(join(runner, ".credentials"), 0o644);
      chmodSync(join(runner, ".credentials_rsaparams"), 0o644);
      const owner = userInfo().username;
      const group = spawnSync("id", ["-gn"], {
        encoding: "utf8",
      }).stdout.trim();
      const args = [
        "tools/selfhosted-mac/prepare-service-files.sh",
        runner,
        home,
        owner,
        group,
        prefix,
        owner,
        group,
        "tools/selfhosted-mac",
      ];
      const result = spawnSync("bash", args, { encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      for (const directory of [
        prefix,
        join(prefix, "libexec"),
        join(prefix, "libexec", "oseo-runner"),
      ]) {
        assert.equal(statSync(directory).mode & 0o777, 0o755);
      }
      for (const directory of [home, runner, join(runner, "oseo-temp")]) {
        assert.equal(statSync(directory).mode & 0o777, 0o700);
      }
      for (const name of [".credentials", ".credentials_rsaparams"]) {
        assert.equal(statSync(join(runner, name)).mode & 0o777, 0o600);
      }
      for (const name of ["job-started.sh", "job-completed.sh", "cleanup.sh"]) {
        assert.equal(
          statSync(join(prefix, "libexec", "oseo-runner", name)).mode & 0o777,
          0o555,
        );
      }
      const linkedTarget = join(root, "linked-target");
      mkdirSync(linkedTarget, { mode: 0o755 });
      rmSync(join(runner, "oseo-temp"), { recursive: true });
      symlinkSync(linkedTarget, join(runner, "oseo-temp"));
      const linked = spawnSync("bash", args, { encoding: "utf8" });
      assert.notEqual(linked.status, 0);
      assert.equal(statSync(linkedTarget).mode & 0o777, 0o755);
      const relative = spawnSync(
        "bash",
        [
          "tools/selfhosted-mac/prepare-service-files.sh",
          ".",
          ...args.slice(2),
        ],
        { encoding: "utf8" },
      );
      assert.notEqual(relative.status, 0);
      assert.match(relative.stderr, /absolute non-system roots/u);
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
    const installer = "tools/selfhosted-mac/install-service.sh";
    const defaultCap = spawnSync("bash", [installer, "--dry-run"], {
      encoding: "utf8",
      env,
    });
    assert.match(defaultCap.stdout, /with a 30 GiB Zig cache cap/u);
    const configuredCap = spawnSync("bash", [installer, "--dry-run"], {
      encoding: "utf8",
      env: { ...env, OSEO_ZIG_CACHE_CAP_GIB: "24" },
    });
    assert.match(configuredCap.stdout, /with a 24 GiB Zig cache cap/u);
    for (const invalid of ["0", "1.5", "30GiB", "39", "10000"]) {
      const rejected = spawnSync("bash", [installer, "--dry-run"], {
        encoding: "utf8",
        env: { ...env, OSEO_ZIG_CACHE_CAP_GIB: invalid },
      });
      assert.equal(rejected.status, 2, invalid);
      assert.match(rejected.stderr, /whole number of GiB/u);
    }
  },
);
