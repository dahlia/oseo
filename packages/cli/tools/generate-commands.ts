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

import { readFile, writeFile } from "node:fs/promises";
import { generateCommandsModule } from "@optique/discover/generator";

const outputFile = new URL("../src/commands.generated.ts", import.meta.url);
const generated = await generateCommandsModule({
  dir: new URL("../src/commands/", import.meta.url),
  extensions: [".ts"],
  outputFile,
});
// The generator's inferred default export cannot pass isolated declarations.
// Add an explicit annotation as part of generation, never by editing output.
const code =
  generated.code
    .replace(
      "import { commandsFromModules }",
      `/*
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

import type { ModuleCommand } from "@optique/discover";
` +
        'import type { CliCommandContext } from "./options.ts";\n' +
        'import { reserveRootCommandNames } from "./command-registry.ts";\n\n' +
        "import { commandsFromModules }",
    )
    .replace(
      "export default commandsFromModules(",
      "const commands: readonly ModuleCommand<CliCommandContext>[] =\n  " +
        "commandsFromModules<CliCommandContext>(",
    ) +
  "\nconst registeredCommands: readonly " +
  "ModuleCommand<CliCommandContext>[] =\n  " +
  "reserveRootCommandNames(commands);\n" +
  "\nexport default registeredCommands;\n";
if (process.argv.includes("--check")) {
  if ((await readFile(outputFile, "utf8")) !== code) {
    throw new Error(
      "Command registry is stale; run mise run generate:commands.",
    );
  }
} else {
  await writeFile(outputFile, code);
}
