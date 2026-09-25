export interface Fixture {
  /** Run the reference source through indirect eval as a global Script. */
  readonly globalScriptReference?: true;
  readonly name: string;
  readonly nonStrictScript?: boolean;
  readonly source: string;
  /**
   * Compile with the test262 host and link its agent programs; the
   * references run with the worker-based `$262.agent` prelude.
   */
  readonly test262Host?: true;
  readonly specialization?: {
    readonly genericCallsDisabled: number;
    readonly genericCallsEnabled: number;
    readonly hits: number;
    readonly misses: number;
    readonly overflowMisses: number;
  };
}
