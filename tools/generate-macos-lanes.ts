import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";
import type { StructuredDataValue } from "./structured-data.ts";
import { parsedMapping } from "./structured-data.ts";
import { isNumber, isString } from "./value-kinds.ts";
import { configuredSelfHostedLanes } from "./macos-lane-config.ts";
import {
  macosJobCosts,
  macosFixedSetupSeconds,
  selfHostedFamilySpeedRatios,
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

/** Place longer jobs on five hosted and optional weighted Mac lanes. */
export function macosLanes(
  selfHostedCount = 0,
): readonly (readonly MacosLaneJob[])[] {
  if (selfHostedCount !== 0 && selfHostedCount !== 1) {
    throw new Error("Only zero or one self-hosted Mac lane is supported");
  }
  const lanes: MacosLaneJob[][] = Array.from(
    { length: 5 + selfHostedCount },
    () => [],
  );
  const loads: number[] = lanes.map((_, index) =>
    index < 5 ? 0 : selfHostedProbeSeconds,
  );
  const jobs = macosJobs().toSorted(
    (a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name, "en"),
  );
  for (const job of jobs) {
    const eligible =
      job.os === "macos-15" &&
      ["native", "native support", "test262", "own-key cases"].includes(
        job.family,
      )
        ? loads.length
        : 5;
    if (
      job.family === "own-key cases" &&
      selfHostedCount === 1 &&
      eligible !== loads.length
    ) {
      throw new Error("Own-key cases must be Mac-lane eligible together");
    }
    let index = 0;
    let finish = Number.POSITIVE_INFINITY;
    for (let candidate = 0; candidate < eligible; candidate++) {
      // One measured deadline covers all three own-key case shards.
      if (
        job.family === "own-key cases" &&
        selfHostedCount === 1 &&
        candidate !== 5
      )
        continue;
      const ratio = candidate < 5 ? 1 : selfHostedFamilySpeedRatios[job.family];
      if (ratio == null || !Number.isFinite(ratio) || ratio <= 0) {
        throw new Error(`Invalid self-hosted speed ratio: ${job.family}`);
      }
      const elapsed =
        candidate < 5
          ? job.seconds
          : macosFixedSetupSeconds +
            (job.seconds - macosFixedSetupSeconds) / ratio;
      const projected = loads[candidate]! + elapsed;
      if (projected < finish) {
        finish = projected;
        index = candidate;
      }
    }
    if (!Number.isFinite(finish)) {
      throw new Error(`No eligible macOS lane for ${job.name}`);
    }
    lanes[index]!.push(job);
    loads[index] = finish;
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
      const selfHosted = laneIndex >= 5;
      const runnerOutput = `r${laneIndex - 4}`;
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
            ? "    needs:\n      - mac_ready\n"
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

/** The readiness job emits a hosted fallback for each configured Mac lane. */
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
