import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parse, stringify } from "yaml";
import type { StructuredDataValue } from "./structured-data.ts";
import { parsedMapping } from "./structured-data.ts";
import { isString } from "./value-kinds.ts";
import { macosJobCosts } from "./macos-job-costs.ts";

/** A single existing job, assigned to one capacity lane. */
export interface MacosLaneJob {
  readonly id: string;
  readonly name: string;
  readonly sourceId: string;
  readonly matrix: Readonly<Record<string, StructuredDataValue>>;
  readonly os: string;
  readonly seconds: number;
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
  if (jobs.length !== Object.keys(macosJobCosts).length) {
    throw new Error("Measured cost table has stale jobs");
  }
  return jobs;
}

/** LPT on five slots; equal costs use names, equal loads use lane index. */
export function macosLanes(): readonly (readonly MacosLaneJob[])[] {
  const lanes: MacosLaneJob[][] = Array.from({ length: 5 }, () => []);
  const loads = [0, 0, 0, 0, 0];
  const jobs = macosJobs().toSorted(
    (a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name, "en"),
  );
  for (const job of jobs) {
    const index = loads.indexOf(Math.min(...loads));
    lanes[index]!.push(job);
    loads[index]! += job.seconds;
  }
  return lanes;
}

/** Generate explicit lane jobs, retaining the template's step text. */
export function generateMacosWorkflow(template: string): string {
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
  for (const [laneIndex, lane] of macosLanes().entries()) {
    generated.push(`  # macOS lane ${laneIndex + 1}, longest jobs first.`);
    for (const [index, job] of lane.entries()) {
      let block = blocks.get(job.sourceId)!;
      // A one-entry matrix binds the unchanged commands and artifact names.
      // Dependencies belong to the explicit job, never to a matrix entry.
      block = block.replace(/^  \w+:/, `  ${job.id}:`);
      block = block.replace(/^    name: >-\n(?:      [^\n]*\n)+/m, "");
      block = block.replace(/^    name: [^\n]*\n/m, "");
      block = block.replace(
        /^    runs-on: [^\n]*\n/m,
        `    name: ${job.name}\n    runs-on: ${job.os}\n`,
      );
      const matrix = stringify({ include: [job.matrix] }, { lineWidth: 80 })
        .trimEnd()
        .split("\n")
        .map((line) => `        ${line}`)
        .join("\n");
      block = block.replace(
        /^    strategy:\n[\s\S]*?(?=^    (?:env|steps):)/m,
        `    strategy:\n      fail-fast: false\n      matrix:\n${matrix}\n`,
      );
      const predecessor = lane[index - 1];
      block = block.replace(
        /^    runs-on: [^\n]*\n/m,
        (line) =>
          `${line}    if: \${{ !cancelled() }}\n` +
          (predecessor == null ? "" : `    needs: ${predecessor.id}\n`),
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

if (
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const expected = generateMacosWorkflow(await readFile(templatePath, "utf8"));
  // Parse as well as compare, so malformed template changes fail locally.
  parse(expected);
  if (process.argv.includes("--check")) {
    if ((await readFile(workflowPath, "utf8")) !== expected) {
      throw new Error(
        "Workflow is stale; edit tools/main-workflow.template.yaml, " +
          "then run mise run generate:macos-lanes",
      );
    }
  } else {
    await writeFile(workflowPath, expected);
  }
}
