import { ProfilingSession } from "./perf-profile-process.ts";
import type { OwnedRun, RunRecord } from "./perf-profile-process.ts";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { arch, hostname, release } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { discoverProfilingTools, executablePath } from "./perf-profile.ts";
import { buildFixedProfileSmoke } from "./perf-profile-smoke.ts";
import type {
  StructuredDataInput,
  StructuredDataValue,
} from "./structured-data.ts";
import { parsedMapping } from "./structured-data.ts";
import { isNumber, isString } from "./value-kinds.ts";

/** A caller-owned artifact contract, independent of the corpus harness. */
export interface CaptureRequest {
  readonly kind: "existing-artifact" | "synthetic-method-probe";
  readonly executable: string;
  readonly sha256: string;
  readonly inputs: readonly {
    readonly path: string;
    readonly sha256: string;
  }[];
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
  readonly stdinBase64: string;
  readonly stdoutBase64: string;
  readonly stderrBase64: string;
  readonly exitStatus: number;
}

/** A pure, bounded synchronous stdout oracle owned by the caller. */
export interface CaptureStdoutChecker {
  readonly id: string;
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly check: (stdout: Uint8Array) => boolean;
}

function isCheckerFunction<Candidate>(
  value: Candidate,
): value is Candidate & CaptureStdoutChecker["check"] {
  return typeof value === "function";
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Frozen file bytes and filesystem identity. */
export interface FileIdentity {
  readonly path: string;
  readonly realpath: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly mode: number;
}

/** Snapshot bytes, mode and resolved path without modifying the input. */
export function fileIdentity(path: string): FileIdentity {
  const bytes = readFileSync(path);
  return {
    path,
    realpath: realpathSync(path),
    sha256: digest(bytes),
    bytes: bytes.length,
    mode: statSync(path).mode & 0o777,
  };
}

function requiredString(
  value: StructuredDataValue | undefined,
  name: string,
): string {
  if (!isString(value)) throw new Error(`Expected string: ${name}`);
  return value;
}

/** Parse the complete launch contract before executing any caller artifact. */
export function validateCaptureRequest<Candidate>(
  value: StructuredDataInput<Candidate>,
): CaptureRequest {
  const request = parsedMapping(value, "Capture request");
  const kind = request.kind;
  if (kind !== "existing-artifact" && kind !== "synthetic-method-probe") {
    throw new Error("Expected existing-artifact or synthetic-method-probe");
  }
  const executable = requiredString(request.executable, "executable");
  const cwd = requiredString(request.cwd, "cwd");
  const sha256 = requiredString(request.sha256, "sha256");
  const inputs = request.inputs;
  const argv = request.argv;
  const env = parsedMapping(request.env, "Explicit launch environment");
  const exitStatus = request.exitStatus;
  if (
    !isAbsolute(executable) ||
    !isAbsolute(cwd) ||
    !/^[a-f0-9]{64}$/u.test(sha256) ||
    !Array.isArray(inputs) ||
    inputs.length === 0 ||
    !Array.isArray(argv) ||
    !argv.every(isString) ||
    !isNumber(exitStatus) ||
    !Number.isInteger(exitStatus)
  ) {
    throw new Error("Incomplete capture launch, input or byte oracle contract");
  }
  const inputFiles = inputs.map((entry) => {
    const input = parsedMapping(entry, "Frozen source input");
    const path = requiredString(input.path, "input.path");
    const hash = requiredString(input.sha256, "input.sha256");
    if (!isAbsolute(path) || !/^[a-f0-9]{64}$/u.test(hash)) {
      throw new Error("Invalid frozen input path/digest");
    }
    return { path, sha256: hash };
  });
  const environment = Object.fromEntries(
    Object.entries(env).map(([name, entry]) => [
      name,
      requiredString(entry, name),
    ]),
  );
  const base64 = (name: string): string => {
    const text = requiredString(request[name], name);
    if (Buffer.from(text, "base64").toString("base64") !== text) {
      throw new Error(`Expected canonical base64: ${name}`);
    }
    return text;
  };
  return {
    kind,
    executable,
    cwd,
    sha256,
    inputs: inputFiles,
    argv,
    env: environment,
    exitStatus,
    stdinBase64: base64("stdinBase64"),
    stdoutBase64: base64("stdoutBase64"),
    stderrBase64: base64("stderrBase64"),
  };
}

/** Run a smoke build command with owned-group cleanup and raw logs. */
export async function runProfilingCommand(
  directory: string,
  name: string,
  argv: readonly string[],
  cwd: string,
  env: Readonly<Record<string, string>>,
): Promise<RunRecord> {
  const session = new ProfilingSession();
  try {
    return await session.launch(
      directory,
      name,
      argv,
      cwd,
      env,
      Buffer.alloc(0),
      600_000,
    ).done;
  } finally {
    await session.finish();
  }
}

function writeJson<Value>(path: string, value: Value): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

function goodRun(record: RunRecord): boolean {
  return (
    record.status === 0 &&
    record.signal == null &&
    record.error == null &&
    !record.timedOut &&
    record.groupGone
  );
}

/** Stack quality observations, independent of cost attribution. */
export interface StackQuality {
  readonly useful: boolean;
  readonly runtime: boolean;
  readonly generated: boolean;
  readonly unknown: boolean;
  readonly truncated: boolean;
  readonly diagnostics: boolean;
  readonly optimizedOut: boolean;
}

// Native body units prefix generated functions with their source filename.
// Dispatch/fragment/agent wrappers also originate in backend-c, while
// oseo_generated_* helpers are defined in runtime-c and remain runtime.
const generatedBody = new RegExp(
  "^(?:[\\w]+_)?oseo_(?:function_(?:\\d+|script|instantiate|evaluate)|" +
    "generator_body_\\d+\\w*|body_\\w+)$",
  "u",
);
const generatedWrapper = new RegExp(
  "^oseo_(?:dispatch_(?:function|generator)|fragment_location|" +
    "(?:case|harness)_(?:instantiate|evaluate|dispatch|resume)|" +
    "agent_program_\\d+)$",
  "u",
);

function generatedSymbol(symbol: string): boolean {
  return generatedBody.test(symbol) || generatedWrapper.test(symbol);
}

/** Conservative stack evidence; it does not assign time or cost shares. */
export function inspectStack(text: string, platform: string): StackQuality {
  const frames = text
    .split("\n")
    .filter((line) =>
      platform === "linux"
        ? /^#\d+\s/u.test(line)
        : /^\s+[+!:|\s]*\d+\s+.*(?:\(|\[)/u.test(line),
    );
  const symbols = frames.map((line) => {
    // Capture only the symbol field, before arguments, image or source paths.
    const match =
      platform === "linux"
        ? /^#\d+\s+(?:0x[\da-f]+\s+in\s+)?([\w.$]+)(?=\s|\()/iu.exec(line)
        : /^\s+[+!:|\s]*\d+\s+([\w.$]+)(?=\s+\(in\s)/u.exec(line);
    return (match?.[1] ?? "")
      .replace(/\.(?:isra|constprop|part|llvm)\.[\da-f]+$/u, "")
      .replace(/^_oseo_/u, "oseo_");
  });
  const runtime = symbols.some(
    (symbol) => /^oseo_\w+$/u.test(symbol) && !generatedSymbol(symbol),
  );
  const generated = symbols.some(generatedSymbol);
  const unknown = /\?\?|<unknown>|unresolved|unknown frame/iu.test(text);
  const truncated = /#15\s|truncat|incomplete stack/iu.test(text);
  const diagnostics =
    /lost samples|dropped samples|permission denied|failed to|unable to/iu.test(
      text,
    );
  return {
    useful:
      generated && frames.length >= 2 && !unknown && !truncated && !diagnostics,
    runtime,
    generated,
    unknown,
    truncated,
    diagnostics,
    optimizedOut: /<optimized out>/u.test(text),
  };
}

interface MacCallNode {
  readonly indent: number;
  readonly count: number;
  readonly line: number;
  readonly symbol: string;
  readonly image: string;
  readonly proof: boolean;
  readonly unknown: boolean;
  readonly deduplicated: boolean;
  readonly children: MacCallNode[];
}

interface MacImage {
  readonly name: string;
  readonly start: bigint;
  readonly stop: bigint;
}

interface MacSyntheticStack {
  readonly mainThreadReportedStacks: number;
  readonly unknownBranches: number;
  readonly reportedStacksWithUnknown: number;
  readonly deduplicatedBranches: number;
  readonly witnessLines: readonly number[];
  readonly witnessReportedStacks: number;
}

const unknownStackText = /\?\?|<unknown>|unresolved|unknown frame/iu;

function childrenCount(node: MacCallNode): number {
  return node.children.reduce((sum, child) => sum + child.count, 0);
}

/** Validate the recorded call graph and supporting fixed-smoke sections. */
export function inspectHostedMacSyntheticStack(
  report: string,
  imageName: string,
): MacSyntheticStack | undefined {
  if (!report.endsWith("\n")) return undefined;
  const lines = report.split(/\r?\n/u);
  const graph = lines.indexOf("Call graph:");
  const totalHeader =
    "Total number in stack (recursive counted multiple, when >=5):";
  const topHeader = "Sort by top of stack, same collapsed (when >= 5):";
  const end = lines.indexOf(totalHeader);
  const top = lines.indexOf(topHeader);
  const imagesAt = lines.indexOf("Binary Images:");
  if (
    graph < 0 ||
    graph >= end ||
    end >= top ||
    top >= imagesAt ||
    graph !== lines.lastIndexOf("Call graph:") ||
    end !== lines.lastIndexOf(totalHeader) ||
    top !== lines.lastIndexOf(topHeader) ||
    imagesAt !== lines.lastIndexOf("Binary Images:")
  )
    return undefined;

  const images: MacImage[] = [];
  const imageRow = new RegExp(
    "^\\s*(0x[\\da-f]+)\\s+-\\s+(0x[\\da-f]+)\\s+\\+?(\\S+)" +
      "\\s+\\([^()]+\\)\\s+<[\\da-f]{8}(?:-[\\da-f]{4}){3}-[\\da-f]{12}>" +
      "\\s+/\\S(?:[^\\r\\n]*\\S)?$",
    "iu",
  );
  for (const line of lines.slice(imagesAt + 1)) {
    if (line.trim() === "") continue;
    const image = imageRow.exec(line);
    if (!image) return undefined;
    const start = BigInt(image[1]!);
    const stop = BigInt(image[2]!);
    if (stop < start) return undefined;
    images.push({ name: image[3]!, start, stop });
  }
  if (images.filter((image) => image.name === imageName).length !== 1) {
    return undefined;
  }

  const roots: MacCallNode[] = [];
  const parents: MacCallNode[] = [];
  let collapsedUnknown: number | undefined;
  for (const [index, line] of lines.entries()) {
    if (line.trim() === "") continue;
    if (index <= graph || index >= end) {
      if (!unknownStackText.test(line)) continue;
      if (index <= top || index >= imagesAt || collapsedUnknown !== undefined)
        return undefined;
      // Apple prints terminal stack counts again in the collapsed summary.
      const count = /^ {8}\?\?\?\s+\(in <unknown binary>\)\s+(\d+)$/u.exec(
        line,
      )?.[1];
      if (count === undefined) return undefined;
      collapsedUnknown = Number(count);
      if (!Number.isSafeInteger(collapsedUnknown) || collapsedUnknown < 5)
        return undefined;
      continue;
    }
    const row = /^([ +!:|]*)(\d+)\s+(.+)$/u.exec(line);
    if (!row) return undefined;
    const indent = row[1]!.length;
    const count = Number(row[2]!);
    const text = row[3]!;
    if (!Number.isSafeInteger(count) || count <= 0) return undefined;
    while (parents.length > 0 && parents.at(-1)!.indent >= indent) {
      parents.pop();
    }

    const queue = /^Thread_\d+\s+DispatchQueue_\d+: (.+)$/u.exec(text);
    const thread =
      queue !== null &&
      /^com\.apple\.main-thread\s+\(serial\)$/u.test(queue[1]!);
    const frame =
      /^(\S+)\s+\(in (.+?)\)(?:\s+\+ [\d,.]+)?\s+\[([^\]]+)\]$/u.exec(text);
    if (thread !== (parents.length === 0) || (!thread && !frame)) {
      return undefined;
    }
    const symbol = frame?.[1] ?? "";
    const image = frame?.[2] ?? "";
    const addresses = frame?.[3]?.split(",") ?? [];
    const unknown = symbol === "???" && image === "<unknown binary>";
    if (
      (unknownStackText.test(text) && !unknown) ||
      !addresses.every((address) => /^(?:0x[\da-f]+|\.\.\.)$/iu.test(address))
    )
      return undefined;
    // sample prefixes named dynamic-linker stubs with this literal label.
    const named = /^(?:DYLD-STUB\$\$)?[A-Za-z_][\w.$]*$/u.test(symbol);
    const deduplicated = symbol === "<deduplicated_symbol>";
    if (!thread && !named && !deduplicated && !unknown) return undefined;
    const mapsToNamedImage = addresses.every((address) => {
      if (address === "...") return true;
      const pc = BigInt(address);
      const mapped = images.filter(
        ({ start, stop }) => pc >= start && pc <= stop,
      );
      return mapped.length === 1 && mapped[0]!.name === image;
    });
    if ((named || deduplicated) && !mapsToNamedImage) return undefined;
    const node: MacCallNode = {
      indent,
      count,
      line: index + 1,
      symbol,
      image,
      proof: named && !addresses.includes("..."),
      unknown,
      deduplicated,
      children: [],
    };
    const parent = parents.at(-1);
    if (indent !== (parent === undefined ? 4 : parent.indent + 2))
      return undefined;
    if (parent === undefined) roots.push(node);
    else parent.children.push(node);
    parents.push(node);
  }

  if (roots.length !== 1) return undefined;
  const root = roots[0]!;
  if (childrenCount(root) !== root.count) return undefined;
  let unknownBranches = 0;
  let reportedStacksWithUnknown = 0;
  let unknownAtTop = 0;
  let deduplicatedBranches = 0;
  let malformed = false;
  let witness: readonly MacCallNode[] = [];
  const visit = (
    node: MacCallNode,
    chain: readonly MacCallNode[],
    unresolved: boolean,
  ): void => {
    const childCount = childrenCount(node);
    if (childCount > node.count) malformed = true;
    if (node.deduplicated) deduplicatedBranches++;
    if (node.unknown) {
      unknownAtTop += node.count - childCount;
      if (!unresolved) {
        unknownBranches++;
        reportedStacksWithUnknown += node.count;
      }
    }
    const next = [...chain, node];
    if (
      witness.length === 0 &&
      node.children.length === 0 &&
      next[0]?.symbol === "start" &&
      next[0].image === "dyld" &&
      next[1]?.symbol === "main" &&
      next[1].image === imageName &&
      next.every((frame) => frame.proof)
    ) {
      const generated = next.findIndex(
        (frame) =>
          frame.image === imageName &&
          frame.symbol === "oseo_dispatch_function",
      );
      if (
        generated > 2 &&
        next
          .slice(2, generated)
          .some(
            (frame) =>
              frame.image === imageName &&
              frame.symbol === "oseo_call_function",
          ) &&
        next
          .slice(generated + 1)
          .some(
            (frame) =>
              frame.image === imageName &&
              /^oseo_\w+$/u.test(frame.symbol) &&
              !generatedSymbol(frame.symbol),
          )
      )
        witness = next;
    }
    for (const child of node.children)
      visit(child, next, unresolved || node.unknown);
  };
  for (const child of root.children) visit(child, [], false);
  if (
    malformed ||
    witness.length === 0 ||
    (collapsedUnknown !== undefined && collapsedUnknown !== unknownAtTop)
  )
    return undefined;
  return {
    mainThreadReportedStacks: root.count,
    unknownBranches,
    reportedStacksWithUnknown,
    deduplicatedBranches,
    witnessLines: witness.map((frame) => frame.line),
    witnessReportedStacks: witness.at(-1)!.count,
  };
}

interface HostedReport {
  readonly index: number;
  readonly report: string;
  readonly sha256: string;
  readonly evidence: MacSyntheticStack | undefined;
  readonly accepted: boolean;
}

/** One separately launched capture; failed positions stay in the evidence. */
export interface StackCapture {
  readonly index: number;
  readonly status: string;
  readonly record?: RunRecord;
  readonly stack?: StackQuality;
  readonly processMatches?: boolean;
  readonly error?: string;
  readonly targetAliveAtCompletion?: boolean;
  readonly windowComplete?: boolean;
  readonly overlappingCommandIndices?: readonly number[];
}

function captureCommandAccepted(
  capture: Pick<
    StackCapture,
    "record" | "processMatches" | "targetAliveAtCompletion" | "windowComplete"
  >,
  platform: string,
): boolean {
  return (
    capture.record !== undefined &&
    goodRun(capture.record) &&
    capture.processMatches === true &&
    (platform !== "darwin" ||
      (capture.targetAliveAtCompletion === true &&
        capture.windowComplete === true))
  );
}

interface HostedMacSyntheticReportInput {
  readonly image: string;
  readonly pid: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Check one fixed smoke report with the same live-window gate as capture. */
export function inspectHostedMacSyntheticCapture(
  capture: StackCapture,
  report: Buffer,
  { image, pid, stdout, stderr }: HostedMacSyntheticReportInput,
): HostedReport {
  const raw = report.toString("utf8");
  const evidence = inspectHostedMacSyntheticStack(raw, image);
  const extra = inspectStack(stdout + "\n" + stderr, "darwin");
  const pidLines = raw.match(/^Process:[^\r\n]*$/gmu);
  return {
    index: capture.index,
    report: `sample-${capture.index}.txt`,
    sha256: digest(report),
    evidence,
    accepted:
      captureCommandAccepted(capture, "darwin") &&
      evidence !== undefined &&
      report.equals(Buffer.from(raw)) &&
      capture.record?.pid !== pid &&
      pidLines?.length === 1 &&
      new RegExp(`\\[${pid}\\]\\s*$`, "u").test(pidLines[0]!) &&
      capture.stack?.truncated === false &&
      !capture.stack.diagnostics &&
      !extra.unknown &&
      !extra.truncated &&
      !extra.diagnostics,
  };
}

/** Inputs to the owned-target capture phase, also used by process tests. */
export interface OwnedStackCapture {
  readonly target: OwnedRun;
  readonly request: CaptureRequest;
  readonly directory: string;
  readonly profiler: string;
  readonly platform: string;
  readonly execute: (
    name: string,
    argv: readonly string[],
    timeoutMs?: number,
  ) => Promise<RunRecord>;
  readonly interrupted: () => string | null;
  /** Retain completed positions even when a later serial capture throws. */
  readonly captures: StackCapture[];
}

/** Whole capture-phase acceptance, used by the artifact correctness gate. */
export interface StackCaptureResult {
  readonly captures: readonly StackCapture[];
  readonly complete: boolean;
}

function stackCaptureResult(
  captures: readonly StackCapture[],
): StackCaptureResult {
  return {
    captures,
    complete:
      captures.length === 8 &&
      captures.every((capture) => capture.status === "useful-stack") &&
      captures.some((capture) => capture.stack?.runtime === true),
  };
}

/** Collect distinct Mac samplers together; Linux keeps serial GDB stops. */
export async function captureOwnedStacks(
  options: OwnedStackCapture,
): Promise<StackCaptureResult> {
  return await collectOwnedStacks(options);
}

async function collectOwnedStacks(
  {
    target,
    request,
    directory,
    profiler,
    platform,
    execute,
    interrupted,
    captures,
  }: OwnedStackCapture,
  hostedReports?: HostedReport[],
): Promise<StackCaptureResult> {
  const captureOne = async (index: number): Promise<StackCapture> => {
    if (interrupted() != null) throw new Error(`Interrupted: ${interrupted()}`);
    if (target.exited() || target.pid == null) {
      return { index, status: "not-attempted-target-exited" };
    }
    let identityMatches = false;
    if (platform === "linux") {
      try {
        identityMatches =
          fileIdentity(`/proc/${target.pid}/exe`).sha256 === request.sha256;
      } catch {
        // Exit/attach races are retained as failures, never as samples.
      }
    } else {
      const ps = await execute(`identity-${index}`, [
        "/bin/ps",
        "-p",
        String(target.pid),
        "-o",
        "comm=",
      ]);
      identityMatches =
        goodRun(ps) &&
        readFileSync(join(directory, ps.stdout), "utf8").trim() ===
          realpathSync(request.executable);
    }
    if (!identityMatches || target.exited()) {
      return { index, status: "attach-identity-failed" };
    }
    const argv =
      platform === "linux"
        ? [
            profiler,
            "--nx",
            "--nh",
            "--batch",
            "-iex",
            "set auto-load off",
            "-iex",
            "set debuginfod enabled off",
            "-p",
            String(target.pid),
            "-ex",
            "thread apply all bt 16",
            "-ex",
            "detach",
          ]
        : [
            profiler,
            String(target.pid),
            "1",
            "10",
            "-file",
            join(directory, `sample-${index}.txt`),
          ];
    const record = await execute(
      `capture-${index}`,
      argv,
      platform === "linux" ? 5_000 : 20_000,
    );
    const stdout = readFileSync(join(directory, record.stdout), "utf8");
    let raw = stdout;
    let macReport: Buffer | undefined;
    if (platform === "darwin") {
      try {
        macReport = readFileSync(join(directory, `sample-${index}.txt`));
        raw = macReport.toString("utf8");
      } catch {
        raw = "";
      }
    }
    const stderr = readFileSync(join(directory, record.stderr), "utf8");
    const stack = inspectStack(raw + "\n" + stderr, platform);
    const processMatches =
      platform === "linux"
        ? raw.includes(`process ${target.pid}`)
        : new RegExp(`^Process:.*\\[${target.pid}\\]`, "mu").test(raw);
    const targetAliveAtCompletion = !target.exited();
    // Lifecycle duration is only a lower-bound check, not sample coverage.
    const windowComplete =
      platform !== "darwin" ||
      (targetAliveAtCompletion &&
        Date.parse(record.finishedUtc) - Date.parse(record.startedUtc) >=
          1_000 &&
        /^Target Type:\s+live task$/mu.test(raw) &&
        /^Analysis of sampling .* every 10 milliseconds$/mu.test(raw) &&
        /^Binary Images:/mu.test(raw) &&
        stderr.includes("Sampling completed, processing symbols..."));
    const capture: StackCapture = {
      index,
      status:
        captureCommandAccepted(
          { record, processMatches, targetAliveAtCompletion, windowComplete },
          platform,
        ) &&
        stack.useful &&
        (platform !== "darwin" || stack.runtime)
          ? "useful-stack"
          : "failed-or-insufficient-stack",
      record,
      stack,
      processMatches,
    };
    if (platform !== "darwin") return capture;
    const macCapture = { ...capture, targetAliveAtCompletion, windowComplete };
    if (hostedReports !== undefined && macReport !== undefined) {
      hostedReports.push(
        inspectHostedMacSyntheticCapture(macCapture, macReport, {
          image: basename(request.executable),
          pid: target.pid,
          stdout,
          stderr,
        }),
      );
    }
    return macCapture;
  };
  if (platform !== "darwin") {
    for (let index = 0; index < 8; index++) {
      // eslint-disable-next-line no-await-in-loop -- Linux stays serial.
      captures.push(await captureOne(index));
    }
    return stackCaptureResult(captures);
  }
  // Each promise starts its own identity probe and sampler. Join all children
  // before returning even if a launch, read, or identity check fails.
  const collected = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      captureOne(index).catch((error) => ({
        index,
        status: "capture-error",
        error: String(error),
      })),
    ),
  );
  captures.push(
    ...collected.map((capture) =>
      Object.assign(capture, {
        overlappingCommandIndices: collected.flatMap((other) =>
          "record" in capture &&
          capture.record != null &&
          "record" in other &&
          other.record != null &&
          capture.index !== other.index &&
          capture.record.startedUtc < other.record.finishedUtc &&
          other.record.startedUtc < capture.record.finishedUtc
            ? [other.index]
            : [],
        ),
      }),
    ),
  );
  return stackCaptureResult(captures);
}

/** Capture eight stacks of an existing file without rebuilding or timing it. */
export async function captureArtifact(
  value: CaptureRequest,
  directory: string,
  providedChecker?: CaptureStdoutChecker,
): Promise<boolean> {
  return (await captureWithStackEvidence(value, directory, providedChecker))
    .accepted;
}

/** Internal fixed smoke entry; no caller-supplied binary or mode selector. */
export async function runFixedProfileSmoke(directory: string): Promise<void> {
  const hosted =
    process.platform === "darwin" &&
    process.arch === "arm64" &&
    process.env.GITHUB_ACTIONS === "true" &&
    process.env.RUNNER_ENVIRONMENT === "github-hosted";
  await buildFixedProfileSmoke(
    directory,
    async (request, captureDirectory) =>
      await captureWithStackEvidence(
        request,
        captureDirectory,
        undefined,
        hosted,
      ),
  );
}

async function captureWithStackEvidence(
  value: CaptureRequest,
  directory: string,
  providedChecker?: CaptureStdoutChecker,
  hosted = false,
): Promise<{ readonly accepted: boolean; readonly reportSha256: string }> {
  const request = validateCaptureRequest(structuredClone(value));
  const checker = providedChecker == null ? undefined : { ...providedChecker };
  const hostedReports: HostedReport[] | undefined =
    hosted && request.kind === "synthetic-method-probe" ? [] : undefined;
  mkdirSync(directory);
  writeJson(join(directory, "request.json"), request);
  const session = new ProfilingSession();
  const commands: RunRecord[] = [];
  const execute = async (
    name: string,
    argv: readonly string[],
    timeoutMs = 20_000,
  ): Promise<RunRecord> => {
    const run = session.launch(
      directory,
      name,
      argv,
      process.cwd(),
      { PATH: process.env.PATH ?? "" },
      Buffer.alloc(0),
      timeoutMs,
    );
    const record = await run.done;
    commands.push(record);
    return record;
  };
  let sourceBefore: RunRecord[] = [];
  let sourceAfter: RunRecord[] = [];
  const inspectSource = async (phase: string): Promise<RunRecord[]> => [
    await execute(`source-${phase}-head`, [
      "git",
      "rev-parse",
      "HEAD",
      "HEAD^{tree}",
    ]),
    await execute(`source-${phase}-dirty`, ["git", "status", "--porcelain"]),
  ];
  let accepted = false;
  let supportingEvidence = false;
  let reportSha256 = "";
  let hostedAccepted = false;
  let failure: string | null = null;
  let targetCorrect: boolean | null = null;
  const captures: StackCapture[] = [];
  let before: ReturnType<typeof fileIdentity>[] = [];
  let after: ReturnType<typeof fileIdentity>[] = [];
  try {
    sourceBefore = await inspectSource("before");
    if (!sourceBefore.every(goodRun))
      throw new Error("Unknown source identity");
    const discovery = await discoverProfilingTools(
      join(directory, "discovery"),
      session,
    );
    if (!JSON.parse(discovery).completed) {
      throw new Error("Discovery interrupted or cleanup incomplete");
    }
    if (
      !(
        (process.platform === "linux" && process.arch === "x64") ||
        (process.platform === "darwin" && process.arch === "arm64")
      )
    ) {
      throw new Error("Requires native Linux x64 or macOS arm64 host");
    }
    const paths = [
      request.executable,
      ...request.inputs.map((input) => input.path),
    ];
    before = paths.map(fileIdentity);
    const expected = [
      request.sha256,
      ...request.inputs.map((input) => input.sha256),
    ];
    if (before.some((entry, index) => entry.sha256 !== expected[index])) {
      throw new Error("Input identity does not match caller's frozen digest");
    }
    writeJson(
      join(directory, "stdout-oracle.json"),
      checker == null
        ? { kind: "exact-bytes", stdoutBase64: request.stdoutBase64 }
        : {
            kind: "caller-checker",
            id: checker.id ?? null,
            sourcePath: checker.sourcePath ?? null,
            declaredSourceSha256: checker.sourceSha256 ?? null,
            actualSourceSha256:
              before.find((entry) => entry.path === checker.sourcePath)
                ?.sha256 ?? null,
            functionSha256: isCheckerFunction(checker.check)
              ? digest(
                  Buffer.from(Function.prototype.toString.call(checker.check)),
                )
              : null,
            semantics: "Caller-owned; digests do not establish correctness",
          },
    );
    if (
      checker != null &&
      (request.kind !== "existing-artifact" ||
        !isString(checker.id) ||
        checker.id.length === 0 ||
        !isCheckerFunction(checker.check) ||
        !request.inputs.some(
          (input) =>
            input.path === checker.sourcePath &&
            input.sha256 === checker.sourceSha256,
        ))
    ) {
      throw new Error("Missing checker function or frozen source identity");
    }
    mkdirSync(join(directory, "files"));
    for (const [index, entry] of before.entries()) {
      copyFileSync(entry.path, join(directory, "files", String(index)));
      chmodSync(join(directory, "files", String(index)), entry.mode);
    }
    writeJson(join(directory, "file-map.json"), before);
    const symbolArgv =
      process.platform === "linux"
        ? [executablePath("readelf") ?? "readelf", "-n", request.executable]
        : ["/usr/bin/dwarfdump", "--uuid", request.executable];
    const symbolsBefore = await execute("symbols-before", symbolArgv);
    const profiler =
      process.platform === "linux"
        ? executablePath("gdb")
        : executablePath("/usr/bin/sample");
    if (profiler == null) throw new Error("Capture tool unavailable");
    const profilerBefore = fileIdentity(profiler);
    writeJson(join(directory, "profiler-before.json"), profilerBefore);
    if (process.platform === "darwin") {
      const help =
        readFileSync(join(directory, "discovery", "9.stderr"), "utf8") +
        readFileSync(join(directory, "discovery", "9.stdout"), "utf8");
      if (
        !/duration/iu.test(help) ||
        !/interval/iu.test(help) ||
        !/-file/u.test(help)
      ) {
        throw new Error(
          "Installed sample help does not confirm capture syntax",
        );
      }
    }
    const startTarget = (name: string): OwnedRun => {
      const run = session.launch(
        directory,
        name,
        [request.executable, ...request.argv],
        request.cwd,
        request.env,
        Buffer.from(request.stdinBase64, "base64"),
        120_000,
      );
      return run;
    };
    const correctness = (record: RunRecord, name: string): boolean => {
      const stdout = readFileSync(join(directory, record.stdout));
      const stderr = readFileSync(join(directory, record.stderr));
      const processCorrect =
        record.status === request.exitStatus &&
        record.signal == null &&
        record.error == null &&
        !record.timedOut &&
        record.groupGone;
      let outputCorrect = false;
      let checkerError: string | null = null;
      try {
        outputCorrect =
          stderr.toString("base64") === request.stderrBase64 &&
          (checker == null
            ? stdout.toString("base64") === request.stdoutBase64
            : checker.check(stdout) === true);
      } catch (error) {
        checkerError = String(error);
      }
      const correct = processCorrect && outputCorrect;
      writeJson(join(directory, `${name}-check.json`), {
        correct,
        processCorrect,
        outputCorrect,
        checkerError,
        oracle: checker == null ? "exact-bytes" : "caller-checker",
        stdoutSha256: digest(stdout),
        stderrSha256: digest(stderr),
      });
      return correct;
    };
    const preflight = await startTarget("preflight").done;
    const preflightCorrect = correctness(preflight, "preflight");
    writeJson(join(directory, "preflight-role.json"), {
      reason:
        process.platform === "darwin"
          ? "mac-first-execution-discard-in-this-probe"
          : "correctness-only",
      retained: false,
      earlierLaunchHistory: "caller-owned; not inferred",
      correct: preflightCorrect,
    });
    if (!preflightCorrect) throw new Error("Preflight output/status mismatch");
    const target = startTarget("target");
    try {
      await delay(50);
      const captured = await collectOwnedStacks(
        {
          target,
          request,
          directory,
          profiler,
          platform: process.platform,
          execute,
          interrupted: () => session.interrupted,
          captures,
        },
        hostedReports,
      );
      const result = await target.done;
      targetCorrect = correctness(result, "target");
      const symbolsAfter = await execute("symbols-after", symbolArgv);
      const profilerAfter = fileIdentity(profiler);
      writeJson(join(directory, "profiler-after.json"), profilerAfter);
      after = paths.map(fileIdentity);
      const unchanged = JSON.stringify(before) === JSON.stringify(after);
      const symbolsUnchanged =
        goodRun(symbolsBefore) &&
        goodRun(symbolsAfter) &&
        readFileSync(join(directory, symbolsBefore.stdout)).equals(
          readFileSync(join(directory, symbolsAfter.stdout)),
        );
      supportingEvidence =
        JSON.stringify(profilerBefore) === JSON.stringify(profilerAfter) &&
        targetCorrect &&
        unchanged &&
        symbolsUnchanged;
      accepted = captured.complete && supportingEvidence;
      if (hostedReports === undefined) supportingEvidence = accepted;
      if (!accepted)
        failure = "Incomplete capture, correctness or identity evidence";
    } catch (error) {
      // Retain the capture failure if target finalization also fails.
      failure = String(error);
      throw error;
    } finally {
      target.stop("finally: cleanup owned target");
      const result = await target.done;
      if (targetCorrect == null) {
        targetCorrect = correctness(result, "target");
      }
    }
  } catch (error) {
    if (hostedReports !== undefined) supportingEvidence = false;
    failure ??= String(error);
  } finally {
    try {
      sourceAfter = await inspectSource("after");
      supportingEvidence &&= sourceAfter.every(
        (record, index) =>
          goodRun(record) &&
          readFileSync(join(directory, record.stdout)).equals(
            readFileSync(join(directory, sourceBefore[index]!.stdout)),
          ),
      );
    } catch (error) {
      supportingEvidence = false;
      failure ??= String(error);
    }
    const lifetimes = await session.finish();
    supportingEvidence &&=
      session.interrupted == null && lifetimes.every((run) => run.groupGone);
    while (captures.length < 8) {
      captures.push({
        index: captures.length,
        status: "not-attempted-after-failure",
      });
    }
    const finalIdentities = [
      request.executable,
      ...request.inputs.map((input) => input.path),
    ].map((path) => {
      try {
        return fileIdentity(path);
      } catch (error) {
        return { path, error: String(error) };
      }
    });
    supportingEvidence &&=
      JSON.stringify(before) === JSON.stringify(finalIdentities);
    accepted &&= supportingEvidence;
    if (!accepted) failure ??= "Source identity or owned cleanup incomplete";
    const report = {
      kind: request.kind,
      performanceEvidence: false,
      timedArtifactAcceptance: "caller must link to final measurement evidence",
      status: accepted ? "method-probe-passed" : "failed-or-incomplete",
      failure,
      interrupted: session.interrupted,
      host: {
        platform: process.platform,
        architecture: arch(),
        hostname: hostname(),
        release: release(),
      },
      sourceBefore,
      sourceAfter,
      ci: Object.fromEntries(
        [
          "GITHUB_SHA",
          "GITHUB_RUN_ID",
          "GITHUB_RUN_ATTEMPT",
          "GITHUB_JOB",
          "RUNNER_OS",
          "RUNNER_ARCH",
          "RUNNER_NAME",
        ].map((name) => [name, process.env[name] ?? null]),
      ),
      targetCorrect,
      requestedCaptures: 8,
      captureScheduling:
        process.platform === "darwin"
          ? {
              mode: "overlapping-samplers-one-target",
              requestedDurationSeconds: 1,
              requestedIntervalMs: 10,
              correlatedObservations: true,
              boundaries: "command lifetimes, not effective sample windows",
              effectiveCoverage: "unknown; inspect retained raw reports",
            }
          : { mode: "serial-debugger-stops" },
      captures,
      before,
      after,
      finalIdentities,
      commands,
      lifetimes,
      lossCount: null,
      limits:
        "Attach stops are not CPU shares or call counts; escaped " +
        "process groups and uncatchable termination cannot be cleaned here",
    };
    const reportText = JSON.stringify(report, null, 2) + "\n";
    writeFileSync(join(directory, "capture.json"), reportText);
    reportSha256 = digest(Buffer.from(reportText));
    if (hostedReports !== undefined) {
      hostedReports.sort((left, right) => left.index - right.index);
      hostedAccepted =
        supportingEvidence &&
        hostedReports.length === 8 &&
        hostedReports.every(
          (item, index) => item.index === index && item.accepted,
        );
      writeJson(join(directory, "hosted-mac-synthetic-stacks.json"), {
        role: "hosted-mac-synthetic-method-probe",
        accepted: hostedAccepted,
        strictCaptureSha256: reportSha256,
        executableSha256: request.sha256,
        accompanyingCaptureRemainsStrict: true,
        reports: hostedReports,
        limits:
          "Recorded main-thread stacks only. Overlap is correlated. " +
          "Unknown branches have no cost attribution.",
      });
    }
  }
  return {
    accepted: hostedReports === undefined ? accepted : hostedAccepted,
    reportSha256,
  };
}
