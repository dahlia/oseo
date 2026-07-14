import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkPackageBoundaries } from "../tools/check-boundaries.ts";

async function writePackage(
  root: string,
  directory: string,
  name: string,
  dependencies: Readonly<Record<string, string>> = {},
): Promise<string> {
  const packageRoot = join(root, "packages", directory);
  await mkdir(join(packageRoot, "src"), { recursive: true });
  await writeFile(
    join(packageRoot, "package.json"),
    `${JSON.stringify({ dependencies, name }, null, 2)}\n`,
  );
  await writeFile(join(packageRoot, "src", "index.ts"), "export {};\n");
  return packageRoot;
}

async function boundaryWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "oseo-boundaries-"));
  await writePackage(root, "compiler", "@oseo/compiler");
  await writePackage(root, "runtime-c", "@oseo/runtime-c", {
    "@oseo/compiler": "workspace:*",
  });
  return root;
}

test("checks imports in nested package source directories", async () => {
  const root = await boundaryWorkspace();
  try {
    const cli = await writePackage(root, "cli", "@oseo/cli");
    const nested = join(cli, "src", "frontend");
    await mkdir(nested);
    await writeFile(
      join(nested, "parser.ts"),
      'import { value } from "@oseo/runtime-c";\nvoid value;\n',
    );
    await assert.rejects(
      checkPackageBoundaries(root),
      /does not declare @oseo\/runtime-c/u,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects side-effect imports of private package paths", async () => {
  const root = await boundaryWorkspace();
  try {
    const cli = await writePackage(root, "cli", "@oseo/cli", {
      "@oseo/runtime-c": "workspace:*",
    });
    await writeFile(
      join(cli, "src", "index.ts"),
      'import "@oseo/runtime-c/private";\n',
    );
    await assert.rejects(
      checkPackageBoundaries(root),
      /private path: @oseo\/runtime-c\/private/u,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects undeclared external bare imports", async () => {
  const root = await boundaryWorkspace();
  try {
    const compiler = join(root, "packages", "compiler", "src", "index.ts");
    await writeFile(
      compiler,
      'import { parse } from "@babel/parser";\nvoid parse;\n',
    );
    await assert.rejects(
      checkPackageBoundaries(root),
      /does not declare @babel\/parser/u,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("allows declared external package subpath imports", async () => {
  const root = await boundaryWorkspace();
  try {
    const parser = await writePackage(
      root,
      "parser-babel",
      "@oseo/parser-babel",
      { "@babel/parser": "8.0.4" },
    );
    await writeFile(
      join(parser, "src", "index.ts"),
      'import value from "@babel/parser/subpath";\nvoid value;\n',
    );
    assert.equal(await checkPackageBoundaries(root), 3);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("reserves Babel imports for the parser adapter", async () => {
  const root = await boundaryWorkspace();
  try {
    const compiler = await writePackage(root, "compiler", "@oseo/compiler", {
      "@babel/parser": "8.0.4",
    });
    await writeFile(
      join(compiler, "src", "index.ts"),
      'import { parse } from "@babel/parser";\nvoid parse;\n',
    );
    await assert.rejects(
      checkPackageBoundaries(root),
      /Babel parser belongs to @oseo\/parser-babel/u,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("ignores import-like text outside syntax nodes", async () => {
  const root = await boundaryWorkspace();
  try {
    const compiler = join(root, "packages", "compiler", "src", "index.ts");
    await writeFile(
      compiler,
      '// import "@oseo/runtime-c/private";\n' +
        "const example = 'import \"@babel/parser\"';\n" +
        "void example;\n",
    );
    assert.equal(await checkPackageBoundaries(root), 2);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("checks literal dynamic imports", async () => {
  const root = await boundaryWorkspace();
  try {
    const compiler = join(root, "packages", "compiler", "src", "index.ts");
    await writeFile(compiler, 'void import("@babel/parser");\n');
    await assert.rejects(
      checkPackageBoundaries(root),
      /does not declare @babel\/parser/u,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects relative imports outside the package root", async () => {
  const root = await boundaryWorkspace();
  try {
    const compiler = join(root, "packages", "compiler", "src", "index.ts");
    await writeFile(compiler, 'import "../../runtime-c/src/index.ts";\n');
    await assert.rejects(
      checkPackageBoundaries(root),
      /imports outside its package/u,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects dependencies between concrete adapters", async () => {
  const root = await boundaryWorkspace();
  try {
    await writePackage(root, "parser-babel", "@oseo/parser-babel", {
      "@oseo/compiler": "workspace:*",
      "@oseo/runtime-c": "workspace:*",
    });
    await assert.rejects(
      checkPackageBoundaries(root),
      /@oseo\/parser-babel must not depend on @oseo\/runtime-c/u,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
