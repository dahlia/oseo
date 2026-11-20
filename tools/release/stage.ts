/* eslint-disable no-await-in-loop -- Process packages in dependency order. */
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

import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { parse } from "@babel/parser";

import { packNpmPackages } from "../check-packages.ts";
import { parsedObject } from "../structured-data.ts";
import { isNumber, isObject, isString } from "../value-kinds.ts";
import { inventory, seal } from "./artifacts.ts";
import { prepare } from "./identity.ts";

interface SourcePackage {
  readonly name: string;
  readonly directory: string;
  readonly dependencies?: Readonly<Record<string, string>>;
}

function writeJson<T extends object>(path: string, value: T): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function smokeNpm(
  npm: string,
  packages: readonly SourcePackage[],
  version: string,
): void {
  const cwd = mkdtempSync(join(tmpdir(), "oseo-npm-smoke-"));
  try {
    writeJson(join(cwd, "package.json"), { private: true });
    execFileSync(
      "npm",
      [
        "install",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
        ...packages.map(({ directory }) =>
          join(npm, `oseo-${directory}-${version}.tgz`),
        ),
      ],
      { cwd, stdio: "inherit" },
    );
    const output = execFileSync(
      process.execPath,
      ["node_modules/@oseo/cli/dist/main.js", "--version"],
      { cwd, encoding: "utf8" },
    );
    if (output.trim() !== version) {
      throw new Error(
        `Installed npm CLI reported ${output.trim()}, not ${version}.`,
      );
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function packageOrder(
  packages: readonly SourcePackage[],
): readonly SourcePackage[] {
  const pending = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const result: SourcePackage[] = [];
  while (pending.size > 0) {
    const next = [...pending.values()].find((pkg) =>
      Object.keys(pkg.dependencies ?? {}).every((dep) => !pending.has(dep)),
    );
    if (next == null) throw new Error("Cyclic release package dependencies.");
    pending.delete(next.name);
    result.push(next);
  }
  return result;
}

/** Make registry specifiers explicit so JSR retry checks can compare bytes. */
function stageImports(
  source: string,
  dependencies: Readonly<Record<string, string>>,
  version: string,
): string {
  const edits: { start: number; end: number; text: string }[] = [];
  const importNodes = new Set([
    "ImportDeclaration",
    "ExportNamedDeclaration",
    "ExportAllDeclaration",
    "ImportExpression",
    "TSImportType",
  ]);
  function walk<T>(value: T): void {
    if (!isObject(value)) return;
    if (
      "type" in value &&
      isString(value.type) &&
      importNodes.has(value.type)
    ) {
      const literal =
        "source" in value
          ? value.source
          : "argument" in value
            ? value.argument
            : null;
      if (
        isObject(literal) &&
        "value" in literal &&
        isString(literal.value) &&
        "start" in literal &&
        isNumber(literal.start) &&
        "end" in literal &&
        isNumber(literal.end)
      ) {
        const specifier = literal.value;
        const name = specifier
          .split("/")
          .slice(0, specifier.startsWith("@") ? 2 : 1)
          .join("/");
        const range = dependencies[name];
        if (range != null) {
          const mapped = name.startsWith("@oseo/")
            ? `jsr:${name}@${version}`
            : `npm:${name}@${range}`;
          edits.push({
            start: literal.start,
            end: literal.end,
            text: JSON.stringify(mapped + specifier.slice(name.length)),
          });
        }
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== "loc") walk(child);
    }
  }
  walk(
    parse(source, {
      sourceType: "module",
      plugins: ["typescript"],
      createImportExpressions: true,
    }),
  );
  let result = source;
  for (const { start, end, text } of edits.toSorted(
    (a, b) => b.start - a.start,
  )) {
    result = result.slice(0, start) + text + result.slice(end);
  }
  return result;
}

const jsrCompoundLicenses = new Map([
  ["@oseo/backend-c", "GPL-3.0-or-later AND MIT"],
  ["@oseo/runtime-c", "GPL-3.0-or-later AND MIT AND Unicode-3.0"],
  ["@oseo/unicode", "GPL-3.0-or-later AND Unicode-3.0"],
]);

export function stageJsr(
  root: string,
  destination: string,
  packages: readonly SourcePackage[],
  version: string,
): void {
  mkdirSync(destination);
  writeJson(join(destination, "deno.json"), {
    workspace: packages.map(({ directory }) => `./${directory}`),
    lock: false,
  });
  for (const pkg of packages) {
    const source = join(root, "packages", pkg.directory);
    const target = join(destination, pkg.directory);
    mkdirSync(target);
    const config = parsedObject(
      JSON.parse(readFileSync(join(source, "deno.json"), "utf8")),
      `JSR config for ${pkg.name}`,
    );
    // JSR accepts one identifier. The copied files carry the component terms.
    const compoundLicense = jsrCompoundLicenses.get(pkg.name);
    const license =
      compoundLicense != null && config.license === compoundLicense
        ? "GPL-3.0-or-later"
        : config.license;
    if (
      license !== undefined &&
      (!isString(license) || !/^[A-Za-z0-9][A-Za-z0-9.-]*\+?$/u.test(license))
    ) {
      throw new Error(`${pkg.name} needs a single JSR license identifier.`);
    }
    for (const entry of readdirSync(source)) {
      if (
        entry === "src" ||
        entry === "native" ||
        entry === "README.md" ||
        /LICENSE|NOTICE/u.test(entry)
      ) {
        cpSync(join(source, entry), join(target, entry), { recursive: true });
      }
    }
    writeJson(join(target, "deno.json"), { ...config, license, version });
    for (const path of Object.keys(inventory(target))) {
      if (!path.endsWith(".ts")) continue;
      const file = join(target, path);
      writeFileSync(
        file,
        stageImports(
          readFileSync(file, "utf8"),
          pkg.dependencies ?? {},
          version,
        ),
      );
    }
  }
}

async function stagePackages(
  root: string,
  destination: string,
  npmVersion: string,
  jsrVersion: string,
): Promise<void> {
  const packages = packageOrder(
    readdirSync(join(root, "packages"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map(({ name: directory }) => {
        // SAFETY: prepare validated the checked-in lockstep manifests.
        const manifest = JSON.parse(
          readFileSync(
            join(root, "packages", directory, "package.json"),
            "utf8",
          ),
        ) as Omit<SourcePackage, "directory">;
        return {
          name: manifest.name,
          directory,
          dependencies: manifest.dependencies ?? {},
        };
      }),
  );
  writeJson(join(destination, "packages.json"), {
    packages: packages.map(({ directory, name }) => ({
      directory,
      name,
      tarball: `oseo-${directory}-${npmVersion}.tgz`,
    })),
  });
  const npm = join(destination, "npm");
  mkdirSync(npm);
  await packNpmPackages(root, npm, npmVersion);
  smokeNpm(npm, packages, npmVersion);
  const jsr = join(destination, "jsr");
  stageJsr(root, jsr, packages, jsrVersion);
  execFileSync("deno", ["publish", "--dry-run", "--allow-slow-types"], {
    cwd: jsr,
    stdio: "inherit",
  });
}

const entry = process.argv[1];
if (entry != null && import.meta.filename === resolve(entry)) {
  const [mode, output] = process.argv.slice(2);
  if (output == null || !["identity", "packages"].includes(mode ?? "")) {
    throw new Error(
      "Usage: node tools/release/stage.ts identity|packages <output>",
    );
  }
  const root = process.cwd();
  const destination = resolve(output);
  mkdirSync(destination);
  const identity = await prepare(root, destination);
  if (mode === "packages") {
    await stagePackages(root, destination, identity.npm, identity.jsr);
  }
  seal(destination, identity.sha);
}
