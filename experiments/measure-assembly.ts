import { readFileSync } from "node:fs";

const args: readonly string[] = process.argv.slice(2);
const path = args[0];
const target = args[1];
const functions: readonly string[] = args.slice(2);
if (path == null || target == null || functions.length === 0) {
  throw new Error("usage: measure-assembly.ts <path> <target> <function>...");
}

const lines: readonly string[] = readFileSync(path, "utf8").split("\n");
for (const name of functions) {
  const symbols = [name, `_${name}`];
  const start = lines.findIndex((line) =>
    symbols.some((symbol) => line.trim().startsWith(`${symbol}:`)),
  );
  if (start < 0) throw new Error(`${name} not found in ${path}`);
  const symbol = lines[start]?.trim().split(":", 1)[0];
  if (symbol == null) throw new Error(`${name} has no symbol in ${path}`);
  const body: string[] = [];
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index]?.trim();
    if (line == null) break;
    if (
      line === ".cfi_endproc" ||
      line.startsWith(`.size\t${symbol},`) ||
      line.startsWith(`.size ${symbol},`)
    )
      break;
    if (line === "" || line.startsWith(".") || line.endsWith(":")) continue;
    const instruction = line
      .replace(/[#;].*$/u, "")
      .replace(/\/\/.*$/u, "")
      .trim();
    const opcode = instruction.split(/\s+/u)[0];
    if (opcode != null && opcode !== "") body.push(opcode);
  }
  console.log(
    `${target} ${name}: ${body.length} instructions [${body.join(", ")}]`,
  );
}
