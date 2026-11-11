import { join } from "node:path";

import type { Kernel } from "./corpus.ts";
import { requireIterations } from "./corpus.ts";

/** Only matching native execution hosts produce comparison evidence. */
export type PerfHost = "linux-x86_64-gnu" | "macos-aarch64";

/** Commands are argv arrays, never shell fragments. */
export interface Command {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly stdin?: Uint8Array | readonly number[];
}

/** One independently built engine/policy form of a kernel. */
export interface Variant {
  readonly id: string;
  readonly run: Command;
  readonly builds: readonly Command[];
  readonly executable: string | null;
  readonly generatedC: string | null;
  readonly specialization: "enabled" | "disabled" | null;
  readonly blocked: string | null;
}

/** Planned repetitions are recorded before any measurement begins. */
export interface Method {
  readonly warmups: number;
  readonly repetitions: number;
  readonly iterations: number;
  readonly order: "rotating";
}

/** Fixed initial policy; Root may choose a new recorded run, never trim one. */
export const defaultMethod: Method = {
  warmups: 3,
  repetitions: 15,
  iterations: 100,
  order: "rotating",
};

/** Resolve execution capability without introducing a new target ID. */
export function perfHost(platform: string, architecture: string): PerfHost {
  if (platform === "linux" && architecture === "x64") {
    return "linux-x86_64-gnu";
  }
  if (platform === "darwin" && architecture === "arm64") {
    return "macos-aarch64";
  }
  throw new Error(`Unsupported performance host: ${platform}/${architecture}`);
}

/** Reject incomplete sampling policies instead of quietly shortening runs. */
export function validateMethod(method: Method): void {
  if (method == null || method.order !== "rotating") {
    throw new Error("Rotating engine order is required.");
  }
  requireIterations(method.iterations);
  if (!Number.isSafeInteger(method.warmups) || method.warmups < 3) {
    throw new Error("At least three warmups are required.");
  }
  if (!Number.isSafeInteger(method.repetitions) || method.repetitions < 15) {
    throw new Error("At least fifteen repetitions are required.");
  }
}

/** Rotate engine order per repetition to distribute temperature/load drift. */
export function orderForRound<T>(values: readonly T[], round: number): T[] {
  if (!Number.isSafeInteger(round) || round < 0 || values.length === 0) {
    throw new Error("Order requires a nonempty matrix and a valid round.");
  }
  const offset = round % values.length;
  return [...values.slice(offset), ...values.slice(0, offset)];
}

const seaFuse = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

function interpreted(
  id: string,
  command: string,
  args: readonly string[],
): Variant {
  return {
    id,
    run: { command, args },
    builds: [],
    executable: null,
    generatedC: null,
    specialization: null,
    blocked: null,
  };
}

/**
 * Prepare reference recipes and native destinations. The build driver uses
 * the landed compiler API for Oseo; it never assumes a retained-build CLI.
 */
export function variants(
  kernel: Kernel,
  directory: string,
  host: PerfHost,
  nodeExecutable: string,
): readonly Variant[] {
  const source = join(directory, `${kernel.id}.js`);
  const executable = (suffix: string) => join(directory, kernel.id + suffix);
  const compiled = (id: string, builds: readonly Command[]): Variant => ({
    ...interpreted(id, executable(`-${id}`), []),
    executable: executable(`-${id}`),
    builds,
  });
  const sea = executable("-node-sea");
  const seaBuilds: Command[] = [
    {
      command: "node",
      args: ["--experimental-sea-config", source + ".sea.json"],
    },
    { command: "cp", args: [nodeExecutable, sea] },
  ];
  if (host === "macos-aarch64") {
    seaBuilds.push({ command: "codesign", args: ["--remove-signature", sea] });
  }
  seaBuilds.push({
    command: "postject",
    args: [
      sea,
      "NODE_SEA_BLOB",
      source + ".blob",
      "--sentinel-fuse",
      seaFuse,
      ...(host === "macos-aarch64" ? ["--macho-segment-name", "NODE_SEA"] : []),
    ],
  });
  if (host === "macos-aarch64") {
    seaBuilds.push({ command: "codesign", args: ["--sign", "-", sea] });
  }
  return [
    ...(["enabled", "disabled"] as const).map((specialization) => {
      const id = `oseo-${specialization}`;
      const role = kernel.id === "startup" ? "startup" : "timed";
      const nativePath = join(
        directory,
        `${kernel.id}-${id}-${role}`,
        `fixture-${host}`,
      );
      return {
        id,
        run: { command: nativePath, args: [] },
        builds: [],
        executable: nativePath,
        specialization,
        // The backend assigns the complete unit list during the build.
        generatedC: null,
        blocked: null,
      };
    }),
    interpreted("node", "node", [source]),
    interpreted("node-jitless", "node", ["--jitless", source]),
    interpreted("deno", "deno", ["run", "--no-config", source]),
    interpreted("bun", "bun", ["run", source]),
    compiled("node-sea", seaBuilds),
    compiled("deno-compile", [
      {
        command: "deno",
        args: [
          "compile",
          "--no-config",
          "--output",
          executable("-deno-compile"),
          source,
        ],
      },
    ]),
    compiled("bun-compile", [
      {
        command: "bun",
        args: [
          "build",
          "--compile",
          source,
          "--outfile",
          executable("-bun-compile"),
        ],
      },
    ]),
  ];
}
