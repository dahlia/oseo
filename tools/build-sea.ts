import { execFileSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { isBuiltin } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { build, type Rolldown } from "tsdown";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import { isObject, isString } from "./value-kinds.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const packages = join(root, "packages");
const runtime = cRuntimeProvider.getRuntimeInput();
const cliAdapter = join(packages, "cli/src/cli-assets.ts");
const virtualAdapter = "\0oseo-sea-cli-assets";
const reviewedDependencies = [
  "@babel/parser",
  "@optique/core",
  "@optique/discover",
  "@optique/run",
];

function sourceBundle(version: string): Rolldown.Plugin {
  return {
    name: "oseo-sea",
    resolveId(id, importer) {
      if (
        id === "./cli-assets.ts" &&
        importer != null &&
        resolve(importer, "..", id) === cliAdapter
      ) {
        return virtualAdapter;
      }
      if (/^@oseo\/[a-z-]+$/u.test(id)) {
        return join(packages, id.slice("@oseo/".length), "src/index.ts");
      }
    },
    load(id) {
      if (id !== virtualAdapter) return;
      return `
import { getAsset } from "node:sea";
import { createNodeHost as createFileHost } from "@oseo/host";
const runtime = ${JSON.stringify({
        abiVersion: runtime.abiVersion,
        assets: runtime.assets.map(({ kind, name }) => ({ kind, name })),
      })};
const prefix = "oseo-sea:/runtime/";
const assets = runtime.assets.map((asset) => ({
  ...asset, url: new URL(prefix + asset.name),
}));
const keys = new Map(assets.map(({ name, url }) => [url.href, name]));
export const cRuntimeProvider = {
  getRuntimeInput: () => ({ abiVersion: runtime.abiVersion, assets }),
};
export const readCliVersion = () => ${JSON.stringify(version)};
export function createNodeHost(options) {
  const host = createFileHost(options);
  return {
    ...host,
    async readTextFile(path) {
      const name = path instanceof URL ? keys.get(path.href) : undefined;
      if (name != null) return getAsset(name, "utf8");
      return await host.readTextFile(path);
    },
  };
}
`;
    },
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk") continue;
        for (const id of [...chunk.imports, ...chunk.dynamicImports]) {
          if (id !== chunk.fileName && !isBuiltin(id)) {
            this.error(`The SEA bundle has an external import: ${id}`);
          }
        }
      }
    },
  };
}

function hostTarget(): string {
  if (process.platform === "linux" && process.arch === "x64") {
    return "linux-x86_64-gnu";
  }
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "macos-aarch64";
  }
  throw new Error(`Unsupported SEA host: ${process.platform}/${process.arch}`);
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

async function stageNotices(
  directory: string,
  moduleIds: readonly string[],
  dependencies: ReadonlyMap<string, Set<string>>,
): Promise<string[]> {
  const nodeLicense =
    process.env.OSEO_SEA_NODE_LICENSE ??
    resolve(dirname(process.execPath), "../LICENSE");
  await copyFile(nodeLicense, join(directory, "NODE-LICENSE.txt"));
  await copyFile(join(root, "LICENSE"), join(directory, "LICENSE"));
  const noticeSources = new Map([
    ["MIT-LICENSE.txt", root],
    ["ROLLDOWN-LICENSE.txt", join(packages, "cli")],
    ["UNICODE-LICENSE.txt", join(packages, "runtime-c")],
  ]);
  await Promise.all(
    [...noticeSources].map(async ([name, source]) => {
      if ((await readdir(source)).includes(name)) {
        await copyFile(join(source, name), join(directory, name));
      }
    }),
  );
  // The last node_modules segment is the installed package. This also works
  // for transitive dependencies in pnpm's virtual store.
  const dependencyRoots = new Map<string, string>();
  for (const id of moduleIds) {
    const marker = "/node_modules/";
    const begin = id.lastIndexOf(marker);
    if (begin < 0) continue;
    const path = id.slice(begin + marker.length);
    const name = /^(@[^/]+\/[^/]+|[^/]+)\//u.exec(path)?.[1];
    if (name != null && dependencies.has(name)) {
      dependencyRoots.set(name, id.slice(0, begin + marker.length) + name);
    }
  }
  const records = await Promise.all(
    [...dependencies]
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(async ([name, versions]) => {
        const directoryPath = dependencyRoots.get(name);
        const [version] = versions;
        if (directoryPath == null || version == null || versions.size !== 1) {
          throw new Error(`Cannot identify one installed license for ${name}.`);
        }
        const texts = (await readdir(directoryPath))
          .filter((file) =>
            /^(?:LICEN[CS]E|COPYING|NOTICE)(?:[.-].*)?$/iu.test(file),
          )
          .toSorted();
        if (texts.length === 0) {
          throw new Error(`No license or notice found for ${name}@${version}.`);
        }
        const prefix = name.replace(/^@/u, "").replace("/", "-");
        await Promise.all(
          texts.map(async (file) => {
            await copyFile(
              join(directoryPath, file),
              join(directory, `${prefix}-${file}.txt`),
            );
          }),
        );
        return `- [${name}@${version}](https://www.npmjs.com/package/${name}/v/${version})`;
      }),
  );
  return records;
}

async function stageArchive(
  staging: string,
  target: string,
  version: string,
  revision: string,
  moduleIds: readonly string[],
  dependencies: ReadonlyMap<string, Set<string>>,
): Promise<void> {
  const records = await stageNotices(staging, moduleIds, dependencies);
  git(
    "archive",
    "--format=tar.gz",
    "--prefix=oseo-source/",
    `--output=${join(staging, "oseo-source.tar.gz")}`,
    revision,
  );
  await writeFile(
    join(staging, "README.md"),
    `# Oseo ${version}

This archive contains the standalone Oseo CLI for \`${target}\`.
It embeds Node.js ${process.version} to run the compiler. Programs produced
by Oseo do not embed Node.js.

Run \`./oseo --help\` to see the available commands. The [Oseo documentation]
explains how to build and run a TypeScript program.

## Source and notices

Oseo's source and build scripts for this binary are in *oseo-source.tar.gz*
([revision \`${revision}\`][oseo-source]). To rebuild on this target, check
out that revision with Git, install the pinned workspace dependencies and
Node.js ${process.version}, then run
\`node tools/build-sea.ts <output-dir> ${version}\`.

The archive includes license texts for Oseo, its runtime assets, the
[embedded Node.js distribution][node-source], and these bundled dependencies:

${records.join("\n")}

[Oseo documentation]: https://oseo.dev/
[oseo-source]: https://github.com/dahlia/oseo/tree/${revision}
[node-source]: https://nodejs.org/dist/${process.version}/node-${process.version}.tar.gz
`,
  );
}

async function buildSea(output: string, version: string): Promise<void> {
  const target = hostTarget();
  if (!process.version.startsWith("v26.")) {
    throw new Error(
      `The SEA build requires Node.js 26, got ${process.version}.`,
    );
  }
  if (git("status", "--porcelain", "--untracked-files=no") !== "") {
    throw new Error(
      "Build the SEA from a clean checkout to archive its source.",
    );
  }
  const revision = git("rev-parse", "HEAD");
  const scratch = await mkdtemp(join(tmpdir(), "oseo-sea-"));
  try {
    const staging = join(scratch, "staging");
    await mkdir(staging);
    const [result] = await build({
      config: false,
      cwd: root,
      deps: {
        alwaysBundle: reviewedDependencies,
        onlyBundle: reviewedDependencies,
      },
      dts: false,
      entry: [join(packages, "cli/src/main.ts")],
      exe: {
        fileName: "oseo",
        outDir: staging,
        seaConfig: {
          assets: Object.fromEntries(
            runtime.assets.map(({ name, url }) => [name, fileURLToPath(url)]),
          ),
          execArgvExtension: "none",
        },
      },
      failOnWarn: true,
      format: "esm",
      outDir: join(scratch, "bundle"),
      platform: "node",
      plugins: [sourceBundle(version)],
      target: "node26",
    });
    if (result == null) throw new Error("tsdown did not build the SEA bundle.");
    const moduleIds = result.chunks.flatMap((chunk) =>
      chunk.type === "chunk" ? chunk.moduleIds : [],
    );
    if (process.platform === "darwin") {
      execFileSync("codesign", ["--verify", "--strict", join(staging, "oseo")]);
    }
    await stageArchive(
      staging,
      target,
      version,
      revision,
      moduleIds,
      result.inlinedDeps,
    );
    await mkdir(output, { recursive: true });
    const name = `oseo-${version}-${target}.tar.bz2`;
    const publication = await mkdtemp(join(output, ".oseo-sea-"));
    try {
      const temporaryArchive = join(publication, name);
      const files = (await readdir(staging)).toSorted();
      execFileSync("tar", ["-cjf", temporaryArchive, "-C", staging, ...files]);
      const archive = join(output, name);
      await rename(temporaryArchive, archive);
      console.log(archive);
    } finally {
      await rm(publication, { recursive: true, force: true });
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

const [, , output, requestedVersion] = process.argv;
if (output == null || process.argv.length > 4) {
  throw new Error("Usage: node tools/build-sea.ts <output-dir> [version]");
}
const manifest: unknown = JSON.parse(
  await readFile(join(packages, "cli/package.json"), "utf8"),
);
const version =
  requestedVersion ??
  (isObject(manifest) && "version" in manifest ? manifest.version : undefined);
if (!isString(version) || !/^\d+\.\d+\.\d+(?:[-+][\w.+-]+)?$/u.test(version)) {
  throw new Error("A valid release or canary version is required.");
}
await buildSea(resolve(output), version);
