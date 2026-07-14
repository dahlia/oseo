import { readFileSync } from "node:fs";

const arguments_: readonly string[] = process.argv.slice(2);
const path = arguments_[0];
const architecture = arguments_[1];
const functions: readonly string[] = arguments_.slice(2);
if (path == null || architecture == null || functions.length === 0) {
  throw new Error(
    "usage: measure-assembly.ts <path> <architecture> <function>...",
  );
}

const lines: readonly string[] = readFileSync(path, "utf8").split("\n");
for (const name of functions) {
  const start = lines.findIndex((line) => line.trim().startsWith(`${name}:`));
  if (start < 0) throw new Error(`${name} not found in ${path}`);
  const body: string[] = [];
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index].trim();
    if (
      line.startsWith(`.size\t${name},`) || line.startsWith(`.size ${name},`)
    ) break;
    if (line === "" || line.startsWith(".") || line.endsWith(":")) continue;
    const instruction = line.replace(/[#;].*$/u, "").replace(/\/\/.*$/u, "")
      .trim();
    if (instruction !== "") body.push(instruction.split(/\s+/u)[0]);
  }
  console.log(
    `${architecture} ${name}: ${body.length} instructions [${body.join(", ")}]`,
  );
}
