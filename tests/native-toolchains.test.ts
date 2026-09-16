import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkNativeToolchainSource,
  checkNativeToolchains,
} from "../tools/check-native-toolchains.ts";

for (const path of [
  "tests/property/new.property.test.ts",
  "tests/native.ts",
  "tests/native/scenarios/new.ts",
  "tests/runtime-new.test.ts",
  "tests/host-cc-runtime.ts",
  "tests/native-cli.ts",
  "tools/test262.ts",
  "tools/native-io/clock.ts",
]) {
  test(`rejects direct adapter selection in ${path}`, () => {
    const problems = checkNativeToolchainSource(
      path,
      'import { zigToolchain as compiler } from "@oseo/toolchain-zig";',
    );
    assert.equal(problems.length, 1);
    assert.match(problems[0]!, new RegExp(`^${path.replaceAll(".", "\\.")}:`));
    assert.match(
      problems[0]!,
      /Use import \{ nativeToolchain \} from ".*native-toolchain\.ts";/u,
    );
  });
}

test("accepts the selector and gives the exact replacement import", () => {
  const path = "tests/property/new.property.test.ts";
  assert.deepEqual(
    checkNativeToolchainSource(
      path,
      'import { nativeToolchain } from "../native-toolchain.ts";',
    ),
    [],
  );
  assert.deepEqual(
    checkNativeToolchainSource(
      path,
      'import * as zig from "../../packages/toolchain-zig/src/index.ts";',
    ),
    [
      `${path}: ../../packages/toolchain-zig/src/index.ts bypasses ` +
        `native sanitizer selection. Use import { nativeToolchain } ` +
        `from "../native-toolchain.ts";`,
    ],
  );
});

test("rejects dynamic imports, re-exports, and require of adapters", () => {
  for (const source of [
    'const cc = await import("@oseo/toolchain-host-cc");',
    "const cc = await import(`@oseo/toolchain-zig`);",
    'export { zigToolchain } from "@oseo/toolchain-zig";',
    'const cc = require("@oseo/toolchain-zig");',
  ])
    assert.equal(
      checkNativeToolchainSource("tests/native/new.ts", source).length,
      1,
    );
});

test("requires the selected CLI wrapper but allows other CLI exports", () => {
  assert.deepEqual(
    checkNativeToolchainSource(
      "tests/native/new.ts",
      'import { defaultComponents } from "../../packages/cli/src/index.ts";',
    ),
    [],
  );
  const problems = checkNativeToolchainSource(
    "tests/native/new.ts",
    'import { runNativeCli as run } from "../../packages/cli/src/index.ts";',
  );
  assert.equal(problems.length, 1);
  assert.match(
    problems[0]!,
    /Use import \{ runNativeCli \} from "\.\.\/native-cli\.ts";/u,
  );
});

test("exempts composition and adapter tests with their helpers", () => {
  const source = 'import { zigToolchain } from "@oseo/toolchain-zig";';
  for (const path of [
    "tests/native-toolchain.ts",
    "packages/toolchain-zig/tests/index.test.ts",
    "packages/toolchain-host-cc/tests/index.test.ts",
  ]) {
    assert.deepEqual(checkNativeToolchainSource(path, source), []);
  }
  assert.equal(
    checkNativeToolchainSource("tests/native/adapter.test.ts", source).length,
    1,
  );
  assert.equal(
    checkNativeToolchainSource("packages/toolchain-zig/tests/helper.ts", source)
      .length,
    0,
  );
});

test("repository entry points use sanitizer selection", async () => {
  assert.deepEqual(await checkNativeToolchains(process.cwd()), []);
});

test("rejects namespace CLI re-exports from integration helpers", () => {
  const problems = checkNativeToolchainSource(
    "tests/native/helper.ts",
    'export * as cli from "@oseo/cli";',
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0]!, /native-cli\.ts/u);
});

test("rejects quoted CLI names in imports and re-exports", () => {
  for (const source of [
    'export { "runNativeCli" as run } from "@oseo/cli";',
    'import { "runNativeCli" as run } from "@oseo/cli";',
  ]) {
    const problems = checkNativeToolchainSource(
      "tests/native/helper.ts",
      source,
    );
    assert.equal(problems.length, 1);
    assert.match(problems[0]!, /native-cli\.ts/u);
  }
});

test("rejects direct defaultComponents toolchain selection", () => {
  for (const use of [
    "const cc = components.toolchain;",
    "const cc = components['toolchain'];",
    "const options = { ...components };",
    "const { toolchain: cc } = components;",
    "const alias = components;",
    "build(components);",
    "const options = { components };",
  ]) {
    const problems = checkNativeToolchainSource(
      "tests/native/helper.ts",
      'import { defaultComponents as components } from "@oseo/cli";\n' + use,
    );
    assert.equal(problems.length, 1);
    assert.match(problems[0]!, /native-toolchain\.ts/u);
  }
});

test("allows type-only adapter imports because they select no compiler", () => {
  for (const source of [
    'import type { HostCcOptions } from "@oseo/toolchain-host-cc";',
    'import { type HostCcOptions } from "@oseo/toolchain-host-cc";',
    'export type { HostCcOptions } from "@oseo/toolchain-host-cc";',
  ])
    assert.deepEqual(
      checkNativeToolchainSource("tests/native/helper.ts", source),
      [],
    );
});

test("allows reading non-toolchain fields and querying component types", () => {
  const source =
    'import { defaultComponents } from "@oseo/cli";\n' +
    "const frontend = defaultComponents.frontend;\n" +
    "type Components = typeof defaultComponents;";
  assert.deepEqual(
    checkNativeToolchainSource("tests/native/helper.ts", source),
    [],
  );
});
