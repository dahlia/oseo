/*
 * Oseo, an ahead-of-time compiler for JavaScript and TypeScript.
 * Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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
