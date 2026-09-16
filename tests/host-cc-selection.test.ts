import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const supported =
  (process.platform === "linux" && process.arch === "x64") ||
  (process.platform === "darwin" && process.arch === "arm64");
const selector = fileURLToPath(
  new URL("./native-toolchain.ts", import.meta.url),
);

for (const scenario of [
  {
    name: "prefers clang without fallback after a failed probe",
    installed: ["clang", "gcc"],
    override: "",
    selected: "clang",
  },
  {
    name: "selects gcc when clang is absent",
    installed: ["gcc"],
    override: "",
    selected: "gcc",
  },
  {
    name: "honors the explicit gcc override",
    installed: ["clang", "gcc"],
    override: "gcc",
    selected: "gcc",
  },
]) {
  test(scenario.name, { skip: !supported }, async () => {
    const directory = await mkdtemp(join(tmpdir(), "oseo-cc-selection-"));
    try {
      await Promise.all(
        [...scenario.installed, "ar"].map(async (name) => {
          await writeFile(
            join(directory, name),
            `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "fixture-${name} version 1"
  exit 0
fi
echo "missing fixture-${name} ASan runtime" >&2
exit 1
`,
            { mode: 0o755 },
          );
        }),
      );
      const env = {
        PATH: directory,
        HOME: directory,
        OSEO_NATIVE_TOOLCHAIN: "host-cc",
        OSEO_HOST_CC: scenario.override === "" ? undefined : scenario.override,
      };
      const result = spawnSync(process.execPath, [selector], {
        encoding: "utf8",
        env,
        timeout: 30_000,
      });
      assert.ifError(result.error);
      assert.notEqual(result.status, 0);
      assert(result.stderr.includes(`fixture-${scenario.selected} version 1`));
      assert(
        result.stderr.includes(
          `missing fixture-${scenario.selected} ASan runtime`,
        ),
      );
      assert.match(result.stderr, /Sanitizer compile\/link probe failed/u);
      const other = scenario.selected === "clang" ? "gcc" : "clang";
      assert(!result.stderr.includes(`fixture-${other} version 1`));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
