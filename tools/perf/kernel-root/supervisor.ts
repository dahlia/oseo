import type { FileIdentity } from "../../perf-profile-capture.ts";

type SupervisorFile = Pick<FileIdentity, "path" | "bytes" | "sha256" | "mode">;

/**
 * Private structural view of the unchanged ff3556 supervisor request.
 * The pinned supervisor validates the full request before spawning anything.
 * This declares no Oseo public API and implements no replacement supervisor.
 */
export interface KernelSupervisorRequest {
  readonly source: {
    readonly root: string;
    readonly head: string;
    readonly tree: string;
  };
  readonly git: SupervisorFile;
  readonly node: SupervisorFile;
  readonly entry: SupervisorFile;
  readonly inputs: readonly SupervisorFile[];
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly outputRoot: string;
  readonly limits: {
    readonly timeoutMs: number;
    readonly termGraceMs: number;
    readonly cleanupMs: number;
    readonly maxStdoutBytes: number;
    readonly maxStderrBytes: number;
    readonly gitTimeoutMs: number;
  };
  readonly abortOnStdinEnd: boolean;
}

/** Only original returned cleanup facts consumed by this private caller. */
export interface KernelSupervision {
  readonly success: boolean;
  readonly cleanup: {
    readonly leaderExited: boolean;
    readonly groupEmptyAtFinalProbe: boolean | null;
    readonly streamsClosed: boolean;
  } | null;
}

/** Exact existing entry name, loaded only after normal source verification. */
export interface KernelSupervisorApi {
  readonly supervise: (
    request: KernelSupervisorRequest,
    options: { readonly signal: AbortSignal },
  ) => Promise<KernelSupervision>;
}
