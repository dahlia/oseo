import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import process from "node:process";

interface SmokeEnvironment {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
}

function run(
  environment: SmokeEnvironment,
  command: string,
  args: readonly string[],
): string {
  return execFileSync(command, args, {
    ...environment,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    timeout: 10 * 60 * 1000,
  });
}

function offlineCommand(): readonly [command: string, ...args: string[]] {
  const wrapper = process.env.OSEO_SEA_OFFLINE_WRAPPER;
  if (wrapper != null) return [resolve(wrapper)];
  if (process.platform === "linux") {
    return ["/usr/bin/unshare", "--user", "--map-root-user", "--net", "--"];
  }
  if (process.platform === "darwin") {
    return [
      "/usr/bin/sandbox-exec",
      "-p",
      "(version 1) (allow default) (deny network*)",
    ];
  }
  throw new Error(`Unsupported SEA smoke host: ${process.platform}.`);
}

async function smoke(archive: string, version: string, zig?: string) {
  const scratch = await mkdtemp(join(tmpdir(), "oseo-sea-smoke-"));
  try {
    const home = join(scratch, "home");
    const bin = join(scratch, "bin");
    const cwd = join(scratch, "extracted");
    const cache = join(scratch, "cache");
    await Promise.all([mkdir(home), mkdir(bin), mkdir(cwd), mkdir(cache)]);
    // Only the verified Zig downloader's archive tools are on PATH.
    await symlink("/usr/bin/tar", join(bin, "tar"));
    if (process.platform === "linux") {
      await symlink("/usr/bin/xz", join(bin, "xz"));
    }
    const env = {
      HOME: home,
      PATH: bin,
      TMPDIR: scratch,
      XDG_CACHE_HOME: cache,
    };
    const environment = { cwd, env };
    const tar = (args: readonly string[]) =>
      run(
        { cwd, env: { ...env, PATH: "/usr/bin:/bin" } },
        "/usr/bin/tar",
        args,
      );
    const contents = tar(["-tjf", archive]).trim().split("\n");
    for (const file of contents) {
      assert.match(file, /^[A-Za-z0-9][A-Za-z0-9_.-]*$/u);
    }
    assert.equal(new Set(contents).size, contents.length);
    for (const file of [
      "LICENSE",
      "MIT-LICENSE.txt",
      "NODE-LICENSE.txt",
      "README.md",
      "ROLLDOWN-LICENSE.txt",
      "UNICODE-LICENSE.txt",
      "oseo",
      "oseo-source.tar.gz",
    ]) {
      assert.ok(contents.includes(file), `Missing ${file} in archive.`);
    }
    tar(["-xjf", archive]);
    if (process.platform === "darwin") {
      run(environment, "/usr/bin/codesign", ["--verify", "--strict", "oseo"]);
    }
    const oseo = join(cwd, "oseo");
    const [wrapper, ...wrapperArgs] = offlineCommand();
    const offline = (args: readonly string[], execution = environment) =>
      run(execution, wrapper, [...wrapperArgs, oseo, ...args]);
    assert.deepEqual(offline(["--version"]).trim(), version);
    assert.match(offline(["build", "--help"]), /--emit-c/u);
    const source = join(cwd, "demo.ts");
    await writeFile(
      source,
      "const answer: number = 6 * 7; console.log(answer);\n",
    );
    assert.match(offline(["build", "--emit-c", source]), /#include/u);
    assert.deepEqual(await readdir(cache), []);

    const compile = (name: string, ...args: string[]) => [
      "build",
      "--output",
      name,
      ...args,
      source,
    ];
    const verify = (name: string) =>
      assert.equal(run(environment, join(cwd, name), []), "42\n");
    let override = zig;
    if (override == null) {
      run(environment, oseo, compile("first"));
      verify("first");
      offline(compile("cached"));
      verify("cached");
      const zigCache = join(cache, "oseo", "zig");
      const versionDirectory = (
        await readdir(zigCache, { withFileTypes: true })
      ).find((entry) => entry.isDirectory() && !entry.name.startsWith("."));
      assert.ok(versionDirectory, "Zig did not install into the clean cache.");
      const host =
        process.platform === "darwin" ? "aarch64-macos" : "x86_64-linux";
      override = join(zigCache, versionDirectory.name, host, "zig");
    }
    await access(override);
    const emptyCache = join(scratch, "override-cache");
    await mkdir(emptyCache);
    offline(compile("override", "--zig", override), {
      cwd,
      env: { ...env, XDG_CACHE_HOME: emptyCache },
    });
    verify("override");
    console.log(`Passed SEA smoke: ${basename(archive)}`);
  } finally {
    await rm(scratch, { force: true, recursive: true });
  }
}

const [, , archive, version, zig] = process.argv;
if (archive == null || version == null || process.argv.length > 5) {
  throw new Error(
    "Usage: node tools/smoke-sea.ts <archive> <version> [installed-zig-path]",
  );
}
await smoke(resolve(archive), version, zig == null ? undefined : resolve(zig));
