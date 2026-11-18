import { readFile } from "node:fs/promises";

// The SEA build substitutes these file-backed distribution adapters.
export { createNodeHost } from "@oseo/host";
export { cRuntimeProvider } from "@oseo/runtime-c";

/** Read the version stamped into the CLI package manifest. */
export async function readCliVersion(): Promise<string> {
  // SAFETY: The package checks validate the manifest version.
  const manifest = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as { readonly version: string };
  return manifest.version;
}
