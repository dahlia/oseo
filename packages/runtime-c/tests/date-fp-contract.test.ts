import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const supported =
  (process.platform === "linux" && process.arch === "x64") ||
  (process.platform === "darwin" && process.arch === "arm64");
const runtime = fileURLToPath(new URL("../native/", import.meta.url));

for (const compiler of ["clang", "gcc"]) {
  test(
    `${compiler} preserves Date rounding with strict sanitizer compilation`,
    { skip: !supported },
    async (context) => {
      const available = spawnSync(compiler, ["--version"], {
        encoding: "utf8",
        timeout: 30_000,
      });
      if (
        available.error != null &&
        "code" in available.error &&
        available.error.code === "ENOENT"
      ) {
        context.skip(`${compiler} is not installed`);
        return;
      }
      assert.equal(available.status, 0, available.stderr);
      const directory = await mkdtemp(join(tmpdir(), "oseo-date-contract-"));
      try {
        const assembly = join(directory, "date.s");
        const result = spawnSync(
          compiler,
          [
            "-std=c11",
            "-Wall",
            "-Wextra",
            "-Werror",
            "-pedantic",
            "-O2",
            "-fsanitize=address,undefined",
            "-fno-sanitize-recover=all",
            ...(process.arch === "x64" ? ["-mfma"] : []),
            "-I",
            runtime,
            "-S",
            join(runtime, "runtime_date.c"),
            "-o",
            assembly,
          ],
          { encoding: "utf8", timeout: 120_000 },
        );
        assert.ifError(result.error);
        assert.equal(result.status, 0, result.stderr);
        const text = await readFile(assembly, "utf8");
        assert.match(text, /__asan_/u);
        assert.doesNotMatch(
          text,
          /\b(?:f(?:n?madd|n?msub|mla|mls)|vf(?:n?madd|n?msub))[a-z0-9.]*\s/u,
        );
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}
