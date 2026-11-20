/*
 * Oseo, an ahead-of-time compiler for JavaScript and TypeScript.
 * Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

import { checkWorkspaceVersions } from "../versions.ts";

const number = String.raw`(?:0|[1-9]\d*)`;
const stable = new RegExp(`^${number}\\.${number}\\.${number}$`, "u");
const sequence = /^[1-9]\d*$/u;
const commit = /^[a-f0-9]{40}$/u;
export const canonical = "dahlia/oseo";

export interface ReleaseIdentity {
  readonly sha: string;
  readonly channel: "build" | "canary" | "stable";
  readonly npm: string;
  readonly jsr: string;
  readonly run: string;
}

/** Select versions without using the attempt counter or mutating manifests. */
export function identify(
  base: string,
  sha: string,
  env: NodeJS.ProcessEnv,
): ReleaseIdentity {
  if (!stable.test(base) || !commit.test(sha)) {
    throw new Error("Expected a stable base version and a full source SHA.");
  }
  const run = env.GITHUB_RUN_NUMBER ?? "0";
  if (env.GITHUB_ACTIONS === "true" && !sequence.test(run)) {
    throw new Error("Missing or invalid GitHub run number.");
  }
  if (env.GITHUB_SHA != null && env.GITHUB_SHA !== sha) {
    throw new Error("Checkout does not match the workflow source SHA.");
  }
  if (env.GITHUB_REPOSITORY === canonical && env.GITHUB_EVENT_NAME === "push") {
    if (env.GITHUB_REF === "refs/heads/main") {
      const npm = `${base}-canary.${run}`;
      return {
        sha,
        channel: "canary",
        npm,
        jsr: `${npm}+${sha.slice(0, 7)}`,
        run,
      };
    }
    const tag = env.GITHUB_REF?.match(/^refs\/tags\/(.+)$/u)?.[1];
    if (tag != null && stable.test(tag)) {
      if (tag !== base) throw new Error(`Tag ${tag} does not match ${base}.`);
      return { sha, channel: "stable", npm: base, jsr: base, run };
    }
  }
  return { sha, channel: "build", npm: base, jsr: base, run };
}

export function git(
  args: readonly string[],
  cwd: string = process.cwd(),
): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/** Validate the workspace and freeze stable notes before building. */
export async function prepare(
  root: string,
  destination: string,
): Promise<ReleaseIdentity> {
  const workspace = await checkWorkspaceVersions(root);
  const { version } = workspace;
  const release = identify(
    version,
    git(["rev-parse", "HEAD"], root),
    process.env,
  );
  if (release.channel === "canary") {
    const next = readFileSync(join(root, "changes.d/next"), "utf8").trim();
    if (next !== version)
      throw new Error("Main canary must use changes.d/next.");
  }
  if (release.channel === "stable") {
    if (!("state" in workspace) || workspace.state !== "released") {
      throw new Error("A stable tag must point to a frozen release commit.");
    }
    if (git(["rev-parse", `${release.npm}^{commit}`], root) !== release.sha) {
      throw new Error("Release tag does not resolve to the source commit.");
    }
    const notes = execFileSync(
      "sacho",
      ["show", release.npm, "--no-word-wrap", "--skip-heading"],
      { cwd: root, encoding: "utf8" },
    );
    if (notes.trim() === "") throw new Error("Released changelog is empty.");
    writeFileSync(join(destination, "notes.md"), notes, { flag: "wx" });
  }
  writeFileSync(join(destination, "identity.json"), JSON.stringify(release), {
    flag: "wx",
  });
  if (process.env.GITHUB_OUTPUT != null) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(release)
        .map(([key, value]) => `${key}=${value}\n`)
        .join(""),
    );
  }
  return release;
}
