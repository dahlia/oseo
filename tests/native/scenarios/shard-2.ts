import assert from "node:assert/strict";

import { runNativeCli } from "../../../packages/cli/src/index.ts";
import type { NativeScenarioContext } from "../scenario.ts";

export async function runNativeScenario2(
  context: NativeScenarioContext,
): Promise<void> {
  const { host, root } = context;

  // The switch-tdz fixture explains why this check bypasses the Deno
  // reference: Deno's TypeScript transpile loses the case-level TDZ.
  const switchTdzEntry = `${root}/tests/fixtures/switch-tdz.js`;
  const nativeSwitchTdz = await runNativeCli(
    {
      args: [switchTdzEntry],
      version: "0.1.0",
    },
    host,
  );
  assert.equal(nativeSwitchTdz.exitStatus, 0, nativeSwitchTdz.stderr);
  assert.equal(nativeSwitchTdz.stdout, "case tdz\nset none\n");

  // The object-spread-accessor-order fixture explains why this check bypasses
  // both references: V8 enumerates an accessor defined after an object
  // literal spread property last instead of in property-creation order.
  const spreadAccessorEntry = [
    root,
    "tests/fixtures/object-spread-accessor-order.js",
  ].join("/");
  const nativeSpreadAccessor = await runNativeCli(
    {
      args: [spreadAccessorEntry],
      version: "0.1.0",
    },
    host,
  );
  assert.equal(nativeSpreadAccessor.exitStatus, 0, nativeSpreadAccessor.stderr);
  assert.equal(
    nativeSpreadAccessor.stdout,
    "base,shown,tail,\n" +
      "1 2 3\n" +
      "first,later,last,\n" +
      "9 undefined\n" +
      "shown,tail,\n" +
      "shown,copied,tail,\n",
  );

  const moduleEntry = `${root}/tests/fixtures/modules/entry.js`;
  const nativeModule = await runNativeCli(
    {
      args: [moduleEntry],
      version: "0.1.0",
    },
    host,
  );
  assert.equal(nativeModule.exitStatus, 0, nativeModule.stderr);
  assert.equal(nativeModule.stderr, "");
  assert.equal(
    nativeModule.stdout,
    "var order 1 2 undefined\n" +
      "cycle b ready default ready\ncycle c ready\ncycle a\n" +
      "default first\ndefault second\nidentity once\n" +
      "answer increment 41\n" +
      "42\ntrue true false\n" +
      "immutable\nnonextensible\ntrue\ndefault\ndefault\n",
  );

  const importWriteEntry = [
    root,
    "tests/fixtures/modules/import-write-entry.js",
  ].join("/");
  const nativeImportWrite = await runNativeCli(
    {
      args: [importWriteEntry],
      version: "0.1.0",
    },
    host,
  );
  assert.equal(nativeImportWrite.exitStatus, 0, nativeImportWrite.stderr);
  assert.equal(nativeImportWrite.stderr, "");
  assert.equal(nativeImportWrite.stdout, "TypeError\nTypeError\nTypeError\n");

  const asyncModuleEntry = `${root}/tests/fixtures/async-modules/entry.js`;
  const nativeAsyncModule = await runNativeCli(
    {
      args: [asyncModuleEntry],
      version: "0.1.0",
    },
    host,
  );
  assert.equal(nativeAsyncModule.exitStatus, 0, nativeAsyncModule.stderr);
  assert.equal(nativeAsyncModule.stderr, "");
  assert.equal(
    nativeAsyncModule.stdout,
    "dependency ready\nentry ready\nlate timer\n",
  );

  const awaitedAssignmentModule = [
    root,
    "tests/fixtures/async-modules/destructuring-assignment.js",
  ].join("/");
  const nativeAwaitedAssignmentModule = await runNativeCli(
    {
      args: [awaitedAssignmentModule],
      version: "0.1.0",
    },
    host,
  );
  assert.equal(
    nativeAwaitedAssignmentModule.exitStatus,
    0,
    nativeAwaitedAssignmentModule.stderr,
  );
  assert.equal(nativeAwaitedAssignmentModule.stderr, "");
  assert.equal(nativeAwaitedAssignmentModule.stdout, "assignment module 1\n");

  const awaitedVarModule = [
    root,
    "tests/fixtures/async-modules/var-array-binding.js",
  ].join("/");
  const nativeAwaitedVarModule = await runNativeCli(
    {
      args: [awaitedVarModule],
      version: "0.1.0",
    },
    host,
  );
  assert.equal(
    nativeAwaitedVarModule.exitStatus,
    0,
    nativeAwaitedVarModule.stderr,
  );
  assert.equal(nativeAwaitedVarModule.stderr, "");
  assert.equal(
    nativeAwaitedVarModule.stdout,
    "var module before undefined undefined undefined\n" +
      "var module after 1 2 3 4\n",
  );

  const awaitedObjectVarModule = [
    root,
    "tests/fixtures/async-modules/var-object-binding.js",
  ].join("/");
  const nativeAwaitedObjectVarModule = await runNativeCli(
    {
      args: [awaitedObjectVarModule],
      version: "0.1.0",
    },
    host,
  );
  assert.equal(
    nativeAwaitedObjectVarModule.exitStatus,
    0,
    nativeAwaitedObjectVarModule.stderr,
  );
  assert.equal(nativeAwaitedObjectVarModule.stderr, "");
  assert.equal(
    nativeAwaitedObjectVarModule.stdout,
    "object var before undefined undefined\nobject var after 1 2\n",
  );

  const rejectionAfterAwait = [
    root,
    "tests/fixtures/async-modules/rejection-after-await.js",
  ].join("/");
  const nativeRejectionAfterAwait = await runNativeCli(
    {
      args: [rejectionAfterAwait],
      version: "0.1.0",
    },
    host,
  );
  assert.equal(
    nativeRejectionAfterAwait.exitStatus,
    0,
    nativeRejectionAfterAwait.stderr,
  );
  assert.equal(nativeRejectionAfterAwait.stderr, "");
  assert.equal(nativeRejectionAfterAwait.stdout, "handled after await\n");

  const awaitQueueOrder = [
    root,
    "tests/fixtures/async-modules/await-queue-order.js",
  ].join("/");
  const nativeAwaitQueueOrder = await runNativeCli(
    {
      args: [awaitQueueOrder],
      version: "0.1.0",
    },
    host,
  );
  assert.equal(
    nativeAwaitQueueOrder.exitStatus,
    0,
    nativeAwaitQueueOrder.stderr,
  );
  assert.equal(nativeAwaitQueueOrder.stderr, "");
  assert.equal(nativeAwaitQueueOrder.stdout, "after\nnested\n");

  const independentModuleEntry = [
    root,
    "tests/fixtures/async-modules/independent-entry.mjs",
  ].join("/");
  const nativeIndependentModule = await runNativeCli(
    {
      args: [independentModuleEntry],
      version: "0.1.0",
    },
    host,
  );
  assert.equal(nativeIndependentModule.exitStatus, 0);
  assert.equal(nativeIndependentModule.stderr, "");
  assert.equal(
    nativeIndependentModule.stdout,
    "a start\noperand\nb\na done 2\n",
  );

  const unhandledBeforeTimer = [
    root,
    "tests/fixtures/async-modules/unhandled-before-timer.js",
  ].join("/");
  const nativeUnhandledBeforeTimer = await runNativeCli(
    {
      args: [unhandledBeforeTimer],
      version: "0.1.0",
    },
    host,
  );
  assert.equal(nativeUnhandledBeforeTimer.exitStatus, 1);
  assert.equal(nativeUnhandledBeforeTimer.stdout, "");
  assert.match(
    nativeUnhandledBeforeTimer.stderr,
    /error\[OSEO2001\].*Unhandled promise rejection/u,
  );

  const blockedModule = `${root}/tests/fixtures/async-modules/blocked.js`;
  const nativeBlockedModule = await runNativeCli(
    {
      args: [blockedModule],
      version: "0.1.0",
    },
    host,
  );
  assert.equal(nativeBlockedModule.exitStatus, 1);
  assert.equal(nativeBlockedModule.stdout, "");
  assert.match(
    nativeBlockedModule.stderr,
    /error\[OSEO3001\].*Top-level await cannot make progress/u,
  );

  const diagnosticModule = [
    root,
    "tests/fixtures/module-diagnostics/entry.mjs",
  ].join("/");
  const nativeDiagnosticModule = await runNativeCli(
    {
      args: [diagnosticModule],
      version: "0.1.0",
    },
    host,
  );
  assert.equal(nativeDiagnosticModule.exitStatus, 1);
  assert.equal(
    nativeDiagnosticModule.stdout,
    "dependency before throw\ndependency cleanup\n",
  );
  assert.match(
    nativeDiagnosticModule.stderr,
    /module-diagnostics\/dep\.mjs:5:3: error\[OSEO2001\]/u,
  );

  const rejectionLocation = [
    root,
    "tests/fixtures/rejection-location/entry.mjs",
  ].join("/");
  const nativeRejectionLocation = await runNativeCli(
    {
      args: [rejectionLocation],
      version: "0.1.0",
    },
    host,
  );
  assert.equal(nativeRejectionLocation.exitStatus, 1);
  assert.equal(nativeRejectionLocation.stdout, "entry after rejection\n");
  assert.match(
    nativeRejectionLocation.stderr,
    /rejection-location\/dep\.mjs:2:3: error\[OSEO2001\]/u,
  );

  const topLevelAwaitRejection = await runNativeCli(
    {
      args: ["top-level-await-rejection.mjs"],
      source: `console.log("before rejection");
await Promise.reject("bad");
`,
      sourceId: "top-level-await-rejection.mjs",
      version: "0.1.0",
    },
    host,
  );
  assert.equal(topLevelAwaitRejection.exitStatus, 1);
  assert.equal(topLevelAwaitRejection.stdout, "before rejection\n");
  assert.match(
    topLevelAwaitRejection.stderr,
    /top-level-await-rejection\.mjs:2:\d+: error\[OSEO2001\]/u,
  );
}
