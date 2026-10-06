import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const hosted = JSON.stringify("macos-15");

interface Runner {
  readonly name?: string;
  readonly status?: string;
  readonly busy?: boolean;
  readonly labels?: readonly { readonly name?: string }[];
}

interface RunnerList {
  readonly runners?: readonly Runner[];
}

type RunnerFetch = (
  url: string,
  init: {
    readonly headers: Readonly<Record<string, string>>;
    readonly signal: AbortSignal;
  },
) => Promise<{ readonly ok: boolean; json(): Promise<RunnerList> }>;

/** A runner's label names; a malformed entry throws and falls back. */
function labelsOf(runner: Runner): readonly string[] {
  return Array.isArray(runner.labels)
    ? runner.labels.map((entry) => entry.name ?? "")
    : [];
}

/** Mac lanes the generator may configure, one runner label each. */
const maxLanes = 2;

/**
 * Any push to dahlia/oseo, branch or tag, can select a Mac lane when
 * enabled, authenticated, and its runner is idle. Only write-access
 * collaborators can push there. PRs and forks stay hosted; decide once
 * before dispatch, with uncertainty retaining hosted coverage.
 *
 * Lane `i` selects only the runner named `oseo-mac-i`, and only when that
 * runner is the sole runner carrying the label, carries no other lane's
 * label, and is online and idle. Each lane decides independently, so an
 * offline or ambiguous runner sends only its own lane to hosted.
 */
export async function runnerSelections(
  env: Readonly<Record<string, string | undefined>>,
  // SAFETY: Only Response.ok and its JSON result are used and validated.
  fetchRunner: RunnerFetch = fetch as RunnerFetch,
): Promise<readonly string[]> {
  const count = Number(env.OSEO_SELFHOSTED_LANES);
  if (!Number.isInteger(count) || count < 1 || count > maxLanes) {
    throw new Error("OSEO_SELFHOSTED_LANES must be one or two");
  }
  const selections: string[] = Array.from({ length: count }, () => hosted);
  if (
    env.OSEO_SELFHOSTED_ENABLED !== "true" ||
    env.OSEO_EVENT !== "push" ||
    env.OSEO_REPOSITORY !== "dahlia/oseo" ||
    !env.OSEO_RUNNER_STATUS_TOKEN
  )
    return selections;

  try {
    async function listRunners(
      page: number,
      prior: Runner[],
    ): Promise<Runner[]> {
      const response = await fetchRunner(
        `https://api.github.com/repos/dahlia/oseo/actions/runners` +
          `?per_page=100&page=${page}`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${env.OSEO_RUNNER_STATUS_TOKEN}`,
            "X-GitHub-Api-Version": "2022-11-28",
          },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) throw new Error("Runner API unavailable");
      const body = await response.json();
      if (!Array.isArray(body.runners)) {
        throw new Error("Malformed runner API response");
      }
      const runners = [...prior, ...body.runners];
      if (body.runners.length < 100) return runners;
      if (page === 10) throw new Error("Runner API pagination limit");
      return listRunners(page + 1, runners);
    }
    const runners = await listRunners(1, []);
    const laneLabels = Array.from(
      { length: maxLanes },
      (_, index) => `oseo-mac-${index + 1}`,
    );
    for (let index = 0; index < count; index++) {
      const label = laneLabels[index]!;
      const carriers = runners.filter((runner) =>
        labelsOf(runner).includes(label),
      );
      const runner = carriers.length === 1 ? carriers[0]! : undefined;
      if (
        runner != null &&
        runner.name === label &&
        runner.status === "online" &&
        runner.busy === false &&
        laneLabels.every(
          (other) => other === label || !labelsOf(runner).includes(other),
        )
      ) {
        selections[index] = JSON.stringify([
          "self-hosted",
          "macOS",
          "ARM64",
          label,
        ]);
      }
    }
  } catch {
    // API or network failure is a hosted decision, not a skipped test.
  }
  return selections;
}

if (
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const selections = await runnerSelections(process.env);
  const lines =
    selections.map((value, index) => `r${index + 1}=${value}`).join("\n") +
    "\n";
  if (process.env.GITHUB_OUTPUT == null) {
    throw new Error("GITHUB_OUTPUT is required");
  }
  await appendFile(process.env.GITHUB_OUTPUT, lines);
  process.stdout.write(
    selections.map((value, index) => `r${index + 1}: ${value}\n`).join(""),
  );
}
