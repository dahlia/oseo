import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  checkNativeHostGuardSource,
  checkNativeHostGuards,
  formatNativeHostGuardProblems,
} from "../tools/check-native-host-guards.ts";

const imports = `
import test from "node:test";
import { withNativeFixture } from "../../packages/testkit/src/index.ts";
`;

test("accepts a guarded native property test", () => {
  const source = `${imports}
const nativeTarget = targetForExecutionHost(executionHost);
test(
  "guarded native property",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await withNativeFixture({});
  },
);
`;
  assert.deepEqual(
    checkNativeHostGuardSource(
      "tests/property/guarded.property.test.ts",
      source,
    ),
    [],
  );
});

test("reports an unguarded native property test by file and name", () => {
  const source = `${imports}
async function runNativeCase() {
  await withNativeFixture({});
}
test("unguarded native property", async () => {
  await runNativeCase();
});
`;
  const problems = checkNativeHostGuardSource(
    "tests/property/unguarded.property.test.ts",
    source,
  );
  assert.equal(problems.length, 1);
  assert.equal(problems[0]?.testName, "unguarded native property");
  const report = formatNativeHostGuardProblems(problems);
  assert.match(report, /unguarded\.property\.test\.ts:8/u);
  assert.match(report, /test "unguarded native property"/u);
  assert.match(report, /Add this test option/u);
  assert.match(report, /requires a supported native host/u);
});

test("rejects a strict null guard that never fires", () => {
  // targetForExecutionHost returns undefined, so this skip stays false on an
  // unsupported host and native execution still runs there.
  const source = `${imports}
const nativeTarget = targetForExecutionHost(executionHost);
test(
  "strictly compared native property",
  { skip: nativeTarget === null ? "requires a supported native host" : false },
  async () => {
    await withNativeFixture({});
  },
);
`;
  assert.equal(
    checkNativeHostGuardSource("tests/property/strict.property.test.ts", source)
      .length,
    1,
  );
});

test("accepts a strict undefined guard", () => {
  const source = `${imports}
const nativeTarget = targetForExecutionHost(executionHost);
test(
  "strictly undefined native property",
  {
    skip:
      nativeTarget === undefined ? "requires a supported native host" : false,
  },
  async () => {
    await withNativeFixture({});
  },
);
`;
  assert.deepEqual(
    checkNativeHostGuardSource(
      "tests/property/undefined.property.test.ts",
      source,
    ),
    [],
  );
});

test("rejects a guard on an identifier that is not the native target", () => {
  // Same shape, but the compared name never holds the selected target, so the
  // skip stays false and the callback reaches native execution anyway.
  const source = `${imports}
const nativeTarget = targetForExecutionHost(executionHost);
const otherTarget = "always defined";
test(
  "misdirected native property",
  { skip: otherTarget == null ? "requires a supported native host" : false },
  async () => {
    await withNativeFixture({});
  },
);
`;
  assert.equal(
    checkNativeHostGuardSource(
      "tests/property/misdirected.property.test.ts",
      source,
    ).length,
    1,
  );
});

const nativeImports = `
import test from "node:test";
import { runNativeCli as run } from "./native-cli.ts";
import { nativeToolchain as compiler } from "./native-toolchain.ts";
import { runNativeUnits } from "../packages/cli/src/index.ts";
import { prepareHarnessObject } from "../packages/compiler/src/index.ts";
import { createTest262FragmentExecutor } from "../tools/test262-fragments.ts";
import { buildHostCcFixture } from "./host-cc-runtime.ts";
import { spawnSync } from "node:child_process";
import { runNativeFixture } from "../tools/native-fixture.ts";
function runCommand(command, args) { return spawnSync(command, args); }
`;

for (const [name, body] of [
  [
    "supervised fixture",
    `const plan = compiler.createBuildPlan(input);
    runNativeFixture(plan.executablePath, []);`,
  ],
  ["aliased CLI", "await run({ args: ['case.js'] });"],
  ["option-like filename", "await run({ args: ['--', '--emit-c'] });"],
  ["dynamic option prefix", "await run({ args: [...prefix, '--emit-c'] });"],
  ["imported Promise callback", "await Promise.resolve(request).then(run);"],
  ["imported array callback", "await Promise.all(requests.map(run));"],
  ["native units", "await runNativeUnits(units, 'case.js', host, compiler);"],
  ["harness object", "await prepareHarnessObject(host, compiler, input);"],
  [
    "build plan",
    `const plan = compiler.createBuildPlan(input);
    await host.run({ command: plan.executablePath });`,
  ],
  [
    "fragment execution",
    `const executor = createTest262FragmentExecutor(host, compiler);
    await executor.execute(request, fallback);`,
  ],
  [
    "build request loop",
    `const plan = compiler.createBuildPlan(input);
    for (const request of plan.requests) {
      spawnSync(request.command, request.args);
    }`,
  ],
  [
    "build request forEach",
    `const plan = compiler.createBuildPlan(input);
    plan.requests.forEach(request => host.run(request));`,
  ],
  [
    "build request map",
    `const plan = compiler.createBuildPlan(input);
    await Promise.all(plan.requests.map(request => host.run(request)));`,
  ],
  ["C fixture", "buildHostCcFixture(fixture, runtime, sources, executable);"],
  ["Zig wrapper", "runCommand('zig', ['cc', '-o', executable]);"],
  [
    "local callback",
    "const callback = () => run({}); await property(callback);",
  ],
  [
    "recursive helper",
    "function helper() { helper(); return run({}); } await helper();",
  ],
]) {
  test(`requires a guard for ${name}`, () => {
    const source = `${nativeImports}\ntest("native", async () => { ${body} });`;
    assert.deepEqual(
      checkNativeHostGuardSource("tests/nested/native.test.ts", source).map(
        (p) => p.testName,
      ),
      ["native"],
    );
    assert.deepEqual(
      checkNativeHostGuardSource(
        "tests/nested/native.test.ts",
        `${nativeImports}
const target = targetForExecutionHost(host);
test("native",
{ skip: target == null ? "requires a supported native host" : false },
async () => { ${body} });`,
      ),
      [],
    );
  });
}

for (const [name, body] of [
  ["supervised Node program", "runNativeFixture(process.execPath, []);"],
  ["unused helper", "assert.equal(typeof run, 'function');"],
  ["Zig argument assertion", "assert.deepEqual('zig', ['cc']);"],
  ["uncalled local helper", "const unused = () => run({});"],
  ["type reference", "type Runner = typeof run;"],
  [
    "plan path inspection",
    `const plan = compiler.createBuildPlan(input);
    assert.equal(plan.executablePath, '/work/program');`,
  ],
  ["C emission", "await run({ args: ['--emit-c', 'case.js'] });"],
  ["quoted emission option", "await run({ 'args': ['--emit-c', 'case.js'] });"],
  ["helper identity assertion", "assert.equal(run, expectedRunner);"],
  [
    "plan inspection",
    `const plan = compiler.createBuildPlan(input);
    assert.equal(plan.requests.length, 1);`,
  ],
  [
    "request loop inspection",
    `const plan = compiler.createBuildPlan(input);
    for (const request of plan.requests) {
      assert.equal(request.command, 'cc');
    }`,
  ],
  [
    "request callback inspection",
    `const plan = compiler.createBuildPlan(input);
    plan.requests.forEach(request => assert.equal(request.command, 'cc'));`,
  ],
  [
    "rejected target",
    `assert.throws(() =>
      compiler.createBuildPlan({ target: rejectedTarget }));`,
  ],
  [
    "fake harness toolchain",
    "await prepareHarnessObject(host, fakeToolchain, input);",
  ],
  [
    "unused executor",
    "const executor = createTest262FragmentExecutor(host, compiler);",
  ],
  [
    "fake executor",
    `const executor = createTest262FragmentExecutor(host, fakeToolchain);
    await executor.execute(request, fallback);`,
  ],
]) {
  test(`does not require a guard for ${name}`, () => {
    assert.deepEqual(
      checkNativeHostGuardSource(
        "tests/unit.test.ts",
        `${nativeImports}
test("unit", async () => { ${body} });`,
      ),
      [],
    );
  });
}

test("ignores both forms of type-only helper imports", () => {
  assert.deepEqual(
    checkNativeHostGuardSource(
      "tests/types.test.ts",
      `
import test from "node:test";
import type { runNativeCli } from "./native-cli.ts";
import { type withNativeFixture } from "./fixture.ts";
test("types", () => { type A = typeof runNativeCli;
type B = typeof withNativeFixture;
});
`,
    ),
    [],
  );
});

test("keeps named callbacks local to their tests", () => {
  const source = `${nativeImports}
async function nativeCase() { await run({}); }
test("native", nativeCase);
test("another native", async () => { const whole = () => run({});
await whole();
});
test("pure", async () => { const whole = async () => ({}); await whole(); });`;
  assert.deepEqual(
    checkNativeHostGuardSource("tests/callbacks.test.ts", source).map(
      (p) => p.testName,
    ),
    ["native", "another native"],
  );
});

test("accepts platform selection and additional skip conditions", () => {
  const source = `${nativeImports}
const target = process.platform === "linux" && process.arch === "x64"
  ? "x86_64-linux-gnu"
  : process.platform === "darwin" && process.arch === "arm64"
  ? "aarch64-macos" : undefined;
test("native",
{ skip: !enabled || target == null
  ? "requires a supported native host" : false },
() => buildHostCcFixture());`;
  assert.deepEqual(
    checkNativeHostGuardSource("tests/runtime.test.ts", source),
    [],
  );
  assert.equal(
    checkNativeHostGuardSource(
      "tests/runtime.test.ts",
      source.replace('process.arch === "arm64"', 'process.arch === "x64"'),
    ).length,
    1,
  );
});

test("recurses over test sources in deterministic order", async () => {
  const root = await mkdtemp(join(tmpdir(), "oseo-host-guards-"));
  try {
    await mkdir(join(root, "tests", "nested"), { recursive: true });
    const source = `${nativeImports} test("native", () => run({}));`;
    await writeFile(join(root, "tests", "root.test.ts"), source);
    await writeFile(join(root, "tests", "nested", "registration.ts"), source);
    await writeFile(join(root, "tests", "ignored.txt"), source);
    assert.deepEqual(
      (await checkNativeHostGuards(root)).map((p) => p.path),
      [
        join("tests", "nested", "registration.ts"),
        join("tests", "root.test.ts"),
      ],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const file of [
  "harness-native.test.ts",
  "harness-resource.test.ts",
  "test262-fragments.test.ts",
  "host-cc-sanitizer.test.ts",
  "runtime-weak-collection.test.ts",
  "native-io/clock-wakeup.test.ts",
  "property/nio-clock-wakeup.property.test.ts",
]) {
  test(`detects removed guards in ${file}`, async () => {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.deepEqual(checkNativeHostGuardSource(file, source), []);
    const unguarded = source.replaceAll(
      '"requires a supported native host"',
      '"wrong skip"',
    );
    assert.ok(checkNativeHostGuardSource(file, unguarded).length > 0);
  });
}

test("resolves test callbacks in their enclosing registration function", () => {
  const source = `${nativeImports}
function register() {
  const runCase = () => run(request);
  test("named", runCase);
  test("inline", () => runCase());
}
register();
function registerPure() {
  const runCase = () => 42;
  test("pure", runCase);
}
registerPure();`;
  assert.deepEqual(
    checkNativeHostGuardSource("tests/register.test.ts", source).map(
      (problem) => problem.testName,
    ),
    ["named", "inline"],
  );
});

test("resolves shared skip constants in the registration scope", () => {
  const source = `${nativeImports}
const target = targetForExecutionHost(host);
const skip = target == null ? "requires a supported native host" : false;
function register() {
  const skip = false;
  test("shadowed", { skip }, () => run(request));
}
function guarded() { test("guarded", { skip }, () => run(request)); }
function parameter(skip) {
  test("parameter", { skip }, () => run(request));
}
function local() {
  const localSkip = target == null
    ? "requires a supported native host" : false;
  test("local", { skip: localSkip }, () => run(request));
}
register(); guarded(); parameter(false); local();`;
  assert.deepEqual(
    checkNativeHostGuardSource("tests/skip.test.ts", source).map(
      (problem) => problem.testName,
    ),
    ["shadowed", "parameter"],
  );
});

test("invalidates shared skips shadowed by binding patterns", () => {
  for (const declaration of [
    "for (const skip of [false]) { BODY }",
    "for (const [skip] of [[false]]) { BODY }",
    "for (let skip = false; !skip; skip = true) { BODY }",
    "try { throw false; } catch (skip) { BODY }",
    "try { throw { skip: false }; } catch ({ skip }) { BODY }",
    "function register({ skip }) { BODY } register({ skip: false });",
    "function register([skip]) { BODY } register([false]);",
    "function register({ skip = false } = {}) { BODY } register();",
    "function register(...skip) { BODY } register(false);",
    "function register() { const { skip } = { skip: false }; BODY }",
    "function register() { const [skip] = [false]; BODY }",
    "function register() { const { x: { skip } } = value; BODY }",
    "function register() { const { ...skip } = value; BODY }",
  ]) {
    const body = 'test("native", { skip }, () => run(request));';
    const source = `${nativeImports}
const target = targetForExecutionHost(host);
const skip = target == null ? "requires a supported native host" : false;
${declaration.replace("BODY", body)}`;
    assert.equal(
      checkNativeHostGuardSource("tests/pattern.test.ts", source).length,
      1,
      declaration,
    );
  }
});

test("loop and catch bindings do not invalidate an outer shared guard", () => {
  const source = `${nativeImports}
const target = targetForExecutionHost(host);
const skip = target == null ? "requires a supported native host" : false;
for (const skip of [false]) { assert.equal(skip, false); }
try { throw false; } catch (skip) { assert.equal(skip, false); }
test("outer", { skip }, () => run(request));
function register() {
  for (const skip of [false]) { assert.equal(skip, false); }
  test("enclosing", { skip }, () => run(request));
}
register();`;
  assert.deepEqual(
    checkNativeHostGuardSource("tests/outer.test.ts", source),
    [],
  );
});
