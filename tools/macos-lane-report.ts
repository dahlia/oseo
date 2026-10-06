import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { configuredSelfHostedLanes } from "./macos-lane-config.ts";
import type { MacosJobSeconds, MacosLaneJob } from "./generate-macos-lanes.ts";
import {
  macosLaneEnds,
  macosLanes,
  modeledJobSeconds,
} from "./generate-macos-lanes.ts";
import {
  macosFixedSetupSeconds,
  selfHostedFamilySpeedRatios,
  selfHostedJobSeconds,
} from "./macos-job-costs.ts";

/** Measured attempts of the U12 and U25 lane models. */
const attemptDirectory = "docs/evidence/u25/model";

/** One measured job wall of a run attempt and the runner class it used. */
interface AttemptJob {
  readonly seconds: number;
  readonly selfHosted: boolean;
}

/** The measured job walls of one run attempt, by check name. */
export interface MacosAttempt {
  readonly id: string;
  readonly jobs: ReadonlyMap<string, AttemptJob>;
}

/**
 * Parse a jobs-API export: check name, runner name, `started_at`, and
 * `completed_at`, tab-separated. A runner named `oseo-mac-*` is a Mac wall.
 */
export function parseAttempt(id: string, text: string): MacosAttempt {
  const jobs = new Map<string, AttemptJob>();
  for (const line of text.split("\n")) {
    if (line === "") continue;
    const [name, runner, started, completed] = line.split("\t");
    if (name == null || runner == null || started == null || !completed) {
      throw new Error(`Malformed job row in ${id}: ${line}`);
    }
    const seconds = (Date.parse(completed) - Date.parse(started)) / 1000;
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new Error(`Invalid job wall in ${id}: ${name}`);
    }
    jobs.set(name, { seconds, selfHosted: runner.startsWith("oseo-mac-") });
  }
  return { id, jobs };
}

/**
 * Costs of one attempt: a job's own measured wall when it ran on the same
 * runner class there. Otherwise a hosted job takes its hosted median; a
 * Mac job takes its Mac median, or else that attempt's hosted wall
 * converted by the family ratio, or else the modeled value. Mac walls are
 * one-lane walls, so the lane simulation adds the pair slowdowns.
 */
export function attemptJobSeconds(attempt: MacosAttempt): MacosJobSeconds {
  return (job: MacosLaneJob, selfHosted: boolean): number => {
    const observed = attempt.jobs.get(job.name);
    if (observed != null && observed.selfHosted === selfHosted) {
      return observed.seconds;
    }
    const measured = Object.entries(selfHostedJobSeconds).find(
      ([key]) => key === job.name,
    )?.[1];
    const ratio = selfHostedFamilySpeedRatios[job.family];
    if (selfHosted && measured == null && observed != null && ratio != null) {
      return (
        macosFixedSetupSeconds +
        (observed.seconds - macosFixedSetupSeconds) / ratio
      );
    }
    return modeledJobSeconds(job, selfHosted);
  };
}

/** Derived makespan in minutes of an assignment under one cost function. */
export function makespanMinutes(
  lanes: readonly (readonly MacosLaneJob[])[],
  seconds?: MacosJobSeconds,
): number {
  return Math.max(...macosLaneEnds(lanes, seconds)) / 60;
}

/**
 * Derived makespan range in minutes over Mac queue orders. Mac-lane jobs
 * need only the readiness job, so a runner may take its lane's queued jobs
 * in any order. This samples seeded random orders of every Mac lane, plus
 * the generated order; it is a sample, not a bound.
 */
export function queueOrderRange(
  lanes: readonly (readonly MacosLaneJob[])[],
  seconds?: MacosJobSeconds,
  samples = 1000,
): readonly [number, number] {
  // A fixed linear congruential sequence keeps the report reproducible.
  let state = 0x2545f491;
  function random(bound: number): number {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % bound;
  }
  let low = makespanMinutes(lanes, seconds);
  let high = low;
  for (let sample = 0; sample < samples; sample++) {
    const shuffled = lanes.map((lane, index) => {
      if (index < 5) return lane;
      const order = [...lane];
      for (let at = order.length - 1; at > 0; at--) {
        const other = random(at + 1);
        [order[at], order[other]] = [order[other]!, order[at]!];
      }
      return order;
    });
    const value = makespanMinutes(shuffled, seconds);
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  return [low, high];
}

/** Format minutes as the report's one-decimal values. */
function minutes(value: number): string {
  return value.toFixed(1);
}

/** Print derived makespans of the one-lane and configured assignments. */
export function macosLaneReport(attempts: readonly MacosAttempt[]): string {
  const counts = [1, configuredSelfHostedLanes];
  const assignments = counts.map((count) => macosLanes(count));
  const lines = ["Derived macOS makespan in minutes"];
  for (const [index, lanes] of assignments.entries()) {
    const ends = macosLaneEnds(lanes).map((end) => minutes(end / 60));
    const mac = lanes.slice(5).map((lane) => lane.length);
    const [low, high] = queueOrderRange(lanes);
    lines.push(
      `${counts[index]} Mac lane(s), current costs: ` +
        `${minutes(makespanMinutes(lanes))}; ` +
        `lane ends ${ends.join(" ")}; Mac jobs ${mac.join(" + ")}; ` +
        `Mac queue orders ${minutes(low)}-${minutes(high)}`,
    );
  }
  lines.push(
    "",
    ["Attempt", ...counts.map((count) => `${count} lane(s)`)].join("\t"),
  );
  const perRun = assignments.map((): number[] => []);
  const orderRuns = assignments.map((): number[] => []);
  for (const attempt of attempts) {
    const values = assignments.map((lanes, index) => {
      const seconds = attemptJobSeconds(attempt);
      const value = makespanMinutes(lanes, seconds);
      perRun[index]!.push(value);
      orderRuns[index]!.push(...queueOrderRange(lanes, seconds));
      return minutes(value);
    });
    lines.push([attempt.id, ...values].join("\t"));
  }
  lines.push(
    [
      "Range",
      ...perRun.map(
        (values) =>
          `${minutes(Math.min(...values))}-${minutes(Math.max(...values))}`,
      ),
    ].join("\t"),
    [
      "Orders",
      ...orderRuns.map(
        (values) =>
          `${minutes(Math.min(...values))}-${minutes(Math.max(...values))}`,
      ),
    ].join("\t"),
  );
  return lines.join("\n") + "\n";
}

if (
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const names = (await readdir(attemptDirectory))
    .filter((name) => /^jobs-\d+-\d+\.tsv$/.test(name))
    .toSorted();
  const attempts = await Promise.all(
    names.map(async (name) =>
      parseAttempt(
        name.slice("jobs-".length, -".tsv".length),
        await readFile(join(attemptDirectory, name), "utf8"),
      ),
    ),
  );
  process.stdout.write(macosLaneReport(attempts));
}
