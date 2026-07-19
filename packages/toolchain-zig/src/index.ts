import type {
  NativeBuildInput,
  NativeBuildPlan,
  NativeToolchain,
  ProcessRequest,
  TargetName,
} from "@oseo/compiler";

const zigTargetNames = {
  "linux-aarch64-musl": "aarch64-linux-musl",
  "linux-x86_64-gnu": "x86_64-linux-gnu",
  "macos-aarch64": "aarch64-macos",
} as const satisfies Readonly<Record<TargetName, string>>;

function join(directory: string, name: string): string {
  return `${directory.replace(/\/$/u, "")}/${name}`;
}

function request(
  cwd: string,
  command: string,
  args: readonly string[],
): ProcessRequest {
  return { args, command, cwd };
}

/**
 * Derive a deterministic collision-free object name from one runtime
 * source path and its position in the ordered source list. The name
 * depends only on the source file name, the explicit input order, and
 * the explicit target, never on filesystem enumeration order, so
 * distinct sources sharing a base name still receive distinct objects.
 */
function objectName(
  sourcePath: string,
  index: number,
  targetSuffix: string,
): string {
  const baseName = sourcePath.slice(sourcePath.lastIndexOf("/") + 1);
  const stem = baseName.replace(/\.c$/u, "");
  return `${stem}-${index}-${targetSuffix}.o`;
}

/** Pinned Zig C toolchain adapter with explicit target selection. */
export const zigToolchain: NativeToolchain = {
  createBuildPlan(input: NativeBuildInput): NativeBuildPlan {
    if (input.runtimeSourcePaths.length === 0) {
      throw new Error("A native build requires at least one runtime source.");
    }
    const suffix = input.target.name;
    const zigTargetName = zigTargetNames[input.target.name];
    const runtimeSources = input.runtimeSourcePaths.map(
      (sourcePath, index) => ({
        objectPath: join(
          input.workingDirectory,
          objectName(sourcePath, index, suffix),
        ),
        sourcePath,
      }),
    );
    const archivePath = join(
      input.workingDirectory,
      `liboseo_runtime-${suffix}.a`,
    );
    const executablePath = join(input.workingDirectory, `fixture-${suffix}`);
    const common = [
      "-target",
      zigTargetName,
      "-std=c11",
      "-Wall",
      "-Wextra",
      "-Werror",
      "-pedantic",
      "-I",
      input.runtimeDirectory,
    ];
    const sanitizer =
      input.target.sanitizers.length === 0
        ? []
        : [`-fsanitize=${input.target.sanitizers.join(",")}`];
    return {
      executablePath,
      requests: [
        ...runtimeSources.map((source) =>
          request(input.workingDirectory, "zig", [
            "cc",
            ...common,
            ...sanitizer,
            "-c",
            source.sourcePath,
            "-o",
            source.objectPath,
          ]),
        ),
        request(input.workingDirectory, "zig", [
          "ar",
          "rcs",
          archivePath,
          ...runtimeSources.map((source) => source.objectPath),
        ]),
        request(input.workingDirectory, "zig", [
          "cc",
          ...common,
          ...sanitizer,
          input.generatedSourcePath,
          archivePath,
          "-o",
          executablePath,
        ]),
      ],
      target: input.target,
    };
  },
};
