/**
 * The native clock and wakeup probe command.
 *
 * It builds *tests/native-io/probes/clock-wakeup.c* against the reviewed
 * runtime sources for the host-native target, without sanitizers so that
 * its timings describe the adapter rather than instrumentation, runs it,
 * and prints what it measured together with the inputs that make those
 * measurements evidence: the compiler identity and invocation, the explicit
 * target, and the host operating system. `--link-only TARGET` links the
 * probe for another target instead, which is the AArch64 Linux
 * compile-link record. [ADR 0025](../docs/adr/0025-native-clock-and-wakeup.md)
 * quotes one run of this command.
 *
 * ~~~~ sh
 * mise run probe:native-io:clock
 * mise run probe:native-io:clock -- --json probe.json
 * mise run probe:native-io:clock -- --link-only aarch64-linux-musl
 * ~~~~
 *
 * The probe only reads host clocks. It never writes the real-time clock
 * and uses no network endpoint.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import {
  buildClockProgram,
  hostClockTarget,
  runClockCommand,
  runClockProbe,
} from "./native-io/clock.ts";
import type { ClockProbeConfiguration } from "./native-io/clock.ts";

interface ProbeArguments {
  readonly json: string | undefined;
  readonly linkOnly: string | undefined;
}

function parseArguments(args: readonly string[]): ProbeArguments {
  let json: string | undefined;
  let linkOnly: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === "--json" && value != null) {
      json = value;
      index += 1;
    } else if (argument === "--link-only" && value != null) {
      linkOnly = value;
      index += 1;
    } else {
      throw new Error(
        "usage: node tools/native-io-probe.ts " +
          "[--json PATH] [--link-only TARGET]",
      );
    }
  }
  return { json, linkOnly };
}

function microseconds(value: number | undefined): string {
  return value == null ? "-" : `${(value / 1000).toFixed(3)} ms`;
}

function describeConfiguration(entry: ClockProbeConfiguration): string {
  const { capabilities } = entry;
  const lines = [
    `configuration ${entry.configuration} ` +
      `(restrictions ${entry.restrictions})`,
    `  backend ${capabilities.backend}, fallback ${capabilities.fallback}`,
    `  monotonic ${capabilities.monotonic ?? "absent"}: ` +
      `${entry.monotonic.nanosecondsPerRead} ns per read, resolution ` +
      `${entry.monotonic.resolutionNanoseconds} ns, non-decreasing ` +
      `${entry.monotonic.nonDecreasing}`,
    `  real time ${capabilities.realTime ?? "absent"}: ` +
      `${entry.realTime.nanosecondsPerRead} ns per read, resolution ` +
      `${entry.realTime.resolutionNanoseconds} ns, ` +
      `${entry.realTime.differenceFromTimespecGetMilliseconds} ms from ` +
      "timespec_get",
    `  wait ${capabilities.wait ?? "absent"}, wakeup ` +
      `${capabilities.wakeup ?? "absent"}`,
    `  idle deadline wait ${entry.deadlineWait.result}: ` +
      `${microseconds(entry.deadlineWait.elapsedMicroseconds)} elapsed, ` +
      `${microseconds(entry.deadlineWait.cpuMicroseconds)} CPU`,
  ];
  if (entry.pendingWakeup != null) {
    lines.push(
      `  pending wakeup: ${entry.pendingWakeup.first} then ` +
        entry.pendingWakeup.second,
    );
  }
  for (const [label, wait] of [
    ["cross-thread wakeup", entry.crossThreadWakeup],
    ["indefinite wait", entry.indefiniteWait],
  ] as const) {
    if (wait == null) continue;
    lines.push(
      `  ${label} ${wait.result}: ` +
        `${microseconds(wait.elapsedMicroseconds)} elapsed, ` +
        `${microseconds(wait.wakeLatencyMicroseconds)} after the wake`,
    );
  }
  lines.push(
    `  shutdown: ${entry.shutdown.threadsBeforeClose} threads, ` +
      `descriptors ${entry.shutdown.descriptorsBefore} -> ` +
      `${entry.shutdown.descriptorsOpen} -> ` +
      `${entry.shutdown.descriptorsAfter}`,
  );
  return lines.join("\n");
}

const options = parseArguments(process.argv.slice(2));
const target = options.linkOnly ?? hostClockTarget();
if (target == null) {
  throw new Error("The clock probe requires a supported native host.");
}
const zigVersion = runClockCommand("zig", ["version"]).stdout.trim();
const directory = await mkdtemp(join(tmpdir(), "oseo-clock-probe-"));
try {
  const build = buildClockProgram({
    directory,
    optimize: "-O2",
    program: "probe",
    sanitize: false,
    target,
  });
  console.log(`zig ${zigVersion}`);
  console.log(`target ${build.target}`);
  console.log(
    `invocation ${build.invocation
      .map((part) => part.replace(`${process.cwd()}/`, ""))
      .join(" ")}`,
  );
  if (options.linkOnly == null) {
    const report = runClockProbe(build, 200);
    const { host } = report;
    console.log(
      `host ${host.system} ${host.release} ${host.machine} ${host.version}`,
    );
    for (const entry of report.configurations) {
      console.log(describeConfiguration(entry));
    }
    if (options.json != null) {
      await writeFile(
        options.json,
        `${JSON.stringify(
          { invocation: build.invocation, report, target, zig: zigVersion },
          null,
          2,
        )}\n`,
      );
    }
  } else {
    console.log("linked; execution belongs to a matching host");
  }
} finally {
  await rm(directory, { force: true, recursive: true });
}
