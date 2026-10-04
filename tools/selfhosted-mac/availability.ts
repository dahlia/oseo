import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const hosted = JSON.stringify("macos-15");

interface Runner {
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

/**
 * Any push to dahlia/oseo, branch or tag, can select the Mac when enabled,
 * authenticated, and idle. Only write-access collaborators can push there.
 * PRs and forks stay hosted; decide once before dispatch, with uncertainty
 * retaining hosted coverage.
 */
export async function runnerSelections(
  env: Readonly<Record<string, string | undefined>>,
  // SAFETY: Only Response.ok and its JSON result are used and validated.
  fetchRunner: RunnerFetch = fetch as RunnerFetch,
): Promise<readonly string[]> {
  const count = Number(env.OSEO_SELFHOSTED_LANES);
  if (count !== 1) {
    throw new Error("OSEO_SELFHOSTED_LANES must be one");
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
    for (let index = 0; index < count; index++) {
      const label = `oseo-mac-${index + 1}`;
      const runner = runners.find(
        (item) =>
          item.status === "online" &&
          item.busy === false &&
          Array.isArray(item.labels) &&
          item.labels.some((entry) => entry.name === label),
      );
      if (runner != null) {
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
