import type {
  CompilerHost,
  Diagnostic,
  ModuleLoader,
  ModuleResolver,
  ProcessObservation,
  ProcessRequest,
  SyntaxModuleSpecifier,
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
  cwd(): string;
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

function moduleDiagnostic(
  sourceId: string,
  specifier: SyntaxModuleSpecifier | undefined,
  message: string,
): Diagnostic {
  return {
    byteRange: specifier?.byteRange ?? { end: 0, start: 0 },
    code: "OSEO3001",
    message,
    range: specifier?.range ?? {
      end: { column: 1, line: 1 },
      start: { column: 1, line: 1 },
    },
    sourceId,
  };
}

function isUnreservedPathByte(value: number): boolean {
  return (
    (value >= 0x41 && value <= 0x5a) ||
    (value >= 0x61 && value <= 0x7a) ||
    (value >= 0x30 && value <= 0x39) ||
    value === 0x2d ||
    value === 0x2e ||
    value === 0x5f ||
    value === 0x7e
  );
}

function canonicalFileUrl(url: URL): string {
  const canonical = new URL(url.href);
  canonical.pathname = canonical.pathname.replace(/%[0-9a-f]{2}/giu, (part) => {
    const value = Number.parseInt(part.slice(1), 16);
    return isUnreservedPathByte(value)
      ? String.fromCharCode(value)
      : part.toUpperCase();
  });
  return canonical.href;
}

/** Produce the stable content identity recorded in a module graph. */
export function hashModuleSource(source: string): string {
  let hash = 0xcbf2_9ce4_8422_2325n;
  for (const byte of new TextEncoder().encode(source)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x0000_0100_0000_01b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

/** Load canonical file URLs through one explicit compiler host. */
export function createFileModuleLoader(host: CompilerHost): ModuleLoader {
  return {
    async load(canonicalId, referrer) {
      const diagnosticSourceId = referrer?.importerId ?? canonicalId;
      const diagnosticSpecifier = referrer?.specifier;
      let url: URL;
      try {
        url = new URL(canonicalId);
      } catch {
        return {
          diagnostics: [
            moduleDiagnostic(
              diagnosticSourceId,
              diagnosticSpecifier,
              "Invalid module URL.",
            ),
          ],
        };
      }
      if (url.protocol !== "file:") {
        return {
          diagnostics: [
            moduleDiagnostic(
              diagnosticSourceId,
              diagnosticSpecifier,
              "Only file module URLs are supported in M4.",
            ),
          ],
        };
      }
      try {
        const source = await host.readTextFile(url);
        return {
          diagnostics: [],
          source: {
            source,
            sourceHash: hashModuleSource(source),
            sourceId: url.href,
          },
        };
      } catch {
        return {
          diagnostics: [
            moduleDiagnostic(
              diagnosticSourceId,
              diagnosticSpecifier,
              "The module source could not be read.",
            ),
          ],
        };
      }
    },
  };
}

/** Resolve the relative file specifiers frozen by the M4 profile. */
export const fileModuleResolver: ModuleResolver = {
  resolve(importerId, specifier) {
    if (
      !specifier.value.startsWith("./") &&
      !specifier.value.startsWith("../")
    ) {
      return {
        diagnostics: [
          moduleDiagnostic(
            importerId,
            specifier,
            `Unsupported module specifier '${specifier.value}'.`,
          ),
        ],
      };
    }
    try {
      const importer = new URL(importerId);
      if (importer.protocol !== "file:") throw new Error("not a file URL");
      const resolved = new URL(specifier.value, importer);
      if (resolved.protocol !== "file:") throw new Error("not a file URL");
      return { canonicalId: canonicalFileUrl(resolved), diagnostics: [] };
    } catch {
      return {
        diagnostics: [
          moduleDiagnostic(
            importerId,
            specifier,
            `Cannot resolve module specifier '${specifier.value}'.`,
          ),
        ],
      };
    }
  },
};

/** Create the Node.js implementation of compiler host operations. */
export function createNodeHost(): CompilerHost {
  return {
    async canonicalizeFile(path: string): Promise<string> {
      try {
        const url = new URL(path);
        if (url.protocol === "file:") return canonicalFileUrl(url);
      } catch {
        // A filesystem path is canonicalized below.
      }
      const [{ resolve }, { pathToFileURL }] = await Promise.all([
        import("node:path"),
        import("node:url"),
      ]);
      return canonicalFileUrl(pathToFileURL(resolve(path)));
    },
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
    canonicalizeFile(path: string): Promise<string> {
      try {
        const url = new URL(path);
        if (url.protocol === "file:") {
          return Promise.resolve(canonicalFileUrl(url));
        }
      } catch {
        // A filesystem path is canonicalized below.
      }
      const basePath = path.startsWith("/")
        ? path
        : `${runtime.cwd().replace(/\/$/u, "")}/${path}`;
      const url = new URL("file:///");
      url.pathname = basePath.replaceAll("%", "%25");
      return Promise.resolve(canonicalFileUrl(url));
    },
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
