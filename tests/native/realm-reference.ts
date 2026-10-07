/**
 * The realm members of a reference `$262` for Node.js and Deno, prepended
 * after the agent prelude to a fixture that the native side compiles with
 * the test262 host.
 *
 * `createRealm` creates a `node:vm` context, whose global object holds
 * a complete set of intrinsics of its own, and returns a host object for
 * it with its own `global` and `createRealm`. Both hosts give each context
 * distinct intrinsic objects and share well-known and registered symbols
 * across contexts, as ECMA-262 shares them across realms. The reference
 * host object itself is created in the main realm; a fixture never
 * observes the prototype of a host object.
 */
export const realmReferencePrelude: string = String.raw`
{
  const oseoVm = process.getBuiltinModule("node:vm");
  const oseoRealmHost = (global) => ({
    global,
    createRealm() {
      return oseoRealmHost(oseoVm.runInNewContext("globalThis"));
    },
  });
  const oseoMainHost = oseoRealmHost(globalThis);
  globalThis.$262.createRealm = oseoMainHost.createRealm;
  globalThis.$262.global = globalThis;
}
`;
