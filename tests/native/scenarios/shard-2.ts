/* eslint-disable no-await-in-loop */
import assert from "node:assert/strict";
import process from "node:process";

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

  // The switch-function-forward-reference fixture explains why this
  // check bypasses the Deno reference the same way switch-tdz.js does:
  // Deno's TypeScript transpile loses the CaseBlock-wide function
  // instantiation for a forward reference from an earlier clause.
  const switchFunctionForwardEntry = [
    root,
    "tests/fixtures/switch-function-forward-reference.js",
  ].join("/");
  const nativeSwitchFunctionForward = await runNativeCli(
    {
      args: [switchFunctionForwardEntry],
      version: "0.1.0",
    },
    host,
  );
  assert.equal(
    nativeSwitchFunctionForward.exitStatus,
    0,
    nativeSwitchFunctionForward.stderr,
  );
  assert.equal(
    nativeSwitchFunctionForward.stdout,
    "function,declared-in-case-2,declared-in-case-2\n" +
      "declared-in-case-2,declared-in-case-2\n" +
      "default\n",
  );

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

  // A Module Environment Record binds `this` to undefined, so the entry
  // module, an arrow written in it, a continuation resumed after
  // top-level await, and an imported module all observe undefined while
  // ordinary member and class receivers stay unchanged. Node.js and Deno
  // evaluate the same file as a real module, so both are references.
  const moduleThisEntry = `${root}/tests/fixtures/module-this/entry.mjs`;
  const moduleThisReferences = [
    await host.run({
      args: [moduleThisEntry],
      command: process.execPath,
      cwd: root,
    }),
    await host.run({
      args: ["run", "--quiet", moduleThisEntry],
      command: "deno",
      cwd: root,
    }),
  ];
  for (const reference of moduleThisReferences) {
    assert.equal(reference.exitStatus, 0, reference.stderr);
  }
  for (const specialization of ["disabled", "enabled"] as const) {
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    try {
      const nativeModuleThis = await runNativeCli(
        {
          args: [
            ...(specialization === "disabled" ? ["--no-specialization"] : []),
            moduleThisEntry,
          ],
          version: "0.1.0",
        },
        host,
      );
      assert.equal(nativeModuleThis.exitStatus, 0, nativeModuleThis.stderr);
      assert.equal(nativeModuleThis.stderr, "");
      for (const reference of moduleThisReferences) {
        assert.equal(
          nativeModuleThis.stdout,
          reference.stdout,
          `module this ${specialization}`,
        );
      }
    } finally {
      delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    }
  }

  // Module var declarations are hoisted outside the catch environment,
  // while the same-name initializer still resolves to the catch cell.
  const catchVarModule = `${root}/tests/fixtures/catch-var-module.mjs`;
  const catchVarReferences = [
    await host.run({
      args: [catchVarModule],
      command: process.execPath,
      cwd: root,
    }),
    await host.run({
      args: ["run", "--quiet", catchVarModule],
      command: "deno",
      cwd: root,
    }),
  ];
  for (const reference of catchVarReferences) {
    assert.equal(reference.exitStatus, 0, reference.stderr);
  }
  for (const specialization of ["disabled", "enabled"] as const) {
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    try {
      const nativeCatchVar = await runNativeCli(
        {
          args: [
            ...(specialization === "disabled" ? ["--no-specialization"] : []),
            catchVarModule,
          ],
          version: "0.1.0",
        },
        host,
      );
      assert.equal(nativeCatchVar.exitStatus, 0, nativeCatchVar.stderr);
      assert.equal(nativeCatchVar.stderr, "");
      for (const reference of catchVarReferences) {
        assert.equal(
          nativeCatchVar.stdout,
          reference.stdout,
          `module catch var ${specialization}`,
        );
      }
    } finally {
      delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    }
  }

  // A block-scoped function declaration and an outer var of the same name
  // stay distinct cells in module code, which is always strict, so no
  // Annex B extension could apply even on a host that implements it.
  const blockFunctionVarModule = [
    root,
    "tests/fixtures/block-function-var-module.mjs",
  ].join("/");
  const blockFunctionVarReferences = [
    await host.run({
      args: [blockFunctionVarModule],
      command: process.execPath,
      cwd: root,
    }),
    await host.run({
      args: ["run", "--quiet", blockFunctionVarModule],
      command: "deno",
      cwd: root,
    }),
  ];
  for (const reference of blockFunctionVarReferences) {
    assert.equal(reference.exitStatus, 0, reference.stderr);
  }
  for (const specialization of ["disabled", "enabled"] as const) {
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    try {
      const nativeBlockFunctionVar = await runNativeCli(
        {
          args: [
            ...(specialization === "disabled" ? ["--no-specialization"] : []),
            blockFunctionVarModule,
          ],
          version: "0.1.0",
        },
        host,
      );
      assert.equal(
        nativeBlockFunctionVar.exitStatus,
        0,
        nativeBlockFunctionVar.stderr,
      );
      assert.equal(nativeBlockFunctionVar.stderr, "");
      for (const reference of blockFunctionVarReferences) {
        assert.equal(
          nativeBlockFunctionVar.stdout,
          reference.stdout,
          `module block function var ${specialization}`,
        );
      }
    } finally {
      delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    }
  }

  const moduleEntry = `${root}/tests/fixtures/modules/entry.js`;
  for (const specialization of ["disabled", "enabled"] as const) {
    if (specialization === "enabled") {
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    }
    try {
      const nativeModule = await runNativeCli(
        {
          args: [
            ...(specialization === "disabled" ? ["--no-specialization"] : []),
            moduleEntry,
          ],
          version: "0.1.0",
        },
        host,
      );
      assert.equal(nativeModule.exitStatus, 0, nativeModule.stderr);
      assert.equal(nativeModule.stderr, "");
      assert.equal(
        nativeModule.stdout,
        "var order 1 2 undefined\n" +
          "named default local NamedDefault true\n" +
          "cycle b ready default ready\ncycle c ready\ncycle a\n" +
          "default first\ndefault second\nidentity once\n" +
          "answer increment 41\n" +
          "42\ntrue true false\n" +
          "immutable\nnonextensible\ntrue\ndefault\ndefault\n" +
          "named default import NamedDefault 43 true\n" +
          "anonymous default import default 44\n" +
          "anonymous name method name method\n",
      );
    } finally {
      delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    }
  }

  const definePropertyModuleEntry = [
    root,
    "tests/fixtures/object-define-property-module/entry.mjs",
  ].join("/");
  const definePropertyModuleReferences = [
    await host.run({
      args: [definePropertyModuleEntry],
      command: process.execPath,
      cwd: root,
    }),
    await host.run({
      args: ["run", "--quiet", definePropertyModuleEntry],
      command: "deno",
      cwd: root,
    }),
  ];
  for (const reference of definePropertyModuleReferences) {
    assert.equal(reference.exitStatus, 0, reference.stderr);
  }
  for (const specialization of ["disabled", "enabled"] as const) {
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    try {
      const nativeDefinePropertyModule = await runNativeCli(
        {
          args: [
            ...(specialization === "disabled" ? ["--no-specialization"] : []),
            definePropertyModuleEntry,
          ],
          version: "0.1.0",
        },
        host,
      );
      assert.equal(
        nativeDefinePropertyModule.exitStatus,
        0,
        nativeDefinePropertyModule.stderr,
      );
      assert.equal(nativeDefinePropertyModule.stderr, "");
      for (const reference of definePropertyModuleReferences) {
        assert.equal(nativeDefinePropertyModule.stdout, reference.stdout);
      }
    } finally {
      delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    }
  }

  const definePropertiesModuleEntry = [
    root,
    "tests/fixtures/object-define-properties-module/entry.mjs",
  ].join("/");
  const definePropertiesModuleReferences = [
    await host.run({
      args: [definePropertiesModuleEntry],
      command: process.execPath,
      cwd: root,
    }),
    await host.run({
      args: ["run", "--quiet", definePropertiesModuleEntry],
      command: "deno",
      cwd: root,
    }),
  ];
  for (const reference of definePropertiesModuleReferences) {
    assert.equal(reference.exitStatus, 0, reference.stderr);
  }
  for (const specialization of ["disabled", "enabled"] as const) {
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    try {
      const nativeDefinePropertiesModule = await runNativeCli(
        {
          args: [
            ...(specialization === "disabled" ? ["--no-specialization"] : []),
            definePropertiesModuleEntry,
          ],
          version: "0.1.0",
        },
        host,
      );
      assert.equal(
        nativeDefinePropertiesModule.exitStatus,
        0,
        nativeDefinePropertiesModule.stderr,
      );
      assert.equal(nativeDefinePropertiesModule.stderr, "");
      for (const reference of definePropertiesModuleReferences) {
        assert.equal(nativeDefinePropertiesModule.stdout, reference.stdout);
      }
    } finally {
      delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    }
  }

  const objectStaticMutationEntry = [
    root,
    "tests/fixtures/object-static-mutation/entry.mjs",
  ].join("/");
  const objectStaticMutationReferences = [
    await host.run({
      args: [objectStaticMutationEntry],
      command: process.execPath,
      cwd: root,
    }),
    await host.run({
      args: ["run", "--quiet", objectStaticMutationEntry],
      command: "deno",
      cwd: root,
    }),
  ];
  for (const reference of objectStaticMutationReferences) {
    assert.equal(reference.exitStatus, 0, reference.stderr);
  }
  for (const specialization of ["disabled", "enabled"] as const) {
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    try {
      const nativeObjectStaticMutation = await runNativeCli(
        {
          args: [
            ...(specialization === "disabled" ? ["--no-specialization"] : []),
            objectStaticMutationEntry,
          ],
          version: "0.1.0",
        },
        host,
      );
      assert.equal(
        nativeObjectStaticMutation.exitStatus,
        0,
        nativeObjectStaticMutation.stderr,
      );
      assert.equal(nativeObjectStaticMutation.stderr, "");
      for (const reference of objectStaticMutationReferences) {
        assert.equal(nativeObjectStaticMutation.stdout, reference.stdout);
      }
    } finally {
      delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    }
  }

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

  const continuationRoot = [root, "tests/fixtures/module-continuations"].join(
    "/",
  );
  for (const specialization of ["disabled", "enabled"] as const) {
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    const args = specialization === "disabled" ? ["--no-specialization"] : [];
    try {
      const cycle = await runNativeCli(
        {
          args: [...args, `${continuationRoot}/cycle-entry.mjs`],
          version: "0.1.0",
        },
        host,
      );
      assert.equal(cycle.exitStatus, 0, cycle.stderr);
      assert.equal(cycle.stderr, "");
      assert.equal(
        cycle.stdout,
        "cycle b start\n" +
          "guard miss fallback\n" +
          "sibling returned-to-caller\n" +
          "cycle b done x1\n" +
          "cycle a start\n" +
          "cycle a done b ready\n" +
          "observer b ready\n" +
          "entry a ready b ready\n",
      );

      const spread = await runNativeCli(
        {
          args: [...args, `${continuationRoot}/spread.mjs`],
          version: "0.1.0",
        },
        host,
      );
      assert.equal(spread.exitStatus, 0, spread.stderr);
      assert.equal(spread.stderr, "");
      assert.equal(spread.stdout, "spread iterator 1\nspread values 4 5 1\n");

      const close = await runNativeCli(
        {
          args: [...args, `${continuationRoot}/close.mjs`],
          version: "0.1.0",
        },
        host,
      );
      assert.equal(close.exitStatus, 0, close.stderr);
      assert.equal(close.stderr, "");
      assert.equal(
        close.stdout,
        "fulfilled body 3\n" +
          "fulfilled close called\n" +
          "fulfilled close settled\n" +
          "fulfilled completed\n" +
          "close-error body 3\n" +
          "close-error close called\n" +
          "close-error close settled\n" +
          "close-error caught TypeError\n" +
          "body-error body 3\n" +
          "body-error close called\n" +
          "body-error close settled\n" +
          "body-error caught RangeError\n",
      );

      const rejection = await runNativeCli(
        {
          args: [...args, `${continuationRoot}/rejection.mjs`],
          version: "0.1.0",
        },
        host,
      );
      assert.equal(rejection.exitStatus, 1);
      assert.equal(rejection.stdout, "rejection before\n");
      assert.match(
        rejection.stderr,
        /module-continuations\/rejection\.mjs:2:\d+: error\[OSEO2001\]/u,
      );

      const never = await runNativeCli(
        {
          args: [...args, `${continuationRoot}/never.mjs`],
          version: "0.1.0",
        },
        host,
      );
      assert.equal(never.exitStatus, 1);
      assert.equal(never.stdout, "never body 1\nnever close called\n");
      assert.match(
        never.stderr,
        /error\[OSEO3001\].*Top-level await cannot make progress/u,
      );

      const neverStep = await runNativeCli(
        {
          args: [...args, `${continuationRoot}/never-step.mjs`],
          version: "0.1.0",
        },
        host,
      );
      assert.equal(neverStep.exitStatus, 1);
      assert.equal(neverStep.stdout, "never step called\n");
      assert.match(
        neverStep.stderr,
        /error\[OSEO3001\].*Top-level await cannot make progress/u,
      );
    } finally {
      delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    }
  }

  // BigInt.asUintN allocates one width-bounded working buffer before it
  // publishes anything. A failed allocation there must report the owned
  // OSEO2001 diagnostic and leave no partial BigInt behind, so the
  // program prints nothing and exits nonzero.
  const bigintWidthAllocationHost = {
    ...host,
    async readTextFile(path: string | URL): Promise<string> {
      const source = await host.readTextFile(path);
      if (
        !(path instanceof URL) ||
        !path.pathname.endsWith("/runtime_bigint.c")
      ) {
        return source;
      }
      const injected = source.replace(
        "    size_t length = top_limb + 1u;\n" +
          "    uint32_t *limbs = allocate_limbs(context, length, true);",
        "    size_t length = top_limb + 1u;\n" +
          "    uint32_t *limbs = NULL;\n" +
          "    (void)length;",
      );
      assert.notEqual(
        injected,
        source,
        "BigInt width allocation failure injected",
      );
      return injected;
    },
  };
  const bigintWidthAllocation = await runNativeCli(
    {
      args: ["bigint-width-allocation.ts"],
      source:
        'console.log("before");\n' +
        "console.log(String(BigInt.asUintN(70, -1n)));",
      sourceId: "bigint-width-allocation.ts",
      version: "0.1.0",
    },
    bigintWidthAllocationHost,
  );
  assert.equal(bigintWidthAllocation.exitStatus, 1);
  assert.equal(bigintWidthAllocation.stdout, "before\n");
  assert.match(
    bigintWidthAllocation.stderr,
    /error\[OSEO2001\].*BigInt allocation failed/u,
  );
}
