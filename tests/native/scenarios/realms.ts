/* eslint-disable no-await-in-loop -- Native scenario builds are isolated. */
import assert from "node:assert/strict";

import { runNativeCli } from "../../native-cli.ts";
import type { NativeScenarioContext } from "../scenario.ts";

/*
 * Native-only realm observations (ADR 0027). The reference hosts compile
 * source text in any realm and create their host objects in the main
 * realm, so they have no counterpart for the ADR 0016 boundary that
 * `%eval%` and `%Function%` report here, for the realm a created host
 * object belongs to, or for the unresolvable `$262` of an ordinary build.
 */
export async function runRealmScenarios(
  context: NativeScenarioContext,
): Promise<void> {
  const { host } = context;
  const run = async (name: string, source: string, hosted = true) =>
    await runNativeCli(
      {
        args: [...(hosted ? ["--test262-host"] : []), name],
        source,
        sourceId: name,
        version: "0.1.0",
      },
      host,
    );

  // A created realm's host object is an object of that realm with its own
  // `global` and `createRealm` and no `agent`; `createRealm` is not a
  // constructor; and the realms draw distinct Math.random sequences.
  const hostObjects = await run(
    "realm-host-objects.ts",
    `
const created = $262.createRealm();
const other = created.global;
const nested = created.createRealm();
console.log(
  Object.getPrototypeOf(created) === other.Object.prototype,
  Object.getPrototypeOf($262) === Object.prototype,
  created.createRealm !== $262.createRealm,
  Object.getPrototypeOf(created.createRealm) === other.Function.prototype,
  "agent" in created,
  typeof $262.agent,
  $262.createRealm.length,
  $262.createRealm.name,
  nested.global !== other,
);
try {
  new $262.createRealm();
} catch (error) {
  console.log(error instanceof TypeError);
}
const draws = [Math.random(), other.Math.random(), nested.global.Math.random()];
console.log(new Set(draws).size);
`,
  );
  assert.equal(hostObjects.exitStatus, 0, hostObjects.stderr);
  assert.equal(
    hostObjects.stdout,
    "true true true true false object 0 createRealm true\ntrue\n3\n",
  );
  assert.equal(hostObjects.stderr, "");

  // A promise that resolves to itself rejects with a TypeError of the
  // realm whose resolving functions it was created with, even when the
  // reaction job that resolves it runs in another realm. Node.js and Deno
  // create that error in the job's realm, so this check has no reference.
  const selfResolution = await run(
    "realm-self-resolution.ts",
    `
const other = $262.createRealm().global;
let chained;
chained = other.Promise.resolve().then(() => chained);
chained.catch((error) => {
  console.log(error instanceof other.TypeError, error instanceof TypeError);
});
`,
  );
  assert.equal(selfResolution.exitStatus, 0, selfResolution.stderr);
  assert.equal(selfResolution.stdout, "true false\n");

  // A String argument to another realm's %eval% is dynamic source: the
  // ADR 0016 boundary ends the program with OSEO1001 at the call, before
  // anything after it runs. A non-String argument returns unchanged.
  const evalBoundary = await run(
    "realm-eval-boundary.ts",
    `
const other = $262.createRealm().global;
console.log(other.eval(1), other.eval(undefined));
other.eval("1");
console.log("unreachable");
`,
  );
  assert.equal(evalBoundary.exitStatus, 1);
  assert.equal(evalBoundary.stdout, "1 undefined\n");
  assert.match(
    evalBoundary.stderr,
    /realm-eval-boundary\.ts:4:\d+: error\[OSEO1001\]: eval compiles source/u,
  );
  assert.match(evalBoundary.stderr, /outside the admitted profile\./u);

  // The initial realm's own %eval% value reports the same boundary.
  const localEval = await run(
    "realm-local-eval-boundary.ts",
    `
const indirect = globalThis.eval;
indirect("0");
`,
    false,
  );
  assert.equal(localEval.exitStatus, 1);
  assert.match(localEval.stderr, /error\[OSEO1001\]: eval compiles source/u);

  // Another realm's %Function% reports the boundary as OSEO1001 too.
  const functionBoundary = await run(
    "realm-function-boundary.ts",
    `
const other = $262.createRealm().global;
new other.Function();
`,
  );
  assert.equal(functionBoundary.exitStatus, 1);
  assert.match(
    functionBoundary.stderr,
    /error\[OSEO1001\]: Function compiles source text at run time/u,
  );

  // Without the test262 host, `$262` is an unresolvable reference.
  const unhosted = await run(
    "realm-unhosted.ts",
    `
console.log(typeof globalThis.$262);
$262.createRealm();
`,
    false,
  );
  assert.equal(unhosted.exitStatus, 1);
  assert.equal(unhosted.stdout, "undefined\n");
  assert.match(unhosted.stderr, /ReferenceError: \$262 is not defined\./u);
}
