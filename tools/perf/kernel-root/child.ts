import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fileIdentity } from "../../perf-profile-capture.ts";
import type {
  AdmissionProof,
  ExclusionProof,
  ExclusionStart,
  OrderedComparisonOptions,
  BoundaryProof,
  ComparisonRequest,
  WindowBounds,
} from "../ordered-comparison.ts";
import { hostMetadata } from "../prepare.ts";
import { createKernelRootBoundaries } from "./boundaries.ts";
import { writeKernelControl, waitKernelControl } from "./control.ts";
import type { KernelControl, KernelResponse } from "./control.ts";
import { verifyKernelSource } from "./source.ts";
import type { KernelSource } from "./source.ts";
import { startChildLifetime } from "./lifetime.ts";
import type { KernelLifetimeInput } from "./lifetime.ts";

/** Trusted parent allocation; a hash binds bytes and grants no authority. */
export interface KernelChildAllocation {
  readonly source: KernelSource;
  readonly lifetime: KernelLifetimeInput | null;
  readonly parentPid: number;
  readonly channel: string;
  readonly responseMs: number;
  readonly comparison: Omit<OrderedComparisonOptions, "source" | "boundaries">;
}

/** Run synchronous H in the owned child, with P callbacks kept in process. */
export async function runKernelRootChild(
  path: string,
  sha256: string,
): Promise<void> {
  const allocationPin = fileIdentity(path);
  assert.equal(allocationPin.sha256, sha256);
  assert.equal(allocationPin.realpath, path);
  assert.equal(allocationPin.mode, 0o600);
  assert.equal(lstatSync(path).uid, process.getuid!());
  // SAFETY: private parent allocation, checked against the actual parent,
  // source, closure and frozen comparison below; it is not a control frame.
  const input = JSON.parse(readFileSync(path, "utf8")) as KernelChildAllocation;
  assert.deepEqual(fileIdentity(path), allocationPin);
  assert.equal(process.ppid, input.parentPid);
  assert.equal(process.cwd(), input.source.root);
  const lifetime =
    input.lifetime == null
      ? null
      : await startChildLifetime({
          deployment: input.lifetime,
          parentPid: input.parentPid,
        });
  let sequence = 0;
  const stopped = new AbortController();
  const interrupted = () =>
    stopped.abort(new Error("Kernel child interrupted"));
  process.once("SIGTERM", interrupted);
  process.once("SIGINT", interrupted);
  const exchange = async (
    phase: string,
    request: ComparisonRequest,
    bounds: WindowBounds | null = null,
    failure: string | null = null,
  ): Promise<BoundaryProof> => {
    const control: KernelControl = {
      sequence: sequence++,
      childPid: process.pid,
      parentPid: process.ppid,
      phase,
      request,
      bounds,
      failure,
    };
    const name = String(control.sequence).padStart(3, "0");
    writeKernelControl(join(input.channel, name + ".request.json"), control);
    const response = await waitKernelControl<KernelResponse>(
      input.channel,
      name + ".response.json",
      input.responseMs,
      stopped.signal,
    );
    assert.deepEqual(response.control, control);
    assert.equal(response.proof.requestId, request.id);
    assert.equal(response.proof.status, "complete");
    return response.proof;
  };
  try {
    verifyKernelSource(input.source);
    // SAFETY: verifyKernelSource pinned H's accepted normal source and closure.
    const h = (await import(
      pathToFileURL(join(input.source.root, "tools/perf/ordered-comparison.ts"))
        .href
    )) as typeof import("../ordered-comparison.ts");
    const result = await h.runOrderedComparison({
      ...input.comparison,
      source: () => ({
        host: hostMetadata(),
        tree: execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
          encoding: "utf8",
          timeout: 30_000,
        }).trim(),
      }),
      boundaries: createKernelRootBoundaries({
        sourceDirectory: input.source.root,
        diagnose: (request) => exchange("diagnosis", request),
        // SAFETY: the parent binds this exchange; H checks authority/purpose.
        admit: async (request, purpose) =>
          (await exchange(`${purpose}-admission`, request)) as AdmissionProof,
        exclude: async (request, purpose) => ({
          // SAFETY: the parent binds the open proof; H checks host/state/raw.
          opened: (await exchange(
            `${purpose}-exclusion`,
            request,
          )) as ExclusionStart,
          // SAFETY: H checks the parent-bound whole-window proof and bounds.
          finish: async (bounds) =>
            (await exchange(
              `${purpose}-exclusion-close`,
              request,
              bounds,
            )) as ExclusionProof,
        }),
        finalize: (request, failure) =>
          exchange("finalize", request, null, failure),
      }),
    });
    if (result.status !== "complete") throw new Error(JSON.stringify(result));
  } finally {
    lifetime?.stop();
    if (lifetime) await lifetime.done;
    process.off("SIGTERM", interrupted);
    process.off("SIGINT", interrupted);
  }
}

if (
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  assert.equal(process.argv.length, 4);
  await runKernelRootChild(process.argv[2]!, process.argv[3]!);
}
