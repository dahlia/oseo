/**
 * The external-component probe.
 *
 * [*PLAN-REGEXP.md*](../../PLAN-REGEXP.md) requires an external engine
 * probe to cover the candidate grammar and match semantics, static-link
 * support, both execution targets, the AArch64 Linux cross-link, license
 * compatibility, Unicode version control, sanitizer behavior, thread and
 * locale assumptions, allocator injection, error translation, and binary
 * size, and it forbids closing a missing behavior with an unreviewed
 * wrapper. This probe measures the semantic half against the owned
 * matcher over the reviewed corpus and reports each mismatch; the facts
 * it can read from the installed component are reported beside them, and
 * what one host cannot answer is named as a limit rather than assumed.
 *
 * The candidate is PCRE2 in its 16-bit form, because a subject is UTF-16
 * and a component that only accepts UTF-8 would be compared through a
 * conversion this probe would then be measuring. The engine is driven
 * through *pcre2-probe.c*, which owns the option mapping.
 */

import { readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { searchRegExpMatcher } from "../../packages/compiler/src/index.ts";
import type { CompilerHost } from "../../packages/compiler/src/index.ts";

import { probeInputText } from "./corpus.ts";
import type { ProbeArtifact } from "./artifact.ts";

/** How one engine answered one case, compared with the owned matcher. */
export type ExternalVerdict =
  | "agreed"
  | "compile-refused"
  | "different-captures"
  | "different-outcome"
  | "match-error";

/** One measured case. */
export interface ExternalRow {
  readonly compiledBytes: number | undefined;
  readonly compileNanoseconds: number | undefined;
  readonly detail: string;
  readonly id: string;
  readonly inputId: string;
  readonly matchNanoseconds: number | undefined;
  readonly verdict: ExternalVerdict;
}

/** What the installed component reports about itself. */
export interface ExternalFacts {
  /**
   * Bytes the harness's own allocator handed the engine, which is
   * nonzero exactly when allocator injection works.
   */
  readonly allocatedBytes: number | undefined;
  readonly depthLimit: string;
  readonly jit: string;
  readonly libraryBytes: number | undefined;
  readonly libraryPath: string | undefined;
  readonly linkSize: string;
  /** The newline convention the component was built with. */
  readonly newline: string;
  /** The newline convention every corpus pattern compiles under. */
  readonly newlineOption: string;
  readonly staticArchives: readonly string[];
  readonly unicodeVersion: string;
  readonly version: string;
}

/** The external-component probe result, or the reason it did not run. */
export interface ExternalMeasurement {
  readonly command: readonly string[];
  readonly facts: ExternalFacts | undefined;
  readonly rows: readonly ExternalRow[];
  readonly skipped: string | undefined;
}

const harnessPath = fileURLToPath(new URL("./pcre2-probe.c", import.meta.url));

/**
 * The text one hexadecimal UTF-16 field holds.
 *
 * `-` is the harness's answer for a code it could not translate, which
 * is not a message and is reported as none rather than as an empty one.
 */
function decodeUnits(hex: string, id: string): string | undefined {
  if (hex === "-") return undefined;
  if (!/^(?:[0-9a-f]{4})+$/u.test(hex)) {
    throw new Error(
      `The harness answered ${id} with "${hex}" where a field holds ` +
        "hexadecimal UTF-16 code units.",
    );
  }
  let text = "";
  for (let index = 0; index < hex.length; index += 4) {
    const unit = Number.parseInt(hex.slice(index, index + 4), 16);
    text += String.fromCharCode(unit);
  }
  return text;
}

function encodeUnits(text: string): string {
  let encoded = "";
  for (let index = 0; index < text.length; index += 1) {
    encoded += (text.charCodeAt(index) | 0).toString(16).padStart(4, "0");
  }
  return encoded;
}

interface Answer {
  readonly captures: readonly (readonly [number, number])[];
  readonly compileNanoseconds: number | undefined;
  readonly compiledBytes: number | undefined;
  readonly detail: string;
  readonly matchNanoseconds: number | undefined;
  readonly status: string;
}

/**
 * One field read as a whole number, refusing anything else.
 *
 * The test is on the text rather than on the parsed value, because
 * `Number` reads an empty field, a space, and a hexadecimal literal as
 * numbers, and any of those would silently become a measurement.
 */
function count(fields: readonly string[], index: number, id: string): number {
  const raw = fields[index];
  if (raw == null || !/^\d+$/u.test(raw)) {
    throw new Error(
      `The harness answered ${id} with ${raw == null ? "no" : `"${raw}"`} ` +
        `where field ${index} has to be a whole number.`,
    );
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(
      `The harness answered ${id} with ${raw} in field ${index}, which ` +
        "is larger than a whole number this side can hold.",
    );
  }
  return value;
}

/** The unset span the protocol prints for a group that did not run. */
const unsetSpan = "-1";

/**
 * One capture span, which is a pair of offsets or the unset pair.
 *
 * The protocol admits exactly one pair outside the whole numbers, the
 * unset `-1, -1`. A half-unset or otherwise negative span is refused
 * rather than repaired, because the comparison reads only that pair as
 * unset and any repair would decide a capture the harness did not
 * report.
 */
function span(
  fields: readonly string[],
  index: number,
  id: string,
): readonly [number, number] {
  const start = fields[index];
  const end = fields[index + 1];
  if (start === unsetSpan && end === unsetSpan) return [-1, -1];
  if (start === unsetSpan || end === unsetSpan) {
    throw new Error(
      `The harness answered ${id} with a half-unset capture span.`,
    );
  }
  const from = count(fields, index, id);
  const to = count(fields, index + 1, id);
  if (to < from) {
    throw new Error(
      `The harness answered ${id} with the capture span ${from},${to}, ` +
        "which ends before it starts.",
    );
  }
  return [from, to];
}

/** Refuse an answer whose field count is not what its status carries. */
function requireFields(
  fields: readonly string[],
  expected: number,
  id: string,
): void {
  if (fields.length === expected) return;
  throw new Error(
    `The harness answered ${id} with ${fields.length} fields where its ` +
      `status carries ${expected}.`,
  );
}

/**
 * One harness answer, refusing a line the protocol does not define.
 *
 * A truncated line would otherwise read as zero nanoseconds, zero bytes
 * and no captures, which compares as agreement on a case the harness
 * never answered.
 */
function parseAnswer(fields: readonly string[], id: string): Answer {
  const status = fields[1] ?? "";
  if (status === "compile-error") {
    requireFields(fields, 5, id);
    const message = decodeUnits(fields[4] ?? "", id);
    return {
      captures: [],
      compileNanoseconds: undefined,
      compiledBytes: undefined,
      detail:
        `${count(fields, 2, id)} at ${count(fields, 3, id)}` +
        (message == null ? "" : `, ${message}`),
      matchNanoseconds: undefined,
      status,
    };
  }
  if (status === "match-error") {
    requireFields(fields, 4, id);
    const code = fields[2];
    // The harness prints this status only where the component returned
    // a negative error code, so zero, a positive count, and a value this
    // side cannot hold all name no failure at all.
    if (
      code == null ||
      !/^-[1-9]\d*$/u.test(code) ||
      !Number.isSafeInteger(Number(code))
    ) {
      throw new Error(
        `The harness answered ${id} with the match error ` +
          `${code == null ? "none" : `"${code}"`}, which is not one of ` +
          "the component's negative error codes.",
      );
    }
    const message = decodeUnits(fields[3] ?? "", id);
    return {
      captures: [],
      compileNanoseconds: undefined,
      compiledBytes: undefined,
      detail: message == null ? code : `${code}, ${message}`,
      matchNanoseconds: undefined,
      status,
    };
  }
  if (status !== "match" && status !== "no-match") {
    throw new Error(
      `The harness answered ${id} with the unknown status ` +
        `${status === "" ? "none" : status}.`,
    );
  }
  const captures: (readonly [number, number])[] = [];
  if (status === "match") {
    const pairs = count(fields, 5, id);
    requireFields(fields, 6 + pairs * 2, id);
    for (let pair = 0; pair < pairs; pair += 1) {
      captures.push(span(fields, 6 + pair * 2, id));
    }
  } else requireFields(fields, 5, id);
  return {
    captures,
    compileNanoseconds: count(fields, 3, id),
    compiledBytes: count(fields, 4, id),
    detail: "",
    matchNanoseconds: count(fields, 2, id),
    status,
  };
}

/**
 * Every 16-bit PCRE2 archive beside the shared library this host linked.
 *
 * Only the 16-bit archive is the candidate, so an 8-bit, a 32-bit, or a
 * POSIX archive beside it is not evidence that this component can be
 * linked statically. The search covers one directory rather than the
 * linker's own search path, so an empty answer means no archive is
 * beside the shared library rather than that none is installed, which is
 * why the report leaves static linking to a source build.
 */
async function staticArchives(
  directory: string | undefined,
): Promise<readonly string[]> {
  if (directory == null) return [];
  try {
    const names = await readdir(directory);
    return names.filter((name) => name === "libpcre2-16.a").toSorted();
  } catch {
    return [];
  }
}

/**
 * The dynamic PCRE2 library the harness links, or `undefined`.
 *
 * The inspection tool differs by host and is absent on some, so an
 * unavailable one leaves the library unmeasured rather than ending a
 * measurement that otherwise succeeded. `ldd` answers on Linux and
 * `otool -L` on macOS, and both are tried because either may be the one
 * a supported host ships.
 */
async function linkedLibrary(
  host: CompilerHost,
  directory: string,
  executable: string,
): Promise<string | undefined> {
  for (const inspection of [
    { args: [executable], command: "ldd" },
    { args: ["-L", executable], command: "otool" },
  ]) {
    let observed;
    try {
      // eslint-disable-next-line no-await-in-loop -- One tool answers.
      observed = await host.run({ ...inspection, cwd: directory });
    } catch {
      continue;
    }
    if (observed.exitStatus !== 0) continue;
    let found: string | undefined;
    for (const line of observed.stdout.split("\n")) {
      // `ldd` prints the soname, an arrow, and the resolved path, so the
      // right of the arrow is the file. `otool -L` prints the path
      // alone, indented. Reading the wrong side of an arrow would name
      // the soname, which no size can be read from.
      const resolved = line.includes("=>")
        ? /=>\s*(\S*libpcre2-16\S*)/u.exec(line)
        : /^\s+(\S*libpcre2-16\S*)/u.exec(line);
      if (resolved?.[1] != null) found = resolved[1];
    }
    if (found != null) return found;
  }
  return undefined;
}

async function readFacts(
  host: CompilerHost,
  directory: string,
  executable: string,
  allocatedBytes: number | undefined,
): Promise<ExternalFacts> {
  const reported = await host.run({
    args: ["--facts"],
    command: executable,
    cwd: directory,
  });
  if (reported.exitStatus !== 0) {
    throw new Error(
      "The external-component harness did not report its facts: " +
        reported.stderr.trim(),
    );
  }
  const values = new Map<string, string>();
  for (const line of reported.stdout.split("\n")) {
    if (line === "") continue;
    const fields = line.split("\t");
    requireFields(fields, 2, "a fact");
    const [name, value] = fields;
    if (name == null || name === "" || value == null || value === "") {
      throw new Error(`The harness reported the empty fact "${line}".`);
    }
    if (values.has(name)) {
      throw new Error(`The harness reported the fact ${name} twice.`);
    }
    values.set(name, value);
  }
  // Every fact below is one the report quotes, so a harness that stopped
  // printing one would otherwise be read as a component that answered
  // "unknown" about itself.
  const required = [
    "depthlimit",
    "jit",
    "linksize",
    "newline",
    "newlineoption",
    "unicode",
    "version",
  ];
  const missing = required.filter((name) => !values.has(name));
  if (missing.length > 0) {
    throw new Error(
      `The external-component harness reported no ${missing.join(", ")}.`,
    );
  }
  const libraryPath = await linkedLibrary(host, directory, executable);
  let libraryBytes: number | undefined;
  if (libraryPath != null) {
    try {
      libraryBytes = (await stat(libraryPath)).size;
    } catch {
      libraryBytes = undefined;
    }
  }
  return {
    allocatedBytes,
    depthLimit: values.get("depthlimit") ?? "unknown",
    jit: values.get("jit") ?? "unknown",
    libraryBytes,
    libraryPath,
    linkSize: values.get("linksize") ?? "unknown",
    newline: values.get("newline") ?? "unknown",
    newlineOption: values.get("newlineoption") ?? "unknown",
    staticArchives: await staticArchives(
      libraryPath == null ? undefined : dirname(libraryPath),
    ),
    unicodeVersion: values.get("unicode") ?? "unknown",
    version: values.get("version") ?? "unknown",
  };
}

/** Compare one candidate engine with the owned matcher. */
export async function measureExternal(
  host: CompilerHost,
  artifacts: readonly ProbeArtifact[],
): Promise<ExternalMeasurement> {
  const directory = await host.makeTemporaryDirectory("oseo-pcre2-probe-");
  try {
    return await measureIn(host, artifacts, directory);
  } finally {
    // Every exit removes the directory, including a host with no
    // compiler and a harness that failed, so a run leaves nothing behind.
    await host.remove(directory);
  }
}

/**
 * The smallest program that needs the candidate component.
 *
 * It is compiled and linked before the harness so that a host without a
 * C compiler, without the 16-bit headers, or without the library is told
 * apart from a harness this repository broke.
 */
const availabilitySource = `#define PCRE2_CODE_UNIT_WIDTH 16
#include <pcre2.h>
#include <stdint.h>
int main(void) {
    uint32_t width = 0;
    return pcre2_config(PCRE2_CONFIG_UNICODE, &width) < 0 ? 1 : 0;
}
`;

/** Why the candidate component cannot be measured here, or `undefined`. */
async function componentUnavailable(
  host: CompilerHost,
  directory: string,
): Promise<string | undefined> {
  const source = join(directory, "pcre2-available.c");
  const executable = join(directory, "pcre2-available");
  await writeFile(source, availabilitySource);
  let built;
  try {
    built = await host.run({
      args: ["-std=c11", source, "-o", executable, "-lpcre2-16"],
      command: "cc",
      cwd: directory,
    });
  } catch {
    return "no C compiler answered on this host";
  }
  if (built.exitStatus !== 0) {
    return (
      "no PCRE2 16-bit headers and library answered on this host: " +
      built.stderr.trim()
    );
  }
  // Linking is not loading. A component whose shared library the loader
  // cannot find at run time is still an unavailable component rather
  // than a harness this repository broke, so the smallest program that
  // needs it is executed here and not only built.
  let loaded;
  try {
    loaded = await host.run({ args: [], command: executable, cwd: directory });
  } catch {
    return "the installed PCRE2 16-bit library did not load on this host";
  }
  if (loaded.exitStatus !== 0) {
    return (
      "the installed PCRE2 16-bit library did not load on this host: " +
      loaded.stderr.trim()
    );
  }
  return undefined;
}

/** Fail loudly when the harness this repository owns did not build. */
function requireHarness(observed: {
  readonly exitStatus: number;
  readonly stderr: string;
}): void {
  if (observed.exitStatus === 0) return;
  throw new Error(
    "The external-component harness did not build against an installed " +
      `PCRE2: ${observed.stderr.trim()}`,
  );
}

/** The comparison itself, inside one working directory. */
async function measureIn(
  host: CompilerHost,
  artifacts: readonly ProbeArtifact[],
  directory: string,
): Promise<ExternalMeasurement> {
  const executable = join(directory, "pcre2-probe");
  const command = [
    "cc",
    "-O2",
    "-std=c11",
    "-Wall",
    "-Wextra",
    harnessPath,
    "-o",
    executable,
    "-lpcre2-16",
  ];
  const unavailable = await componentUnavailable(host, directory);
  if (unavailable != null) {
    return { command, facts: undefined, rows: [], skipped: unavailable };
  }
  // The component is installed, so the harness itself failing to build
  // is a defect in this repository rather than a host without it, and
  // reporting it as a skip would retire the comparison silently.
  const built = await host.run({
    args: command.slice(1),
    command: "cc",
    cwd: directory,
  });
  requireHarness(built);
  const requests: string[] = [];
  const cases = new Map<
    string,
    {
      readonly artifact: ProbeArtifact;
      readonly inputId: string;
      readonly text: string;
    }
  >();
  for (const artifact of artifacts) {
    for (const input of artifact.entry.inputs) {
      const text = probeInputText(input);
      const id = `${artifact.entry.id}/${input.id}`;
      // The request format separates four fields with tabs, so neither
      // an empty pattern nor an empty subject can be expressed. Dropping
      // one would shrink the corpus the completeness check compares
      // against and would report agreement over a case never run.
      if (text === "" || artifact.entry.source === "") {
        throw new Error(
          `The corpus case ${id} has an empty pattern or subject, which ` +
            "the harness request format cannot carry.",
        );
      }
      cases.set(id, { artifact, inputId: input.id, text });
      requests.push(
        [
          id,
          artifact.entry.flags === "" ? "-" : artifact.entry.flags,
          encodeUnits(artifact.entry.source),
          encodeUnits(text),
        ].join("\t"),
      );
    }
  }
  const requestPath = join(directory, "requests.tsv");
  await writeFile(requestPath, `${requests.join("\n")}\n`);
  const answered = await host.run({
    args: [requestPath],
    command: executable,
    cwd: directory,
  });
  // The component loaded before the harness was built, so the harness
  // failing here is a defect in this repository. Reporting it as a skip
  // would retire the whole comparison without anyone noticing.
  if (answered.exitStatus !== 0) {
    throw new Error(
      "The external-component harness failed over the corpus: " +
        answered.stderr.trim(),
    );
  }
  let allocatedBytes: number | undefined;
  const rows: ExternalRow[] = [];
  const answeredIds = new Set<string>();
  for (const line of answered.stdout.split("\n")) {
    if (line === "") continue;
    const fields = line.split("\t");
    const id = fields[0];
    if (id == null) continue;
    if (id === "allocated") {
      // The report reads this as the proof that allocator injection
      // works, so a record that is missing, repeated, or not a positive
      // count has to fail rather than leave the claim unsupported.
      if (allocatedBytes != null) {
        throw new Error("The harness reported its allocation twice.");
      }
      requireFields(fields, 2, "allocated");
      const value = count(fields, 1, "allocated");
      if (value <= 0) {
        throw new Error(
          "The harness reported no allocated bytes, so its injected " +
            "allocator was never called.",
        );
      }
      allocatedBytes = value;
      continue;
    }
    // An answer this side cannot attribute is a defect in the harness
    // protocol rather than a case to skip: a partial answer set would be
    // reported as agreement over a corpus it never covered.
    const current = cases.get(id);
    if (current == null) {
      throw new Error(`The harness answered an unknown case ${id}.`);
    }
    if (answeredIds.has(id)) {
      throw new Error(`The harness answered case ${id} twice.`);
    }
    answeredIds.add(id);
    rows.push(
      compare(
        id,
        current.inputId,
        current.artifact,
        current.text,
        parseAnswer(fields, id),
      ),
    );
  }
  if (allocatedBytes == null) {
    throw new Error("The harness reported no allocation record.");
  }
  if (answeredIds.size !== cases.size) {
    const missing = [...cases.keys()]
      .filter((id) => !answeredIds.has(id))
      .toSorted();
    throw new Error(
      `The harness left ${missing.length} case(s) unanswered: ` +
        `${missing.join(", ")}.`,
    );
  }
  const facts = await readFacts(host, directory, executable, allocatedBytes);
  return { command, facts, rows, skipped: undefined };
}

function compare(
  id: string,
  inputId: string,
  artifact: ProbeArtifact,
  text: string,
  answer: Answer,
): ExternalRow {
  const owned = searchRegExpMatcher({
    program: artifact.program,
    startIndex: 0,
    text,
  });
  const base = {
    compileNanoseconds: answer.compileNanoseconds,
    compiledBytes: answer.compiledBytes,
    id: artifact.entry.id,
    inputId,
    matchNanoseconds: answer.matchNanoseconds,
  };
  if (answer.status === "compile-error") {
    return {
      ...base,
      detail: `PCRE2 refused the pattern: error ${answer.detail}`,
      verdict: "compile-refused",
    };
  }
  if (answer.status !== "match" && answer.status !== "no-match") {
    return {
      ...base,
      detail: `${id}: ${answer.status} ${answer.detail}`.trim(),
      verdict: "match-error",
    };
  }
  const matched = answer.status === "match";
  if (owned.outcome === "limit") {
    return {
      ...base,
      detail: `the owned matcher reached its ${owned.limit} boundary`,
      verdict: "different-outcome",
    };
  }
  if ((owned.outcome === "matched") !== matched) {
    return {
      ...base,
      detail: `the owned matcher answered ${owned.outcome}`,
      verdict: "different-outcome",
    };
  }
  if (owned.outcome !== "matched") {
    return { ...base, detail: "", verdict: "agreed" };
  }
  const differences: string[] = [];
  const total = Math.max(owned.captures.length, answer.captures.length);
  for (let index = 0; index < total; index += 1) {
    const ours = owned.captures[index];
    const theirs = answer.captures[index];
    const ourSpan = ours == null ? "unset" : `${ours.start},${ours.end}`;
    const theirSpan =
      theirs == null || theirs[0] === -1
        ? "unset"
        : `${theirs[0]},${theirs[1]}`;
    if (ourSpan !== theirSpan) {
      differences.push(`${index}: owned ${ourSpan}, PCRE2 ${theirSpan}`);
    }
  }
  if (differences.length === 0) {
    return { ...base, detail: "", verdict: "agreed" };
  }
  return {
    ...base,
    detail: differences.join("; "),
    verdict: "different-captures",
  };
}
