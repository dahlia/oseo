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

/** Pinned Zig C toolchain adapter with explicit target selection. */
export const zigToolchain: NativeToolchain = {
  createBuildPlan(input: NativeBuildInput): NativeBuildPlan {
    const suffix = input.target.name;
    const zigTargetName = zigTargetNames[input.target.name];
    const objectPath = join(input.workingDirectory, `runtime-${suffix}.o`);
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
        request(input.workingDirectory, "zig", [
          "cc",
          ...common,
          ...sanitizer,
          "-c",
          input.runtimeSourcePath,
          "-o",
          objectPath,
        ]),
        request(input.workingDirectory, "zig", [
          "ar",
          "rcs",
          archivePath,
          objectPath,
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
