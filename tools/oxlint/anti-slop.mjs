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

import { readFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";

const entryPoint = import.meta.resolve("oxlint-plugin-anti-slop");
const sourceRoot = new URL(".", entryPoint).href;

// Node.js does not strip types in node_modules. Limit the hook to this
// package's TypeScript sources and remove it once the plugin is loaded.
const hooks = registerHooks({
  load(url, context, nextLoad) {
    if (!url.startsWith(sourceRoot) || !url.endsWith(".ts")) {
      return nextLoad(url, context);
    }
    const source = readFileSync(new URL(url), "utf8");
    return {
      format: "module",
      shortCircuit: true,
      source: stripTypeScriptTypes(source),
    };
  },
});

let plugin;
try {
  ({ default: plugin } = await import(entryPoint));
} finally {
  hooks.deregister();
}

export default plugin;
