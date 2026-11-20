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

import { realpath } from "node:fs/promises";
import type {
  CompilerHost,
  ProcessObservation,
} from "../../packages/compiler/src/index.ts";

/**
 * Execute a whole subject as Script code in a persistent reference realm.
 * Each host function belongs to the realm it serves. Parsing is separated
 * from evaluation so a parse error is constructed in that realm without
 * replacing a SyntaxError explicitly thrown by the subject.
 */
export function hostScriptReference(source: string): string {
  return `
const vm = process.getBuiltinModule("node:vm");
function realm() {
  const context = vm.createContext({ console });
  const bridge = (source) => {
    let script;
    try { script = new vm.Script(source); }
    catch (error) { return { syntax: error.message }; }
    return { run: () => script.runInContext(context) };
  };
  return vm.runInContext(\`(bridge, realm) => {
    const host = {
      global: globalThis,
      createRealm() { return realm(); },
      evalScript(source) {
        if (typeof source !== "string") throw new TypeError("String required");
        const parsed = bridge(source);
        if (parsed.syntax !== undefined) throw new SyntaxError(parsed.syntax);
        return parsed.run();
      },
    };
    Object.defineProperty(globalThis, "$262", {
      value: host, writable: true, configurable: true,
    });
    Object.defineProperty(globalThis, "print", {
      value: function print(value) { console.log(String(value)); },
      writable: true, configurable: true,
    });
    return host;
  }\`, context)(bridge, realm);
}
realm().evalScript(${JSON.stringify(source)});
`;
}

/**
 * Run independent Node and Deno Script observers, retaining failed inputs.
 * Deno's CommonJS loader canonicalizes the main module before reading it but
 * grants implicit read access only to the path it was given, so the observer
 * runs from the canonical directory. A temporary directory behind a symbolic
 * link, such as macOS /var/folders, or an 8.3 short name, such as the
 * Windows runner profile, would otherwise fail before evaluating the subject.
 */
export async function hostScriptReferences(
  host: CompilerHost,
  source: string,
): Promise<readonly ProcessObservation[]> {
  const directory = await realpath(
    await host.makeTemporaryDirectory("oseo-host-script-ref-"),
  );
  const path = `${directory}/reference.cjs`;
  let succeeded = false;
  try {
    await host.writeTextFile(path, hostScriptReference(source));
    const observations = [
      await host.run({
        command: "node",
        args: [path],
        cwd: directory,
      }),
      await host.run({
        command: "deno",
        args: ["run", "--quiet", path],
        cwd: directory,
      }),
    ];
    succeeded = true;
    return observations;
  } finally {
    if (succeeded) await host.remove(directory);
  }
}
