import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type {
  StructuredDataInput,
  StructuredDataValue,
} from "../structured-data.ts";
import { parsedMapping } from "../structured-data.ts";
import { selfHostedLaneLabels } from "../macos-lane-config.ts";
import { isBoolean, isNumber, isString } from "../value-kinds.ts";

const hosted = JSON.stringify("macos-15");
const actionsApi = "https://api.github.com/repos/dahlia/oseo/actions";
const stockMacLabels = new Set(["macos-15", "macos-26", "macos-latest"]);

/** The runner fields the probe reads, validated from the API body. */
interface Runner {
  readonly name: string | undefined;
  readonly status: string | undefined;
  readonly busy: boolean | undefined;
  readonly labels: readonly string[];
  readonly labelsKnown: boolean;
}

/** The job fields the probe reads, validated from the API body. */
interface WorkflowJob {
  readonly id: number | undefined;
  readonly status: string | undefined;
  readonly labels: readonly string[];
}

interface WorkflowRun {
  readonly id: number;
  readonly createdAt: number;
}

interface PagedList<T> {
  readonly items: readonly T[];
  readonly complete: boolean;
}

/** Validate one runner entry; a malformed label list is an empty one. */
function runnerOf(entry: StructuredDataValue): Runner {
  const record = parsedMapping(entry, "Runner");
  return {
    name: isString(record.name) ? record.name : undefined,
    status: isString(record.status) ? record.status : undefined,
    busy: isBoolean(record.busy) ? record.busy : undefined,
    labelsKnown: Array.isArray(record.labels),
    labels: Array.isArray(record.labels)
      ? record.labels.map((label) => {
          const name = parsedMapping(label, "Runner label").name;
          return isString(name) ? name : "";
        })
      : [],
  };
}

/** Validate one job entry; a malformed label list is an empty one. */
function jobOf(entry: StructuredDataValue): WorkflowJob {
  const record = parsedMapping(entry, "Workflow job");
  return {
    id: isNumber(record.id) ? record.id : undefined,
    status: isString(record.status) ? record.status : undefined,
    labels: Array.isArray(record.labels)
      ? record.labels.map((label) => (isString(label) ? label : ""))
      : [],
  };
}

/** The timestamp is optional for the existing runner readiness probe. */
function runOf(entry: StructuredDataValue): WorkflowRun {
  const { id, created_at } = parsedMapping(entry, "Workflow run");
  if (!isNumber(id) || !Number.isInteger(id)) {
    throw new Error("Malformed workflow run");
  }
  const timestamp = isString(created_at) ? Date.parse(created_at) : NaN;
  // GitHub returns complete UTC timestamps with second precision.
  const valid =
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().replace(".000Z", "Z") === created_at;
  return { id, createdAt: valid ? timestamp : NaN };
}

/** The subset of `fetch` the probe uses; only `ok` and the JSON body. */
export type ApiFetch = (
  url: string,
  init: {
    readonly headers: Readonly<Record<string, string>>;
    readonly signal: AbortSignal;
  },
) => Promise<{
  readonly ok: boolean;
  json(): Promise<StructuredDataInput>;
}>;

/** Test seams for the second observation that confirms a wedged runner. */
export interface ProbeOptions {
  readonly recheckDelayMilliseconds?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

/**
 * Delay between the two observations that confirm a wedged runner. A
 * working idle runner picks a queued job of its label up within seconds:
 * U23 measured 2 to 3 seconds for the first Mac job and 29 to 32 seconds
 * for ten later handovers in total. The runner stays `busy` through its
 * job-completed hook, which took a measured 5.5 minutes once while it
 * pruned an oversized Zig cache, so a longer delay only tightens the busy
 * signature below; two minutes keeps both observations inside the
 * five-minute readiness job.
 */
export const defaultRecheckDelayMilliseconds = 120_000;

/** What the probe saw of one lane in one pass over the API. */
export interface LaneObservation {
  /** Registered once under its own name and label, online, no other lane. */
  readonly usable: boolean;
  readonly busy: boolean;
  /** IDs of queued jobs that request this lane's label. */
  readonly queued: ReadonlySet<number>;
  /** IDs of in-progress jobs that request this lane's label. */
  readonly running: ReadonlySet<number>;
}

/** The existing lane decisions and the separate hosted overflow signal. */
export interface RunnerRouting {
  readonly selections: readonly string[];
  readonly avreaOverflow: boolean;
}

/**
 * Whether two observations, taken `recheckDelayMilliseconds` apart, show a
 * runner that GitHub lists as online but that is not moving its queue: idle
 * both times while every job that waited for its label the first time was
 * still waiting the second time, or busy both times while no job of its
 * label was running either time. One observation is not enough, because a
 * handover between jobs shows an idle runner beside a job queued long ago
 * for a few seconds; a queue that lost a job between the observations
 * advanced, however both observations happened to land.
 */
export function wedged(
  first: LaneObservation,
  second: LaneObservation,
): boolean {
  if (!first.busy && !second.busy) {
    return (
      first.queued.size > 0 &&
      [...first.queued].every((id) => second.queued.has(id))
    );
  }
  if (first.busy && second.busy) {
    return first.running.size === 0 && second.running.size === 0;
  }
  return false;
}

/** The first observation alone suggests a wedge worth a second look. */
function suspicious(observation: LaneObservation): boolean {
  return (
    observation.usable &&
    (observation.busy
      ? observation.running.size === 0
      : observation.queued.size > 0)
  );
}

/**
 * A lane is usable only through the runner named for its label when that
 * runner is the sole carrier of the label, carries no other lane's label,
 * is online, and reports a Boolean `busy`. Busy is not a reason: a busy
 * lane queues the jobs that select it, and GitHub starts them when the
 * runner frees up. A missing or malformed `busy` is a malformed response,
 * and the wedge check below could not read it, so it stays hosted.
 */
function usableRunner(
  carriers: readonly Runner[],
  label: string,
): Runner | undefined {
  const runner = carriers.length === 1 ? carriers[0] : undefined;
  return runner != null &&
    runner.name === label &&
    runner.status === "online" &&
    runner.busy != null &&
    selfHostedLaneLabels.every(
      (other) => other === label || !runner.labels.includes(other),
    )
    ? runner
    : undefined;
}

/**
 * Any push to dahlia/oseo, branch or tag, can select a Mac lane when
 * enabled, authenticated, and its runner is usable. Only write-access
 * collaborators can push there. PRs and forks stay hosted; decide once
 * before dispatch, with uncertainty retaining hosted coverage.
 *
 * A usable lane is selected whether or not its runner is busy: the jobs
 * then queue on the runner label, and a busy lane delays only those jobs
 * instead of moving them to slower hosted runners. Offline, missing,
 * ambiguous, and disabled lanes fall back to hosted, as does a lane whose
 * runner is online but not moving its queue (see `wedged`). Each lane
 * decides independently; an API or network failure sends every lane to
 * hosted.
 *
 * The overflow signal uses the latest observation and requires a queued
 * stock macOS job from a strictly earlier run. A healthy idle own lane
 * or an uncertain runner inventory keeps overflow off.
 */
export async function runnerRouting(
  env: Readonly<Record<string, string | undefined>>,
  // SAFETY: Only Response.ok and its JSON result are used and validated.
  fetchApi: ApiFetch = fetch as ApiFetch,
  options: ProbeOptions = {},
): Promise<RunnerRouting> {
  const count = Number(env.OSEO_SELFHOSTED_LANES);
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > selfHostedLaneLabels.length
  ) {
    throw new Error(
      `OSEO_SELFHOSTED_LANES must be 1 to ${selfHostedLaneLabels.length}`,
    );
  }
  const selections: string[] = Array.from({ length: count }, () => hosted);
  if (
    env.OSEO_SELFHOSTED_ENABLED !== "true" ||
    env.OSEO_EVENT !== "push" ||
    env.OSEO_REPOSITORY !== "dahlia/oseo" ||
    !env.OSEO_RUNNER_STATUS_TOKEN ||
    !env.OSEO_WORKFLOW_TOKEN
  )
    return { selections, avreaOverflow: false };
  const currentRun = Number(env.GITHUB_RUN_ID);
  const auto =
    env.OSEO_AVREA_MAC_MODE?.toLowerCase() === "auto" &&
    env.GITHUB_REF_TYPE === "branch" &&
    env.GITHUB_REF?.startsWith("refs/heads/") === true &&
    env.GITHUB_REF !== "refs/heads/release-rehearsal" &&
    Number.isSafeInteger(currentRun) &&
    currentRun > 0;
  const sleep =
    options.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const delay =
    options.recheckDelayMilliseconds ?? defaultRecheckDelayMilliseconds;

  try {
    /** Every entry under `key` of a paged list, validated by `parse`. */
    async function listPages<T>(
      token: string,
      url: string,
      key: string,
      parse: (entry: StructuredDataValue) => T,
      prior: readonly T[] = [],
      page = 1,
      priorTotal?: number,
    ): Promise<PagedList<T>> {
      const separator = url.includes("?") ? "&" : "?";
      const paged = `${url}${separator}per_page=100&page=${page}`;
      const response = await fetchApi(paged, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("GitHub API unavailable");
      const body = parsedMapping(await response.json(), "API response");
      const entries = body[key];
      if (!Array.isArray(entries)) {
        throw new Error("Malformed GitHub API response");
      }
      const items = [...prior, ...entries.map(parse)];
      const advertised = body.total_count;
      const total =
        isNumber(advertised) && (page === 1 || advertised === priorTotal)
          ? advertised
          : undefined;
      if (entries.length < 100) {
        return { items, complete: items.length === total };
      }
      if (page === 10) throw new Error("GitHub API pagination limit");
      return listPages(token, url, key, parse, items, page + 1, total);
    }
    const runnerToken = env.OSEO_RUNNER_STATUS_TOKEN;
    const workflowToken = env.OSEO_WORKFLOW_TOKEN;

    /** Jobs of every queued or running workflow run in the repository. */
    async function activeJobs() {
      // A run whose jobs are partly running can still be listed as queued,
      // as run 37636486388 was with nine running jobs, so ask for both.
      const pages = await Promise.all(
        ["queued", "in_progress"].map((status) =>
          listPages(
            workflowToken,
            `${actionsApi}/runs?status=${status}`,
            "workflow_runs",
            runOf,
          ),
        ),
      );
      const runs = pages.flatMap(({ items }) => items);
      const current = runs.find((run) => run.id === currentRun);
      const jobsByRun = await Promise.all(
        runs.map(async (run) => {
          const jobs = await listPages(
            workflowToken,
            `${actionsApi}/runs/${run.id}/jobs?filter=latest`,
            "jobs",
            jobOf,
          );
          return {
            prior:
              run.id !== currentRun &&
              current != null &&
              run.createdAt < current.createdAt,
            jobs: jobs.items,
            complete: jobs.complete,
          };
        }),
      );
      return {
        runs: jobsByRun,
        complete:
          pages.every((page) => page.complete) &&
          jobsByRun.every((run) => run.complete),
      };
    }

    async function observe() {
      const runners = await listPages(
        runnerToken,
        `${actionsApi}/runners`,
        "runners",
        runnerOf,
      );
      const configured = selfHostedLaneLabels.slice(0, count);
      const lanes = configured.map((label) => {
        const carriers = runners.items.filter((item) =>
          item.labels.includes(label),
        );
        return { label, carriers, runner: usableRunner(carriers, label) };
      });
      const active =
        auto || lanes.some((lane) => lane.runner != null)
          ? await activeJobs()
          : { runs: [], complete: false };
      const jobs = active.runs.flatMap((run) => run.jobs);
      const observations = lanes.map(({ label, runner }): LaneObservation => {
        const ids = (status: string): ReadonlySet<number> =>
          new Set(
            jobs.flatMap((job) =>
              job.status === status &&
              job.labels.includes(label) &&
              job.id != null
                ? [job.id]
                : [],
            ),
          );
        return {
          usable: runner != null,
          busy: runner?.busy === true,
          queued: ids("queued"),
          running: ids("in_progress"),
        };
      });
      const complete =
        auto &&
        active.complete &&
        runners.complete &&
        runners.items.every(
          (runner) =>
            runner.labelsKnown &&
            runner.labels.every(
              (label) =>
                label !== "" &&
                (label === label.toLowerCase() ||
                  !configured.includes(label.toLowerCase())),
            ),
        ) &&
        lanes.every(
          ({ label, carriers, runner }) =>
            runner != null ||
            carriers.length === 0 ||
            (carriers.length === 1 &&
              carriers[0]?.name === label &&
              carriers[0].status === "offline"),
        );
      const backlog =
        complete &&
        active.runs.some(
          ({ prior, jobs: runJobs }) =>
            prior &&
            runJobs.some(
              ({ id, status, labels }) =>
                id != null &&
                status === "queued" &&
                labels.length === 1 &&
                stockMacLabels.has(labels[0]!),
            ),
        );
      return { observations, complete, backlog };
    }

    const first = await observe();
    let second = first;
    if (first.observations.some(suspicious)) {
      await sleep(delay);
      second = await observe();
    }
    for (let index = 0; index < count; index++) {
      const before = first.observations[index]!;
      const after = second.observations[index]!;
      if (before.usable && after.usable && !wedged(before, after)) {
        selections[index] = JSON.stringify([
          "self-hosted",
          "macOS",
          "ARM64",
          selfHostedLaneLabels[index],
        ]);
      }
    }
    const idleOwnLane = second.observations.some((after, index) => {
      const before = first.observations[index]!;
      return (
        after.usable &&
        !after.busy &&
        (!before.usable || !wedged(before, after))
      );
    });
    return {
      selections,
      avreaOverflow: first.complete && second.backlog && !idleOwnLane,
    };
  } catch {
    // API or network failure is a hosted decision, not a skipped test.
  }
  return { selections, avreaOverflow: false };
}

if (
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { selections, avreaOverflow } = await runnerRouting(process.env);
  const lines = [
    ...selections.map((value, index) => `r${index + 1}=${value}`),
    `avrea_overflow=${avreaOverflow}`,
    "",
  ].join("\n");
  if (process.env.GITHUB_OUTPUT == null) {
    throw new Error("GITHUB_OUTPUT is required");
  }
  await appendFile(process.env.GITHUB_OUTPUT, lines);
  process.stdout.write(
    selections.map((value, index) => `r${index + 1}: ${value}\n`).join("") +
      `Avrea overflow: ${avreaOverflow}\n`,
  );
}
