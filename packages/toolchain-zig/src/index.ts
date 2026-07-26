import type {
  NativeBuildInput,
  NativeBuildPlan,
  NativeToolchain,
  ProcessRequest,
  RuntimeArchiveKeyInput,
  TargetDescription,
  TargetName,
} from "@oseo/compiler";
import { posix, win32 } from "node:path";

const zigTargetNames = {
  "linux-aarch64-musl": "aarch64-linux-musl",
  "linux-x86_64-gnu": "x86_64-linux-gnu",
  "macos-aarch64": "aarch64-macos",
} as const satisfies Readonly<Record<TargetName, string>>;

/**
 * Host variables admitted to Zig subprocesses. The policy permits executable
 * selection, compiler caches, and diagnostic presentation, but excludes
 * mutable compiler inputs such as external include paths and libc
 * configuration. The resolved zig_exe identifies the PATH-selected compiler.
 */
const zigEnvironment = {
  inherit: [
    "PATH",
    "HOME",
    "XDG_CACHE_HOME",
    "LOCALAPPDATA",
    "PROGRAMDATA",
    "ZIG_GLOBAL_CACHE_DIR",
    "ZIG_LOCAL_CACHE_DIR",
    "ZIG_BUILD_ERROR_STYLE",
    "ZIG_BUILD_MULTILINE_ERRORS",
    "ZIG_VERBOSE_LINK",
    "ZIG_VERBOSE_CC",
    "ZIG_DEBUG_CMD",
    "NO_COLOR",
    "CLICOLOR_FORCE",
  ],
} as const;

function requireZigEnvironment(
  environment: NativeBuildInput["environment"],
): void {
  if (environment == null) return;
  for (const name of Object.keys(environment.variables)) {
    if (!zigEnvironment.inherit.some((admitted) => admitted === name)) {
      throw new Error(
        `Environment variable '${name}' is not admitted by the ` +
          "Zig environment policy.",
      );
    }
  }
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function pathOperations(paths: readonly string[]): typeof posix {
  if (
    paths.some(
      (path) =>
        /^(?:[A-Za-z]:[\\/]|[/\\]{2}[^/\\])/u.test(path) || path.includes("\\"),
    )
  ) {
    return win32;
  }
  if (paths.some((path) => path.startsWith("/") || path.includes("/"))) {
    return posix;
  }
  return process.platform === "win32" ? win32 : posix;
}

function join(
  operations: typeof posix,
  directory: string,
  name: string,
): string {
  return operations.join(directory, name);
}

function request(
  cwd: string,
  command: string,
  args: readonly string[],
  environment?: NativeBuildInput["environment"],
): ProcessRequest {
  requireZigEnvironment(environment);
  return {
    args,
    command,
    cwd,
    ...(environment == null ? {} : { environment }),
  };
}

function sanitizerFlags(target: TargetDescription): readonly string[] {
  return target.sanitizers.length === 0
    ? []
    : [`-fsanitize=${target.sanitizers.join(",")}`];
}

function commonFlags(
  target: TargetDescription,
  runtimeDirectory: string,
): readonly string[] {
  return [
    "-target",
    zigTargetNames[target.name],
    "-std=c11",
    "-Wall",
    "-Wextra",
    "-Werror",
    "-pedantic",
    "-I",
    runtimeDirectory,
    ...sanitizerFlags(target),
  ];
}

function runtimePathFlags(): readonly string[] {
  return ["-fdebug-compilation-dir=/oseo/runtime"];
}

function relativePath(
  operations: typeof posix,
  fromDirectory: string,
  path: string,
): string {
  return operations.relative(
    operations.normalize(fromDirectory),
    operations.normalize(path),
  );
}

function archiveKeyRecord(input: RuntimeArchiveKeyInput): object {
  requireZigEnvironment(input.toolchainEnvironment);
  const runtimeCommon = commonFlags(input.target, ".");
  const linkCommon = commonFlags(input.target, "<runtime-directory>");
  return {
    archiveInvocation: [
      "ar",
      "rcs",
      "<runtime-archive>",
      "<ordered-runtime-objects>",
    ],
    compileInvocation: [
      "cc",
      ...runtimeCommon,
      ...runtimePathFlags(),
      "-c",
      "<runtime-source>",
      "-o",
      "<runtime-object>",
    ],
    linkInvocation: [
      "cc",
      ...linkCommon,
      "<generated-source>",
      "<runtime-archive>",
      "-o",
      "<executable>",
    ],
    runtimeAbiVersion: input.runtimeAbiVersion,
    runtimeAssets: input.runtimeAssets.map((asset) => ({
      contents: asset.contents,
      kind: asset.kind,
      name: asset.name,
    })),
    target: {
      abi: input.target.abi ?? null,
      architecture: input.target.architecture,
      cStandard: input.target.cStandard,
      executableFormat: input.target.executableFormat,
      name: input.target.name,
      operatingSystem: input.target.operatingSystem,
      sanitizers: [...input.target.sanitizers],
    },
    toolchain: "zig",
    toolchainEnvironmentPolicy: zigEnvironment.inherit,
    toolchainEnvironmentSnapshot: Object.fromEntries(
      Object.entries(input.toolchainEnvironment.variables).toSorted(
        ([left], [right]) => compareCodeUnits(left, right),
      ),
    ),
    toolchainIdentity: input.toolchainIdentity,
  };
}

async function createRuntimeArchiveKey(
  input: RuntimeArchiveKeyInput,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    JSON.stringify(archiveKeyRecord(input)),
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Derive a deterministic collision-free object name from one runtime
 * source path and its position in the ordered source list. The name
 * depends only on the source file name, the explicit input order, and
 * the explicit target, never on filesystem enumeration order, so
 * distinct sources sharing a base name still receive distinct objects.
 */
function objectName(
  operations: typeof posix,
  sourcePath: string,
  index: number,
  targetSuffix: string,
): string {
  const baseName = operations.basename(sourcePath);
  const stem = baseName.replace(/\.c$/u, "");
  return `${stem}-${index}-${targetSuffix}.o`;
}

/** Pinned Zig C toolchain adapter with explicit target selection. */
export const zigToolchain: NativeToolchain = {
  environment: zigEnvironment,
  createBuildPlan(input: NativeBuildInput): NativeBuildPlan {
    if (
      input.prebuiltRuntimeArchivePath != null &&
      input.runtimeSourcePaths.length !== 0
    ) {
      throw new Error(
        "A prebuilt runtime archive cannot be combined with runtime sources.",
      );
    }
    if (
      input.prebuiltRuntimeArchivePath == null &&
      input.runtimeSourcePaths.length === 0
    ) {
      throw new Error("A native build requires at least one runtime source.");
    }
    const suffix = input.target.name;
    const operations = pathOperations([
      input.generatedSourcePath,
      input.prebuiltRuntimeArchivePath ?? "",
      input.runtimeDirectory,
      ...input.runtimeSourcePaths,
      input.workingDirectory,
    ]);
    const runtimeSources = input.runtimeSourcePaths.map(
      (sourcePath, index) => ({
        objectPath: join(
          operations,
          input.workingDirectory,
          objectName(operations, sourcePath, index, suffix),
        ),
        sourceArgument: relativePath(
          operations,
          input.runtimeDirectory,
          sourcePath,
        ),
      }),
    );
    const builtArchivePath =
      input.prebuiltRuntimeArchivePath == null
        ? join(
            operations,
            input.workingDirectory,
            `liboseo_runtime-${suffix}.a`,
          )
        : undefined;
    const archivePath =
      input.prebuiltRuntimeArchivePath ?? builtArchivePath ?? "";
    const executablePath = join(
      operations,
      input.workingDirectory,
      `fixture-${suffix}`,
    );
    const runtimeCommon = commonFlags(input.target, ".");
    const linkCommon = commonFlags(input.target, input.runtimeDirectory);
    const runtimePaths = runtimePathFlags();
    return {
      executablePath,
      requests: [
        ...runtimeSources.map((source) =>
          request(
            input.runtimeDirectory,
            "zig",
            [
              "cc",
              ...runtimeCommon,
              ...runtimePaths,
              "-c",
              source.sourceArgument,
              "-o",
              source.objectPath,
            ],
            input.environment,
          ),
        ),
        ...(builtArchivePath == null
          ? []
          : [
              request(
                input.workingDirectory,
                "zig",
                [
                  "ar",
                  "rcs",
                  builtArchivePath,
                  ...runtimeSources.map((source) => source.objectPath),
                ],
                input.environment,
              ),
            ]),
        request(
          input.workingDirectory,
          "zig",
          [
            "cc",
            ...linkCommon,
            input.generatedSourcePath,
            archivePath,
            "-o",
            executablePath,
          ],
          input.environment,
        ),
      ],
      ...(builtArchivePath == null
        ? {}
        : { runtimeArchivePath: builtArchivePath }),
      target: input.target,
    };
  },
  runtimeArchiveReuse: {
    createKey: createRuntimeArchiveKey,
    createIdentityRequest(workingDirectory, environment) {
      return request(workingDirectory, "zig", ["env"], environment);
    },
  },
};
