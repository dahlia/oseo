import type {
  CompilerHost,
  ProcessObservation,
  ProcessRequest,
} from "@oseo/compiler";

interface DenoCommandOutput {
  readonly code: number;
  readonly stderr: Uint8Array;
  readonly stdout: Uint8Array;
}

interface DenoCommandInstance {
  output(): Promise<DenoCommandOutput>;
}

interface DenoCommandOptions {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly stderr: "piped";
  readonly stdout: "piped";
}

interface DenoCommandConstructor {
  new (command: string, options: DenoCommandOptions): DenoCommandInstance;
}

interface DenoRuntime {
  readonly Command: DenoCommandConstructor;
  makeTempDir(options: { readonly prefix: string }): Promise<string>;
  readTextFile(path: string | URL): Promise<string>;
  remove(path: string, options: { readonly recursive: boolean }): Promise<void>;
  writeTextFile(path: string, contents: string): Promise<void>;
}

function denoRuntime(): DenoRuntime {
  const runtime = (globalThis as unknown as { readonly Deno?: DenoRuntime })
    .Deno;
  if (runtime == null) throw new Error("Deno host is unavailable.");
  return runtime;
}

function remoteUrl(path: string | URL): URL | undefined {
  let url: URL;
  try {
    url = path instanceof URL ? path : new URL(path);
  } catch {
    return undefined;
  }
  return url.protocol === "http:" || url.protocol === "https:"
    ? url
    : undefined;
}

/** Create the Node.js implementation of compiler host operations. */
export function createNodeHost(): CompilerHost {
  return {
    async makeTemporaryDirectory(prefix: string): Promise<string> {
      const [{ mkdtemp }, { tmpdir }, { join }] = await Promise.all([
        import("node:fs/promises"),
        import("node:os"),
        import("node:path"),
      ]);
      return await mkdtemp(join(tmpdir(), prefix));
    },
    async readTextFile(path: string | URL): Promise<string> {
      const { readFile } = await import("node:fs/promises");
      return await readFile(path, "utf8");
    },
    async remove(path: string): Promise<void> {
      const { rm } = await import("node:fs/promises");
      await rm(path, { force: true, recursive: true });
    },
    async run(request: ProcessRequest): Promise<ProcessObservation> {
      const { spawn } = await import("node:child_process");
      return await new Promise((resolve, reject) => {
        const child = spawn(request.command, [...request.args], {
          cwd: request.cwd,
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
        });
        const stdout: Uint8Array[] = [];
        const stderr: Uint8Array[] = [];
        child.stdout.on("data", (chunk: Uint8Array) => stdout.push(chunk));
        child.stderr.on("data", (chunk: Uint8Array) => stderr.push(chunk));
        child.on("error", reject);
        child.on("close", (code) => {
          resolve({
            exitStatus: code ?? 1,
            stderr: Buffer.concat(stderr).toString("utf8"),
            stdout: Buffer.concat(stdout).toString("utf8"),
          });
        });
      });
    },
    async writeTextFile(path: string, contents: string): Promise<void> {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(path, contents);
    },
  };
}

/** Create the Deno implementation of compiler host operations. */
export function createDenoHost(): CompilerHost {
  const runtime = denoRuntime();
  const decoder = new TextDecoder();
  return {
    async makeTemporaryDirectory(prefix: string): Promise<string> {
      return await runtime.makeTempDir({ prefix });
    },
    async readTextFile(path: string | URL): Promise<string> {
      const url = remoteUrl(path);
      if (url != null) {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch ${url.href}: ` +
              `${response.status} ${response.statusText}`,
          );
        }
        return await response.text();
      }
      return await runtime.readTextFile(path);
    },
    async remove(path: string): Promise<void> {
      await runtime.remove(path, { recursive: true });
    },
    async run(request: ProcessRequest): Promise<ProcessObservation> {
      const command = new runtime.Command(request.command, {
        args: request.args,
        cwd: request.cwd,
        stderr: "piped",
        stdout: "piped",
      });
      const output = await command.output();
      return {
        exitStatus: output.code,
        stderr: decoder.decode(output.stderr),
        stdout: decoder.decode(output.stdout),
      };
    },
    async writeTextFile(path: string, contents: string): Promise<void> {
      await runtime.writeTextFile(path, contents);
    },
  };
}
