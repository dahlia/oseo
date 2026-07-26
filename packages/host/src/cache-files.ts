interface DenoExistingTextFileWriter {
  writeTextFile(
    path: string,
    contents: string,
    options: { readonly create: false },
  ): Promise<void>;
}

const cacheLockRenameRetryMilliseconds = 5;

function isTransientDirectoryRenameError(
  error: unknown,
  retryPermissionErrors: boolean,
): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    ((retryPermissionErrors &&
      (error.code === "EACCES" || error.code === "EPERM")) ||
      error.code === "EBUSY" ||
      error.code === "ENOTEMPTY")
  );
}

interface CacheLockDirectoryRenameOptions {
  readonly deadlineMilliseconds: number;
  readonly retryPermissionErrors: boolean;
}

/**
 * Rename a claimed cache-lock directory across host sharing semantics.
 *
 * Windows can reject a directory rename while another waiter briefly
 * enumerates it. The claimed state file remains the ownership fence while
 * retrying, so no other caller can publish through the same lease.
 */
export async function renameClaimedCacheLockDirectory(
  rename: (fromPath: string, toPath: string) => Promise<void>,
  fromPath: string,
  toPath: string,
  options: CacheLockDirectoryRenameOptions,
): Promise<void> {
  /* eslint-disable no-await-in-loop -- Rename attempts retain one claim. */
  while (true) {
    try {
      await rename(fromPath, toPath);
      return;
    } catch (error) {
      if (
        !isTransientDirectoryRenameError(
          error,
          options.retryPermissionErrors,
        ) ||
        Date.now() >= options.deadlineMilliseconds
      ) {
        throw error;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, cacheLockRenameRetryMilliseconds),
      );
    }
  }
  /* eslint-enable no-await-in-loop */
}

/**
 * Overwrite an existing Node.js cache state file without recreating it.
 *
 * A missing path means that another process replaced the cache lock directory,
 * so recreating the state file would let a stale owner join the replacement.
 */
export async function overwriteExistingNodeTextFile(
  path: string,
  contents: string,
): Promise<void> {
  const { open } = await import("node:fs/promises");
  const file = await open(path, "r+");
  try {
    await file.truncate(0);
    await file.writeFile(contents);
  } finally {
    await file.close();
  }
}

/**
 * Overwrite an existing Deno cache state file without recreating it.
 *
 * This mirrors the Node.js claim rule while keeping Deno filesystem behavior
 * behind the host adapter's narrow runtime interface.
 */
export async function overwriteExistingDenoTextFile(
  runtime: DenoExistingTextFileWriter,
  path: string,
  contents: string,
): Promise<void> {
  await runtime.writeTextFile(path, contents, { create: false });
}
