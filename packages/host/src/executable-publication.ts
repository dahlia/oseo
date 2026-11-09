import {
  chmod,
  copyFile,
  link,
  lstat,
  open,
  realpath,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Identity retained between destination inspection and publication. */
export interface ExecutableDestination {
  readonly path: string;
  readonly protectedPaths: readonly string[];
  readonly existing?: {
    readonly device: bigint;
    readonly inode: bigint;
  };
}

/** Filesystem publication boundary shared by both compiler hosts. */
export interface ExecutablePublisher {
  /** Validate the parent, replacement kind, and source graph before linking. */
  inspect(
    destination: string,
    protectedPaths: readonly string[],
  ): Promise<ExecutableDestination>;
  /** Publish unchanged linker bytes under ADR 0037's replacement rules. */
  publish(
    linkedPath: string,
    destination: ExecutableDestination,
  ): Promise<void>;
}

type PublicationErrorCode = "ENOENT" | "EPERM" | "ENOTSUP";

function errorCode(error: Error): PublicationErrorCode | undefined {
  if (!("code" in error)) return undefined;
  const code = error.code;
  return code === "ENOENT" || code === "EPERM" || code === "ENOTSUP"
    ? code
    : undefined;
}

function filesystemPath(path: string): string {
  return /^file:/iu.test(path) ? fileURLToPath(path) : path;
}

function refusal(path: string, reason: string): Error {
  return new Error(`Cannot publish '${path}': ${reason}; choose --output.`);
}

async function inspectDestination(
  destination: string,
  protectedPaths: readonly string[],
): Promise<ExecutableDestination> {
  const path = resolve(destination);
  if (!(await stat(dirname(path))).isDirectory()) {
    throw refusal(path, "the parent is not a directory");
  }
  let existing;
  try {
    existing = await lstat(path, { bigint: true });
  } catch (error) {
    if (!(error instanceof Error) || errorCode(error) !== "ENOENT") {
      throw error;
    }
  }
  if (existing == null) return { path, protectedPaths };
  if (!existing.isFile()) {
    throw refusal(path, "the destination is not a regular file");
  }
  const canonicalPath = await realpath(path);
  for (const protectedPath of protectedPaths) {
    let canonicalProtectedPath: string;
    try {
      // eslint-disable-next-line no-await-in-loop -- Ordered graph validation.
      canonicalProtectedPath = await realpath(filesystemPath(protectedPath));
    } catch (error) {
      if (!(error instanceof Error) || errorCode(error) !== "ENOENT") {
        throw error;
      }
      canonicalProtectedPath = resolve(filesystemPath(protectedPath));
    }
    if (canonicalPath === canonicalProtectedPath) {
      throw refusal(path, "the destination is a source in the build graph");
    }
  }
  const file = await open(path, "r");
  const bytes = new Uint8Array(4);
  try {
    await file.read(bytes, 0, 4, 0);
  } finally {
    await file.close();
  }
  const magic = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  if (
    ![
      "7f454c46", // ELF
      "feedface",
      "cefaedfe",
      "feedfacf",
      "cffaedfe", // Mach-O
      "cafebabe",
      "bebafeca",
      "cafebabf",
      "bfbafeca", // Universal Mach-O
    ].includes(magic)
  ) {
    throw refusal(path, "the destination is not an ELF or Mach-O file");
  }
  return {
    existing: { device: existing.dev, inode: existing.ino },
    path,
    protectedPaths,
  };
}

async function requireUnchangedDestination(
  destination: ExecutableDestination,
): Promise<void> {
  const current = await inspectDestination(
    destination.path,
    destination.protectedPaths,
  );
  if (
    current.existing?.device !== destination.existing?.device ||
    current.existing?.inode !== destination.existing?.inode
  ) {
    throw refusal(destination.path, "the destination changed during the build");
  }
}

/**
 * Create ADR 0037 publication operations using Node.js-compatible filesystem
 * APIs, supported unchanged by Node.js and Deno. CompilerHost stays narrow.
 */
export function createExecutablePublisher(): ExecutablePublisher {
  return createPublicationWithFiles();
}

interface PublicationFiles {
  readonly chmod: typeof chmod;
  readonly copyFile: typeof copyFile;
  readonly link: typeof link;
  readonly rename: typeof rename;
  readonly unlink: typeof unlink;
}

/** Internal fault-injection boundary for publication failure tests. */
export function createPublicationWithFiles(
  overrides: Partial<PublicationFiles> = {},
): ExecutablePublisher {
  const files = { chmod, copyFile, link, rename, unlink, ...overrides };
  return {
    inspect: inspectDestination,
    async publish(linkedPath, destination) {
      const temporaryPath = resolve(
        dirname(destination.path),
        `.${basename(destination.path)}.oseo-${randomUUID()}.tmp`,
      );
      let copied = false;
      let failure: unknown;
      try {
        const reserved = await open(temporaryPath, "wx");
        copied = true;
        await reserved.close();
        await files.copyFile(linkedPath, temporaryPath);
        await files.chmod(
          temporaryPath,
          (await stat(linkedPath)).mode & 0o7777,
        );
        await requireUnchangedDestination(destination);
        if (destination.existing != null) {
          await files.rename(temporaryPath, destination.path);
          copied = false;
        } else {
          try {
            await files.link(temporaryPath, destination.path);
          } catch (error) {
            const code = error instanceof Error ? errorCode(error) : undefined;
            if (code !== "EPERM" && code !== "ENOTSUP") throw error;
            await requireUnchangedDestination(destination);
            await files.rename(temporaryPath, destination.path);
            copied = false;
          }
        }
      } catch (error) {
        failure = error;
      }
      if (copied) {
        try {
          await files.unlink(temporaryPath);
        } catch (error) {
          if (failure != null) {
            throw new AggregateError(
              [failure, error],
              `${String(failure)}; temporary file cleanup failed: ${error}`,
              { cause: error },
            );
          }
          throw error;
        }
      }
      if (failure != null) throw failure;
    },
  };
}
