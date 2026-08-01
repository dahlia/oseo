export interface Fixture {
  /** Run the reference source through indirect eval as a global Script. */
  readonly globalScriptReference?: true;
  readonly name: string;
  readonly nonStrictScript?: boolean;
  readonly source: string;
  readonly specialization?: {
    readonly genericCallsDisabled: number;
    readonly genericCallsEnabled: number;
    readonly hits: number;
    readonly misses: number;
    readonly overflowMisses: number;
  };
}
