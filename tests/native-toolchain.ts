/* eslint-disable no-await-in-loop -- Compiler probing is ordered. */
import { spawnSync } from "node:child_process";
import {
  accessSync,
  constants,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describeTarget } from "../packages/compiler/src/index.ts";
import type { NativeToolchain } from "../packages/compiler/src/index.ts";
import {
  createHostCcToolchain,
  hostCcEnvironment,
} from "../packages/toolchain-host-cc/src/index.ts";
import { zigToolchain } from "../packages/toolchain-zig/src/index.ts";

/** The sanitizer lane is an explicit test-entry-point choice. */
export const hostCcLane: boolean =
  process.env.OSEO_NATIVE_TOOLCHAIN === "host-cc";

function executable(name: string): string | undefined {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    const path = join(directory, name);
    try {
      accessSync(path, constants.X_OK);
      return realpathSync(path);
    } catch {
      /* Try the next PATH directory. */
    }
  }
  return undefined;
}

/** Select once, then fail closed if the chosen compiler lacks ASan. */
function select(): NativeToolchain {
  if (!hostCcLane) return zigToolchain;
  const target =
    process.platform === "linux" && process.arch === "x64"
      ? describeTarget("linux-x86_64-gnu")
      : process.platform === "darwin" && process.arch === "arm64"
        ? describeTarget("macos-aarch64")
        : undefined;
  if (target == null)
    throw new Error(
      `Unsupported host C execution host: ` +
        `${process.platform}/${process.arch}.`,
    );
  for (const name of [
    "ASAN_OPTIONS",
    "LSAN_OPTIONS",
    "UBSAN_OPTIONS",
    "LD_PRELOAD",
    "LD_LIBRARY_PATH",
    "DYLD_LIBRARY_PATH",
    "DYLD_INSERT_LIBRARIES",
  ]) {
    if (process.env[name] != null) {
      throw new Error(`Unset ${name} before running the sanitizer lane.`);
    }
  }
  const override = process.env.OSEO_HOST_CC;
  if (override != null && override !== "clang" && override !== "gcc") {
    throw new Error("OSEO_HOST_CC must be clang or gcc.");
  }
  const compiler =
    override == null
      ? (executable("clang") ?? executable("gcc"))
      : executable(override);
  if (compiler == null) throw new Error("Install clang or gcc for host-cc.");
  const archiver = executable("ar");
  if (archiver == null) throw new Error("Install ar for host-cc archives.");
  const env = Object.fromEntries(
    hostCcEnvironment.inherit.flatMap((name) => {
      const value = process.env[name];
      return value == null ? [] : [[name, value]];
    }),
  );
  const version = spawnSync(compiler, ["--version"], {
    env,
    encoding: "utf8",
    timeout: 30_000,
  });
  if (
    version.error != null ||
    version.status !== 0 ||
    version.stdout.trim() === ""
  ) {
    throw new Error(
      `Cannot identify ${compiler}: --version failed or was ` +
        `empty.\n${version.error?.message ?? version.stderr}`,
    );
  }
  const identity = `${compiler}\n${version.stdout.trim()}`;
  const directory = mkdtempSync(join(tmpdir(), "oseo-cc-probe-"));
  try {
    const source = join(directory, "probe.c");
    const binary = join(directory, "probe");
    writeFileSync(
      source,
      `#include <stdlib.h>
int main(int argc, char **argv) {
  (void)argv;
  void *(*volatile allocate)(size_t) = malloc;
  volatile int *p = allocate(sizeof(int));
  if (!p) return 2;
  p[argc] = 42;
  free((void *)p);
  return 0;
}
`,
    );
    const built = spawnSync(
      compiler,
      [
        "-fsanitize=address,undefined",
        "-fno-sanitize-recover=all",
        source,
        "-o",
        binary,
      ],
      {
        env,
        encoding: "utf8",
        timeout: 120_000,
      },
    );
    if (built.error != null || built.status !== 0) {
      throw new Error(
        `${identity}\nSanitizer compile/link probe failed; ` +
          `install this compiler's ASan and UBSan runtimes.\n${built.stderr}`,
      );
    }
    const observed = spawnSync(binary, [], {
      env,
      encoding: "utf8",
      timeout: 30_000,
    });
    if (
      observed.error != null ||
      observed.status === 0 ||
      !/AddressSanitizer: heap-buffer-overflow/u.test(observed.stderr)
    ) {
      throw new Error(
        `${identity}\nAddressSanitizer runtime is not working:` +
          `\n${observed.stderr}`,
      );
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  process.env.OSEO_HOST_CC_IDENTITY = identity;
  console.error(`host-cc sanitizer compiler: ${identity}`);
  return createHostCcToolchain({ compiler, archiver, identity, target });
}

/** Concrete adapter shared by native test composition sites. */
export const nativeToolchain: NativeToolchain = select();
