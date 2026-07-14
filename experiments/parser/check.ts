import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

interface Observation {
  readonly output: string;
  readonly milliseconds: number;
}

interface ParsedBytePosition {
  readonly byte: number;
}

interface ParsedByteRange {
  readonly start: ParsedBytePosition;
  readonly end: ParsedBytePosition;
}

interface ParsedParameter {
  readonly range: ParsedByteRange;
}

interface ParsedStatement {
  readonly jsdoc?: string;
  readonly parameters?: readonly ParsedParameter[];
}

interface ParsedDiagnostic {
  readonly code: string;
}

interface ParsedFile {
  readonly sourceId: string;
  readonly statements: readonly ParsedStatement[];
  readonly diagnostics: readonly ParsedDiagnostic[];
}

interface StartupObservation {
  readonly nodeMilliseconds: number;
  readonly denoMilliseconds: number;
}

interface ParserStartupObservations {
  readonly babel: StartupObservation;
  readonly acorn: StartupObservation;
}

interface CapabilityObservation {
  readonly babelJsdocAttached: boolean;
  readonly acornJsdocAttached: boolean;
  readonly babelRecoverableStatements: number;
  readonly acornRecoverableStatements: number;
  readonly acornJsdocParameterRangeValid: boolean;
}

type ParserCandidate = "babel" | "acorn";
type HostComparison = readonly [Observation, Observation];

const root = new URL("../../", import.meta.url).pathname;
const probe = new URL("./probe.ts", import.meta.url).pathname;
const hostProbe = new URL("../host/probe.ts", import.meta.url).pathname;

function run(command: string, args: readonly string[]): Observation {
  const started = performance.now();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
  const milliseconds = performance.now() - started;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(
        " ",
      )} failed (${result.status}):\n${result.stderr}`,
    );
  }
  return { output: result.stdout, milliseconds };
}

function compareHosts(script: string, args: readonly string[]): HostComparison {
  const node = run(process.execPath, [script, ...args]);
  const deno = run("deno", [
    "run",
    "--quiet",
    "--node-modules-dir=manual",
    script,
    ...args,
  ]);
  if (node.output !== deno.output) {
    const directory = mkdtempSync(join(tmpdir(), "oseo-parser-diff-"));
    writeFileSync(join(directory, "node.json"), node.output);
    writeFileSync(join(directory, "deno.json"), deno.output);
    throw new Error(`host outputs differ; retained at ${directory}`);
  }
  return [node, deno] as const;
}

const [hostNode, hostDeno] = compareHosts(hostProbe, []);
function observeParser(candidate: ParserCandidate): StartupObservation {
  const [node, deno] = compareHosts(probe, [candidate]);
  return {
    nodeMilliseconds: Number(node.milliseconds.toFixed(2)),
    denoMilliseconds: Number(deno.milliseconds.toFixed(2)),
  };
}

const observations: ParserStartupObservations = {
  babel: observeParser("babel"),
  acorn: observeParser("acorn"),
};

function inspectCapabilities(): CapabilityObservation {
  const directory = mkdtempSync(join(tmpdir(), "oseo-parser-check-"));
  try {
    const babelFile = join(directory, "babel.json");
    writeFileSync(babelFile, run(process.execPath, [probe, "babel"]).output);
    const acornFile = join(directory, "acorn.json");
    writeFileSync(acornFile, run(process.execPath, [probe, "acorn"]).output);
    const babel = JSON.parse(
      readFileSync(babelFile, "utf8"),
    ) as readonly ParsedFile[];
    const acorn = JSON.parse(
      readFileSync(acornFile, "utf8"),
    ) as readonly ParsedFile[];
    const invalid = babel.find((file) => file.sourceId === "invalid.ts");
    const unsupported = babel.find(
      (file) => file.sourceId === "unsupported.ts",
    );
    if (!invalid?.diagnostics.some((entry) => entry.code === "OSEO0001")) {
      throw new Error("invalid source did not produce OSEO0001");
    }
    if (!unsupported?.diagnostics.some((entry) => entry.code === "OSEO1001")) {
      throw new Error("unsupported source did not produce OSEO1001");
    }
    const babelJsdoc = babel.find((file) => file.sourceId === "jsdoc.js");
    if (babelJsdoc?.statements[0]?.jsdoc == null) {
      throw new Error("Babel did not attach the JSDoc fixture");
    }
    const acornParameter = acorn.find((file) => file.sourceId === "jsdoc.js")
      ?.statements[0]?.parameters?.[0];
    return {
      babelJsdocAttached: true,
      acornJsdocAttached:
        acorn.find((file) => file.sourceId === "jsdoc.js")?.statements[0]
          ?.jsdoc != null,
      babelRecoverableStatements:
        babel.find((file) => file.sourceId === "recoverable.ts")?.statements
          .length ?? 0,
      acornRecoverableStatements:
        acorn.find((file) => file.sourceId === "recoverable.ts")?.statements
          .length ?? 0,
      acornJsdocParameterRangeValid:
        acornParameter != null &&
        acornParameter.range.end.byte >= acornParameter.range.start.byte,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const capabilitySummary = JSON.stringify(inspectCapabilities());

const denoVersion = run("deno", ["--version"]).output.split("\n")[0];
const aubeVersion = run("aube", ["--version"]).output.trim();
console.log(`node=${process.version} ${denoVersion} aube=${aubeVersion}`);
console.log(
  "parsers=@babel/parser@8.0.4, acorn@8.17.0, acorn-typescript@1.4.13",
);
console.log("host probe: Node and Deno outputs match");
console.log(
  "parser probe: Node and Deno outputs match for Babel and Acorn TypeScript",
);
console.log(`candidate capabilities: ${capabilitySummary}`);
console.log(
  `startup observations (single cold process, ms): ${JSON.stringify(
    observations,
  )}`,
);
console.log(
  `host startup observations (ms): node=${hostNode.milliseconds.toFixed(
    2,
  )} deno=${hostDeno.milliseconds.toFixed(2)}`,
);
