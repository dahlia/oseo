import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { captureArtifact } from "../../perf-profile-capture.ts";
import type {
  ComparisonBoundaries,
  ProfileInput,
  ProfileProof,
} from "../ordered-comparison.ts";
import { kernelCaptureRequest, kernelStdoutChecker } from "./profile.ts";
import { replayKernelProfile } from "./profile-replay.ts";

/**
 * Private direct Root operations, using H's existing proof contracts.
 * Root must consume S raw and P raw, not pass through their status fields.
 * The child retains P callbacks; the independent parent owns OS evidence.
 */
export interface KernelRootOperations extends Omit<
  ComparisonBoundaries,
  "profile"
> {
  /** Exact clean H checkout observed by P's source commands. */
  readonly sourceDirectory: string;
}

/**
 * Connect H to P without changing either API or creating an admission origin.
 * Trusted Root supplies all operational decisions after dependency acceptance.
 */
export function createKernelRootBoundaries(
  operations: KernelRootOperations,
): ComparisonBoundaries {
  const root = Object.freeze({ ...operations });
  for (const name of ["diagnose", "admit", "exclude", "finalize"] as const) {
    assert.ok(Object.hasOwn(root, name), `Missing Root ${name}`);
  }
  return Object.freeze({
    diagnose: root.diagnose,
    admit: root.admit,
    exclude: root.exclude,
    finalize: root.finalize,
    profile: async (input: ProfileInput): Promise<ProfileProof> => {
      const request = kernelCaptureRequest(input);
      mkdirSync(input.request.destination, { mode: 0o700 });
      const directory = join(input.request.destination, "profile");
      const completed = await captureArtifact(
        request,
        directory,
        kernelStdoutChecker(input),
      );
      assert.equal(completed, true, "P capture failed or remained incomplete");
      const proof = replayKernelProfile(input, directory, root.sourceDirectory);
      // H validates report8, target output, executable and launch identity.
      return proof;
    },
  });
}
