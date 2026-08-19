import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ruleCases = [
  {
    name: "no-chained-type-assertions",
    violation: [
      "declare const value: unknown;",
      "export const x = value as object as { x: number };",
    ].join(" "),
  },
  {
    name: "no-conditional-empty-object-spread",
    violation: [
      "declare const include: boolean;",
      "export const x = { ...(include ? { value: 1 } : {}) };",
    ].join(" "),
  },
  {
    name: "no-known-value-widening",
    violation:
      "export const handlers: Record<string, () => void> = { start() {} };",
  },
  {
    name: "no-module-mocking",
    violation: 'vi.mock("./store.ts");',
  },
  {
    name: "no-object-parameters",
    violation: "export function save(value: object): void { void value; }",
  },
  {
    name: "no-reflect-apply",
    violation: [
      "declare function operation(): void;",
      "Reflect.apply(operation, undefined, []);",
    ].join(" "),
  },
  {
    name: "no-reflect-get",
    violation: [
      "declare const owner: { value: number };",
      'export const x = Reflect.get(owner, "value");',
    ].join(" "),
  },
  {
    name: "no-runtime-typeof",
    violation: [
      "declare const value: string | number;",
      'export const x = typeof value === "string";',
    ].join(" "),
  },
  {
    name: "no-shape-in-symbol-names",
    violation: "export const userShape = 1;",
  },
  {
    name: "no-unknown-parameters",
    violation: "export function parse(value: unknown): void { void value; }",
  },
  {
    name: "no-unknown-returns",
    violation: "export function load(): unknown { return 1; }",
  },
  {
    name: "no-unknown-type-aliases",
    violation: "export type ExternalValue = unknown;",
  },
  {
    name: "no-unsafe-dictionary-type",
    violation: "export type Metadata = Record<string, unknown>;",
  },
  {
    name: "no-widen-then-assert",
    violation: [
      "interface User { readonly id: string }",
      "declare function loadUser(): User;",
      "const loaded: User = loadUser();",
      "const stored: unknown = loaded;",
      "export const user = stored as User;",
    ].join("\n"),
  },
  {
    name: "require-safety-comment-for-type-assertion",
    violation:
      "declare const value: unknown; export const x = value as string;",
  },
] as const;

const packagePath = fileURLToPath(import.meta.resolve("oxlint/package.json"));
const oxlintPath = join(dirname(packagePath), "bin", "oxlint");
const pluginPath = resolve("tools/oxlint/anti-slop/index.ts");
const cleanSource = "export const answer = 42 as const;\n";

const temporaryRoot = await mkdtemp(join(tmpdir(), "oseo-anti-slop-"));
try {
  await Promise.all(
    ruleCases.map((ruleCase) =>
      test(ruleCase.name, async () => {
        const directory = join(temporaryRoot, ruleCase.name);
        const configPath = join(directory, ".oxlintrc.json");
        await mkdir(directory);
        await writeFile(
          configPath,
          JSON.stringify({
            jsPlugins: [{ name: "anti-slop", specifier: pluginPath }],
            rules: { [`anti-slop/${ruleCase.name}`]: "error" },
          }),
        );
        await writeFile(join(directory, "violation.ts"), ruleCase.violation);
        await writeFile(join(directory, "clean.ts"), cleanSource);

        const result = spawnSync(
          process.execPath,
          [oxlintPath, "--format", "unix", directory],
          { encoding: "utf8" },
        );
        const output = `${result.stdout}${result.stderr}`;
        assert.equal(result.status, 1, output);
        assert.match(output, new RegExp(`anti-slop\\(${ruleCase.name}\\)`));
        assert.match(output, /violation\.ts/u);
        assert.doesNotMatch(output, /clean\.ts/u);
      }),
    ),
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
