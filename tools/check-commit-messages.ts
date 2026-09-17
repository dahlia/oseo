import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  checkCommitTrailers,
  formatCommitMessageProblems,
} from "./check-commit-message.ts";

/** The number inspected and the per-commit rejection diagnostics. */
export interface CommitMessagesResult {
  readonly count: number;
  readonly reports: readonly string[];
}

/**
 * Check only the attribution rule: published history predates the hook's
 * length rules. A single revision means all reachable commits; zero..head
 * is the same spelling GitHub uses for a new branch's push event.
 * Resolve endpoints before rev-list so invalid refs and options fail closed.
 */
export function checkCommitMessages(
  range: string,
  cwd: string = process.cwd(),
): CommitMessagesResult {
  const git = (args: readonly string[]): string =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
    });
  const commit = (revision: string): string =>
    git([
      "rev-parse",
      "--verify",
      "--end-of-options",
      `${revision}^{commit}`,
    ]).trim();
  const parts = range.split("..");
  if (
    parts.length > 2 ||
    parts.some((part) => part === "" || part.startsWith("."))
  ) {
    throw new Error("Expected a revision or base..head range");
  }
  const base = parts.length === 2 ? parts[0] : undefined;
  const head = commit(parts[parts.length - 1] ?? "");
  const selection =
    base == null || /^(?:0{40}|0{64})$/u.test(base)
      ? head
      : `${commit(base)}..${head}`;
  const commits = git(["rev-list", selection, "--"]).trim();
  const reports: string[] = [];
  const hashes = commits === "" ? [] : commits.split("\n");
  for (const hash of hashes) {
    const text = git(["show", "--no-patch", "--format=%B", hash, "--"]);
    // These are stored messages, not editor files: do not strip commentary.
    const problems = checkCommitTrailers(text, "", cwd);
    if (problems.length > 0) {
      reports.push(
        `Commit ${hash} has forbidden trailers:\n` +
          formatCommitMessageProblems(problems, text, ""),
      );
    }
  }
  return { count: hashes.length, reports };
}

const entry = process.argv[1];
if (entry != null && resolve(entry) === fileURLToPath(import.meta.url)) {
  const range = process.argv[2];
  if (range == null || process.argv.length !== 3) {
    process.stderr.write(
      "Usage: check-commit-messages <revision|base..head>\n",
    );
    process.exit(2);
  }
  const result = checkCommitMessages(range);
  if (result.reports.length > 0) {
    process.stderr.write(result.reports.join("\n\n") + "\n");
    process.exit(1);
  }
  console.log(`commit-messages passed commits=${result.count}`);
}
