import type { Fixture } from "./fixture.ts";

/**
 * A fixed native fixture of the ECMAScript 2026 built-in units, run by
 * tests/es2026-builtins-native.test.ts.
 */
export interface Es2026Fixture extends Fixture {
  /**
   * Compare with Deno alone. The pinned Node.js does not expose the
   * feature, so Deno is the single reference host.
   */
  readonly denoOnly?: true;
  /** The enabled policy must also report at least one guard hit. */
  readonly guardHits?: true;
}
