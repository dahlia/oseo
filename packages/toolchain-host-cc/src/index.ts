import { createHarnessObjectKey } from "@oseo/compiler";
import type {
  NativeToolchain,
  ProcessEnvironmentPolicy,
  TargetDescription,
} from "@oseo/compiler";
import { join } from "node:path";

function includePropertiesWhen<const Properties extends object>(
  properties: () => Properties | undefined,
): Properties | { [Key in keyof Properties]?: never } {
  return properties() ?? {};
}

/** Verified compiler inputs supplied by the composing entry point. */
export interface HostCcOptions {
  readonly compiler: string;
  readonly identity: string;
  readonly archiver: string;
  readonly target: TargetDescription;
}

/** Build environment allowlist: no ambient include or sanitizer options. */
export const hostCcEnvironment: ProcessEnvironmentPolicy = {
  inherit: ["PATH", "HOME", "TMPDIR"],
};

/** Plan instrumented builds for a compiler verified by the caller. */
export function createHostCcToolchain(options: HostCcOptions): NativeToolchain {
  const hostTarget =
    process.platform === "linux" && process.arch === "x64"
      ? "linux-x86_64-gnu"
      : process.platform === "darwin" && process.arch === "arm64"
        ? "macos-aarch64"
        : undefined;
  if (hostTarget == null || options.target.name !== hostTarget) {
    throw new Error(
      `Host C compiler requires execution host target ` +
        `${hostTarget ?? "(unsupported host)"}; got ${options.target.name}.`,
    );
  }
  const libraries = ["-lm", "-lpthread"];
  const flags = [
    "-std=c11",
    "-Wall",
    "-Wextra",
    "-Werror",
    "-pedantic",
    "-g",
    "-fno-omit-frame-pointer",
    "-fsanitize=address,undefined",
    "-fno-sanitize-recover=all",
  ];
  function requireTarget(target: TargetDescription): void {
    const fields = [
      "name",
      "architecture",
      "operatingSystem",
      "abi",
      "cStandard",
      "executableFormat",
    ] as const;
    if (
      fields.some((field) => target[field] !== options.target[field]) ||
      target.sanitizers.length !== options.target.sanitizers.length ||
      options.target.sanitizers.some(
        (kind) => !target.sanitizers.includes(kind),
      )
    ) {
      throw new Error(
        `Host C compiler ${options.compiler} supports only ` +
          `${options.target.name}; cannot build ${target.name}.`,
      );
    }
  }
  return {
    identity: options.identity,
    environment: hostCcEnvironment,
    createBuildPlan(input) {
      requireTarget(input.target);
      if (
        (input.prebuiltRuntimeArchivePath == null) ===
        (input.runtimeSourcePaths.length === 0)
      ) {
        throw new Error("Provide runtime sources or one prebuilt archive.");
      }
      const environment = input.environment ?? { variables: {} };
      for (const name of Object.keys(environment.variables)) {
        if (!hostCcEnvironment.inherit.includes(name)) {
          throw new Error(`Host C environment does not admit ${name}.`);
        }
      }
      const executablePath = join(input.workingDirectory, "fixture-host-cc");
      const archive =
        input.prebuiltRuntimeArchivePath ??
        join(input.workingDirectory, "liboseo-runtime-host-cc.a");
      const objects = input.runtimeSourcePaths.map((_, index) =>
        join(input.workingDirectory, `runtime-${index}.o`),
      );
      const common = [...flags, "-I", input.runtimeDirectory];
      return {
        executablePath,
        target: input.target,
        ...includePropertiesWhen(() => {
          if (input.prebuiltRuntimeArchivePath != null) return undefined;
          return { runtimeArchivePath: archive };
        }),
        requests: [
          ...input.runtimeSourcePaths.map((source, index) => ({
            command: options.compiler,
            args: [...common, "-O2", "-c", source, "-o", objects[index]!],
            cwd: input.workingDirectory,
            environment,
          })),
          ...(input.prebuiltRuntimeArchivePath == null
            ? [
                {
                  command: options.archiver,
                  args: ["rcs", archive, ...objects],
                  cwd: input.workingDirectory,
                  environment,
                },
              ]
            : []),
          {
            command: options.compiler,
            args: [
              ...common,
              ...((input.prebuiltObjectPaths?.length ?? 0) > 0 ||
              (input.additionalGeneratedSourcePaths?.length ?? 0) > 0
                ? ["-fno-lto"]
                : []),
              input.generatedSourcePath,
              ...(input.additionalGeneratedSourcePaths ?? []),
              ...(input.prebuiltObjectPaths ?? []),
              archive,
              ...libraries,
              "-o",
              executablePath,
            ],
            cwd: input.workingDirectory,
            environment,
          },
        ],
      };
    },
    harnessObjectReuse: {
      async createKey(input) {
        requireTarget(input.target);
        return await createHarnessObjectKey(input, {
          adapter: `host-cc-fragments-v1:${options.identity}`,
          compileFlags: [
            options.compiler,
            ...flags,
            "-I",
            ".",
            "-fno-lto",
            "-ffile-prefix-map=<working-directory>=/oseo/harness",
            "-c",
            "harness.c",
            "-o",
            "harness.o",
          ],
          runtimeFlags: [...flags, "-I", "<runtime-directory>", "-O2"],
          linkFlags: [
            options.compiler,
            ...flags,
            "-I",
            "<runtime-directory>",
            "-fno-lto",
            "<launcher>",
            "<case>",
            "<harness-object>",
            "<runtime-archive>",
            ...libraries,
          ],
        });
      },
      createBuildRequest(input) {
        requireTarget(input.target);
        for (const name of Object.keys(input.environment.variables)) {
          if (!hostCcEnvironment.inherit.includes(name)) {
            throw new Error(`Host C environment does not admit ${name}.`);
          }
        }
        return {
          command: options.compiler,
          args: [
            ...flags,
            "-I",
            ".",
            "-fno-lto",
            `-ffile-prefix-map=${input.workingDirectory}=/oseo/harness`,
            "-c",
            "harness.c",
            "-o",
            "harness.o",
          ],
          cwd: input.workingDirectory,
          environment: input.environment,
        };
      },
    },
    runtimeArchiveReuse: {
      createIdentityRequest(cwd, environment) {
        return {
          command: options.compiler,
          args: ["--version"],
          cwd,
          environment,
        };
      },
      async createKey(input) {
        requireTarget(input.target);
        const bytes = new TextEncoder().encode(
          JSON.stringify({
            adapter: "host-cc-v1",
            options,
            flags,
            libraries,
            input,
          }),
        );
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        return [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
      },
    },
  };
}
