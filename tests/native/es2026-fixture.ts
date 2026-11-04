import type { Fixture } from "./fixture.ts";

/**
 * A fixed native fixture of the ECMAScript 2026 built-in units, run by
 * tests/es2026-builtins-native.test.ts.
 */
export interface Es2026Fixture extends Fixture {
  /**
   * Compare with Deno alone. The pinned Node.js does not expose the
   * feature, or diverges from the specification in what the fixture
   * observes, so Deno is the single reference host.
   */
  readonly denoOnly?: true;
  /** The enabled policy must also report at least one guard hit. */
  readonly guardHits?: true;
  /**
   * Source that installs an independent model of the feature before the
   * fixture runs on both reference hosts. It replaces differential
   * evidence for a feature that neither pinned host exposes, and the
   * native run never sees it.
   */
  readonly referenceModel?: string;
}
