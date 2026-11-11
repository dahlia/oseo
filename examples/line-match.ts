import { readFileSync } from "node:fs";
import process from "node:process";

const args = process.argv.slice(2);
if (args.length > 2) {
  process.stderr.write("usage: line-match.ts [pattern [label]]\n");
  process.exit(2);
}

try {
  const pattern = new RegExp(args.length > 0 ? args[0] : "\\S", "u");
  const label =
    args.length > 1 ? args[1] : (process.env.DEMO_LABEL ?? "matches");
  const input = readFileSync(0, "utf8");
  const lines = input === "" ? [] : input.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  const matches = [];
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) {
      matches.push({ line: i + 1, text: lines[i] });
    }
  }
  process.stdout.write(JSON.stringify({ label, lines: lines.length, matches }));
  process.stdout.write("\n");
} catch {
  process.stderr.write("line-match: invalid pattern or unreadable input\n");
  process.exitCode = 2;
}
