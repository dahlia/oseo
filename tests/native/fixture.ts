export interface Fixture {
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
