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
      'import type { ModuleCommand } from "@optique/discover";\n' +
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
