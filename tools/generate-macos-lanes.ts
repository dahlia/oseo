import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";
import type { StructuredDataValue } from "./structured-data.ts";
import { parsedMapping } from "./structured-data.ts";
import { isNumber, isString } from "./value-kinds.ts";
import { configuredSelfHostedLanes } from "./macos-lane-config.ts";
import {
  hostedFallbackTimeScale,
  macosJobCosts,
  macosFixedSetupSeconds,
  selfHostedFamilySpeedRatios,
  selfHostedJobSeconds,
  selfHostedPairSlowdowns,
  selfHostedProbeSeconds,
} from "./macos-job-costs.ts";

/** A single existing job, assigned to one capacity lane. */
export interface MacosLaneJob {
  readonly id: string;
  readonly name: string;
  readonly sourceId: string;
  readonly matrix: Readonly<Record<string, StructuredDataValue>>;
  readonly os: string;
  readonly seconds: number;
  readonly family: string;
}

const templatePath = "tools/main-workflow.template.yaml";
const workflowPath = ".github/workflows/main.yaml";

/** Enumerate every macOS matrix entry without changing its workload. */
export function macosJobs(): readonly MacosLaneJob[] {
  const jobs: MacosLaneJob[] = [];
  function add(
    sourceId: string,
    suffix: string,
    name: string,
    matrix: Readonly<Record<string, StructuredDataValue>>,
    os = "macos-15",
  ): void {
    const seconds = Object.entries(macosJobCosts).find(
      ([key]) => key === name,
    )?.[1];
    if (seconds == null) throw new Error(`Missing measured cost: ${name}`);
    jobs.push({
      id: `${sourceId}_macos_${suffix}`,
      sourceId,
      name,
      matrix,
      os,
      seconds,
      family:
        sourceId === "test_property_case"
          ? "own-key cases"
          : sourceId === "test_native_support"
            ? "native support"
            : sourceId === "test_sanitizer_macos"
              ? "host C sanitizers"
              : sourceId === "test_test262"
                ? "test262"
                : sourceId === "test_native"
                  ? "native"
                  : "test",
    });
  }
  for (const runtime of ["node", "deno"]) {
    add(
      "test",
      runtime,
      `test (macos-latest, ${runtime})`,
      {
        os: "macos-latest",
        runtime,
      },
      "macos-latest",
    );
  }
  for (let shard = 1; shard <= 3; shard++) {
    add("test_native", String(shard), `native (macos-aarch64, ${shard}/3)`, {
      platform: { os: "macos-15", target: "macos-aarch64" },
      shard,
    });
  }
  for (const suite of ["native", "property"]) {
    add("test_sanitizer_macos", suite, `host C sanitizers (macOS, ${suite})`, {
      suite,
    });
  }
  for (const [sourceId, family] of [
    ["test_test262", "test262"],
    ["test_native_support", "native support"],
  ] as const) {
    for (let shard = 1; shard <= 12; shard++) {
      add(sourceId, String(shard), `${family} (macos-aarch64, ${shard}/12)`, {
        os: "macos-15",
        target: "macos-aarch64",
        shard,
        total: 12,
      });
    }
  }
  for (let caseShard = 1; caseShard <= 3; caseShard++) {
    add(
      "test_property_case",
      String(caseShard),
      `own-key cases (macos-aarch64, ${caseShard}/3)`,
      {
        os: "macos-15",
        target: "macos-aarch64",
        caseShard,
      },
    );
  }
  if (jobs.length !== Object.keys(macosJobCosts).length) {
    throw new Error("macOS cost table has stale jobs");
  }
  return jobs;
}

/** Whether a job may run on a Zig-only self-hosted Mac lane. */
function selfHostedEligible(job: MacosLaneJob): boolean {
  return (
    job.os === "macos-15" &&
    ["native", "native support", "test262", "own-key cases"].includes(
      job.family,
    )
  );
}

/** Hosted lanes precede the optional Mac lanes in lane order. */
const hostedLaneCount = 5;

/**
 * Mac-lane families whose jobs run fast-check properties under the
 * ordinary interrupt limits and therefore widen those limits when their
 * lane falls back to hosted. Own-key case shards are excluded on purpose:
 * their duration record pins the original limit, which
 * `check:property-case-durations` requires. Test262 and native fixture
 * jobs run no property.
 */
const hostedFallbackFamilies: ReadonlySet<string> = new Set(["native support"]);

/**
 * Job-level environment that widens only the interrupt limit of a Mac-lane
 * property job that the readiness probe sent to hosted `macos-15`. The
 * probe output is a JSON runner label array on a selected Mac lane and the
 * hosted JSON string, or empty when the probe was skipped, otherwise.
 */
function hostedFallbackEnvironment(
  job: MacosLaneJob,
  runnerOutput: string,
): string {
  if (!hostedFallbackFamilies.has(job.family)) return "";
  return (
    "    env:\n" +
    "      OSEO_PROPERTY_TIME_SCALE: >-\n" +
    `        \${{ contains(needs.mac_ready.outputs.${runnerOutput},` +
    " 'self-hosted')\n" +
    `        && '1' || '${hostedFallbackTimeScale}' }}\n`
  );
}

/** Mac lanes share one machine; concurrency beyond two was not measured. */
const maxSelfHostedLanes = 2;

/** Seconds a job takes on one runner class, before Mac-lane overlap. */
export type MacosJobSeconds = (
  job: MacosLaneJob,
  selfHosted: boolean,
) => number;

/**
 * The generator's cost model: a hosted job takes its hosted median, and a
 * Mac job its measured Mac median or its hosted median converted by the
 * family ratio after the fixed setup share.
 */
export const modeledJobSeconds: MacosJobSeconds = (job, selfHosted) => {
  if (!selfHosted) return job.seconds;
  const ratio = selfHostedFamilySpeedRatios[job.family];
  if (ratio == null || !Number.isFinite(ratio) || ratio <= 0) {
    throw new Error(`Invalid self-hosted speed ratio: ${job.family}`);
  }
  const measured = Object.entries(selfHostedJobSeconds).find(
    ([key]) => key === job.name,
  )?.[1];
  return (
    measured ??
    macosFixedSetupSeconds + (job.seconds - macosFixedSetupSeconds) / ratio
  );
};

/** The derived slowdown of `job` while `partner` runs on the other lane. */
function pairSlowdown(job: MacosLaneJob, partner: MacosLaneJob): number {
  const factor = selfHostedPairSlowdowns[job.family]?.[partner.family];
  if (factor == null || !Number.isFinite(factor) || factor < 1) {
    throw new Error(
      `Invalid Mac pair slowdown: ${job.family} beside ${partner.family}`,
    );
  }
  return factor;
}

/**
 * Derived end times, in seconds after the run starts, of Mac lanes on one
 * machine. Every lane starts after the readiness allowance and runs its
 * jobs back to back. While both lanes are busy, each job advances at its
 * one-lane speed divided by its pair slowdown; a lane running alone, after
 * the other finished, advances at one-lane speed. One lane is a plain sum.
 */
export function selfHostedLaneEnds(
  lanes: readonly (readonly MacosLaneJob[])[],
  seconds: MacosJobSeconds = modeledJobSeconds,
): readonly number[] {
  if (lanes.length > maxSelfHostedLanes) {
    throw new Error("More than two Mac lanes were not measured");
  }
  const ends = lanes.map(() => selfHostedProbeSeconds);
  const next = lanes.map(() => 0);
  const remaining = lanes.map(() => 0);
  function start(lane: number): void {
    const job = lanes[lane]![next[lane]!];
    remaining[lane] = job == null ? 0 : seconds(job, true);
  }
  lanes.forEach((_, lane) => start(lane));
  let now = selfHostedProbeSeconds;
  for (;;) {
    const active = lanes
      .map((_, lane) => lane)
      .filter((lane) => next[lane]! < lanes[lane]!.length);
    if (active.length === 0) return ends;
    const rates = active.map((lane) => {
      const partnerLane = active.find((other) => other !== lane);
      if (partnerLane == null) return 1;
      const job = lanes[lane]![next[lane]!]!;
      const partner = lanes[partnerLane]![next[partnerLane]!]!;
      return 1 / pairSlowdown(job, partner);
    });
    const step = Math.min(
      ...active.map((lane, index) => remaining[lane]! / rates[index]!),
    );
    now += step;
    for (const [index, lane] of active.entries()) {
      remaining[lane] = remaining[lane]! - step * rates[index]!;
      // Tolerate rounding so a job ending in this step cannot linger.
      if (remaining[lane]! <= 1e-6) {
        next[lane] = next[lane]! + 1;
        ends[lane] = now;
        start(lane);
      }
    }
  }
}

/**
 * Derived end time of every lane, hosted lanes first, under one cost
 * function. Hosted lanes run their jobs back to back from the start.
 */
export function macosLaneEnds(
  lanes: readonly (readonly MacosLaneJob[])[],
  seconds: MacosJobSeconds = modeledJobSeconds,
): readonly number[] {
  return [
    ...lanes
      .slice(0, hostedLaneCount)
      .map((lane) => lane.reduce((sum, job) => sum + seconds(job, false), 0)),
    ...selfHostedLaneEnds(lanes.slice(hostedLaneCount), seconds),
  ];
}

/**
 * Place longer jobs on five hosted and optional Mac lanes.
 *
 * With a Mac lane, the own-key case shards are placed first: they must
 * share one Mac lane, the first, so that one readiness decision gives
 * their duration sum one runner class, and placing them by weight would
 * leave that lane no room for them after the longer jobs had filled it.
 * Each job then goes to the candidate lane with the earliest derived end
 * among the lanes the placement changes: the candidate itself and, on a
 * Mac lane, any other Mac lane that the new overlap delays.
 */
export function macosLanes(
  selfHostedCount = 0,
): readonly (readonly MacosLaneJob[])[] {
  if (
    !Number.isInteger(selfHostedCount) ||
    selfHostedCount < 0 ||
    selfHostedCount > maxSelfHostedLanes
  ) {
    throw new Error("Only zero, one, or two self-hosted Mac lanes");
  }
  const lanes: MacosLaneJob[][] = Array.from(
    { length: hostedLaneCount + selfHostedCount },
    () => [],
  );
  const loads: number[] = lanes.map(() => 0);
  const all = macosJobs();
  for (const name of Object.keys(selfHostedJobSeconds)) {
    const job = all.find((candidate) => candidate.name === name);
    if (job == null || !selfHostedEligible(job)) {
      throw new Error(`Stale self-hosted measurement: ${name}`);
    }
  }
  const pinned = (job: MacosLaneJob): number =>
    selfHostedCount > 0 && job.family === "own-key cases" ? 0 : 1;
  const jobs = all.toSorted(
    (a, b) =>
      pinned(a) - pinned(b) ||
      b.seconds - a.seconds ||
      a.name.localeCompare(b.name, "en"),
  );
  let macEnds = selfHostedLaneEnds(lanes.slice(hostedLaneCount));
  for (const job of jobs) {
    const eligible = selfHostedEligible(job) ? lanes.length : hostedLaneCount;
    if (
      job.family === "own-key cases" &&
      selfHostedCount > 0 &&
      eligible !== lanes.length
    ) {
      throw new Error("Own-key cases must be Mac-lane eligible together");
    }
    let index = 0;
    let finish = Number.POSITIVE_INFINITY;
    let chosenMacEnds = macEnds;
    for (let candidate = 0; candidate < eligible; candidate++) {
      // One measured deadline covers all three own-key case shards.
      if (
        job.family === "own-key cases" &&
        selfHostedCount > 0 &&
        candidate !== hostedLaneCount
      )
        continue;
      let projected: number;
      let candidateMacEnds = macEnds;
      if (candidate < hostedLaneCount) {
        projected = loads[candidate]! + modeledJobSeconds(job, false);
      } else {
        const mac = lanes
          .slice(hostedLaneCount)
          .map((lane, offset) =>
            offset === candidate - hostedLaneCount ? lane.concat([job]) : lane,
          );
        candidateMacEnds = selfHostedLaneEnds(mac);
        projected = Math.max(
          ...candidateMacEnds.filter(
            (end, offset) =>
              offset === candidate - hostedLaneCount || end > macEnds[offset]!,
          ),
        );
      }
      if (projected < finish) {
        finish = projected;
        index = candidate;
        chosenMacEnds = candidateMacEnds;
      }
    }
    if (!Number.isFinite(finish)) {
      throw new Error(`No eligible macOS lane for ${job.name}`);
    }
    lanes[index]!.push(job);
    if (index < hostedLaneCount) loads[index] = finish;
    else macEnds = chosenMacEnds;
  }
  return lanes;
}

/** Bind existing matrix expressions without creating a matrix check name. */
function bindMatrix(
  source: string,
  matrix: Readonly<Record<string, StructuredDataValue>>,
): string {
  function scalar(path: string): string | number {
    let value: StructuredDataValue | undefined = matrix;
    for (const key of path.split(".")) {
      value = parsedMapping(value, `Matrix path ${path}`)[key];
    }
    if (!isString(value) && !isNumber(value)) {
      throw new Error(`Matrix expression is not scalar: ${path}`);
    }
    return value;
  }
  const conditionalStep = new RegExp(
    "^      - if: matrix\\.([\\w.]+) == ('[^']*'|\\d+)\\n" +
      "[\\s\\S]*?(?=^      - |$(?![\\s\\S]))",
    "gm",
  );
  return source
    .replace(conditionalStep, (step: string, path: string, literal: string) => {
      const expected = literal.startsWith("'")
        ? literal.slice(1, -1)
        : Number(literal);
      return scalar(path) === expected
        ? step.replace(/^      - if:[^\n]*\n        /, "      - ")
        : "";
    })
    .replace(/\$\{\{ matrix\.([\w.]+) }}/g, (_, path: string) =>
      String(scalar(path)),
    )
    .replace(/\bmatrix\.([\w.]+)/g, (_, path: string) => {
      const value = scalar(path);
      return isString(value)
        ? `'${value.replaceAll("'", "''")}'`
        : String(value);
    });
}

/** Generate explicit lane jobs, retaining the template's step text. */
export function generateMacosWorkflow(
  template: string,
  selfHostedCount = 0,
): string {
  const blocks = new Map<string, string>();
  for (const match of template.matchAll(
    /^  (\w+):\n[\s\S]*?(?=^  \w+:|$(?![\s\S]))/gm,
  )) {
    blocks.set(match[1]!, match[0]);
  }
  let output = template;
  // Preserve Linux/Windows matrix jobs verbatim apart from macOS entries.
  for (const [id, block] of blocks) {
    let linux = block;
    if (id === "test_sanitizer_macos") linux = "";
    else {
      linux = linux.replace(/^          - macos-latest\n/m, "");
      linux = linux.replace(
        /^          - os: macos-15\n(?:            [^\n]*\n)+/gm,
        "",
      );
    }
    output = output.replace(block, linux);
  }
  const workflow = parsedMapping(parse(template), "Workflow template");
  const jobs = parsedMapping(workflow.jobs, "Workflow jobs");
  const native = parsedMapping(jobs.native, "Native aggregate");
  const nativeIds = native.needs;
  if (!Array.isArray(nativeIds) || !nativeIds.every(isString)) {
    throw new Error("Native aggregate needs must be job IDs");
  }
  const required = [
    ...nativeIds,
    ...macosJobs()
      .filter((job) => nativeIds.includes(job.sourceId))
      .map((job) => job.id),
  ];
  const aggregateSteps = [
    "    steps:",
    "      - name: Require every native and test262 shard",
    "        env:",
    "          RESULTS: ${{ toJSON(needs.*.result) }}",
    "        run: |",
    "          node -e '",
    "            const results = JSON.parse(process.env.RESULTS);",
    "            const success = results.length > 0 &&",
    '              results.every(result => result === "success");',
    "            process.exit(success ? 0 : 1);",
    "          '",
    "      - uses: actions/checkout@v7",
    "      - uses: jdx/mise-action@v4",
    "        with:",
    "          install: true",
    "      - uses: actions/download-artifact@v7",
    "        with:",
    "          pattern: own-key-duration-*",
    "          path: ${{ runner.temp }}/property-case-durations",
    "      - run: >-",
    "          mise run check:property-case-durations",
    '          "${{ runner.temp }}/property-case-durations"',
    "",
  ].join("\n");
  const aggregate = blocks
    .get("native")!
    .replace(
      /^    needs:\n(?:      - [^\n]*\n)+/m,
      "    needs:\n" + required.map((id) => `      - ${id}\n`).join(""),
    )
    .replace(/^    steps:\n[\s\S]*/m, aggregateSteps);
  output = output.replace(blocks.get("native")!, aggregate);
  const generated: string[] = [];
  if (selfHostedCount > 0) {
    generated.push(selfHostedAvailabilityJob(selfHostedCount));
  }
  for (const [laneIndex, lane] of macosLanes(selfHostedCount).entries()) {
    generated.push(`  # macOS lane ${laneIndex + 1}, longest jobs first.`);
    for (const [index, job] of lane.entries()) {
      let block = blocks.get(job.sourceId)!;
      // GitHub appends matrix values to names without matrix expressions.
      // Bind values directly so required check names remain unchanged.
      block = block.replace(/^  \w+:/, `  ${job.id}:`);
      block = block.replace(/^    name: >-\n(?:      [^\n]*\n)+/m, "");
      block = block.replace(/^    name: [^\n]*\n/m, "");
      const selfHosted = laneIndex >= hostedLaneCount;
      const runnerOutput = `r${laneIndex - hostedLaneCount + 1}`;
      const runner = selfHosted
        ? `\${{ fromJSON(needs.mac_ready.outputs.${runnerOutput}` +
          ` || '"macos-15"') }}`
        : job.os;
      block = block.replace(
        /^    runs-on: [^\n]*\n/m,
        `    name: ${job.name}\n    runs-on: ${runner}\n`,
      );
      block = block.replace(
        /^    strategy:\n[\s\S]*?(?=^    (?:env|steps):)/m,
        "",
      );
      block = bindMatrix(block, job.matrix);
      block = block.replace(
        /^    steps:\n/m,
        "    steps:\n" +
          "      - name: Record macOS host version\n" +
          "        run: sw_vers -productVersion\n",
      );
      const predecessor = lane[index - 1];
      block = block.replace(
        /^    runs-on: [^\n]*\n/m,
        (line) =>
          `${line}    if: \${{ !cancelled() }}\n` +
          (selfHosted
            ? "    needs:\n      - mac_ready\n" +
              hostedFallbackEnvironment(job, runnerOutput)
            : predecessor == null
              ? ""
              : `    needs: ${predecessor.id}\n`),
      );
      generated.push(block.trimEnd(), "");
    }
  }
  return (
    "# Generated by tools/generate-macos-lanes.ts; edit its template.\n" +
    output.trimEnd() +
    "\n\n" +
    generated.join("\n")
  );
}

/**
 * The readiness job emits one runner decision per configured Mac lane: the
 * lane's runner labels when the lane is usable, hosted `macos-15` otherwise.
 * The probe reads runner state with the administration token and the
 * repository's queued and running jobs with the workflow token, which
 * needs `actions: read`, to tell a wedged runner from a busy one.
 */
function selfHostedAvailabilityJob(count: number): string {
  const outputs = Array.from({ length: count }, (_, index) => {
    const key = `r${index + 1}`;
    return `      ${key}: \${{ steps.probe.outputs.${key} }}`;
  }).join("\n");
  return [
    "  mac_ready:",
    "    name: macOS self-hosted availability",
    "    runs-on: ubuntu-latest",
    "    timeout-minutes: 5",
    "    permissions:",
    "      contents: read",
    "      actions: read",
    "    outputs:",
    outputs,
    "    steps:",
    "      - uses: actions/checkout@v7",
    "      - uses: jdx/mise-action@v4",
    "        with:",
    "          install: true",
    "          install_args: node",
    "      - id: probe",
    "        if: >-",
    "          ${{ github.event_name == 'push' &&",
    "              github.repository == 'dahlia/oseo' }}",
    "        env:",
    `          OSEO_SELFHOSTED_LANES: ${count}`,
    "          OSEO_SELFHOSTED_ENABLED: >-",
    "            ${{ vars.OSEO_SELFHOSTED_MAC_ENABLED }}",
    "          OSEO_EVENT: ${{ github.event_name }}",
    "          OSEO_REPOSITORY: ${{ github.repository }}",
    "          OSEO_RUNNER_STATUS_TOKEN: >-",
    "            ${{ secrets.OSEO_RUNNER_STATUS_TOKEN }}",
    "          OSEO_WORKFLOW_TOKEN: ${{ github.token }}",
    "        run: node tools/selfhosted-mac/availability.ts",
    "",
  ].join("\n");
}

if (
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const laneFlag = process.argv.indexOf("--self-hosted-lanes");
  const count =
    laneFlag < 0
      ? configuredSelfHostedLanes
      : Number(process.argv[laneFlag + 1]);
  const expected = generateMacosWorkflow(
    await readFile(templatePath, "utf8"),
    count,
  );
  // Parse as well as compare, so malformed template changes fail locally.
  parse(expected);
  if (process.argv.includes("--check")) {
    if ((await readFile(workflowPath, "utf8")) !== expected) {
      throw new Error(
        `Workflow differs from generated ${count}-Mac-lane output; ` +
          "update tools/macos-lane-config.ts or regenerate the workflow",
      );
    }
  } else if (laneFlag >= 0) {
    process.stdout.write(expected);
  } else {
    await writeFile(workflowPath, expected);
  }
}
