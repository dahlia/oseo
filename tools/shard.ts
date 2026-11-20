/*
 * Oseo, an ahead-of-time compiler for JavaScript and TypeScript.
 * Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { parseArgs } from "node:util";

function includePropertiesWhen<const Properties extends object>(
  properties: () => Properties | undefined,
): Properties | { [Key in keyof Properties]?: never } {
  return properties() ?? {};
}

/** A one-based shard index and the total number of shards. */
export interface TestShard {
  readonly index: number;
  readonly total: number;
}

/** Options accepted by test runners that support deterministic sharding. */
export interface TestShardArguments {
  readonly help: boolean;
  readonly shard?: TestShard;
  readonly update: boolean;
}

/** Controls runner-specific arguments layered onto the shared shard flags. */
export interface TestShardArgumentOptions {
  readonly allowUpdate?: boolean;
}

function parseTestShard(value: string): TestShard {
  const match = /^(?<index>[1-9]\d*)\/(?<total>[1-9]\d*)$/u.exec(value);
  const index = Number(match?.groups?.index);
  const total = Number(match?.groups?.total);
  if (
    match == null ||
    !Number.isSafeInteger(index) ||
    !Number.isSafeInteger(total) ||
    index > total
  ) {
    throw new Error(
      "shard must have the form INDEX/TOTAL with 1 <= INDEX <= TOTAL.",
    );
  }
  return { index, total };
}

/** Parse shared test-runner CLI arguments with Node's strict parser. */
export function parseTestShardArguments(
  args: readonly string[],
  options: TestShardArgumentOptions = {},
): TestShardArguments {
  const parsed = parseArgs({
    allowPositionals: false,
    args,
    options: {
      help: { short: "h", type: "boolean" },
      shard: { type: "string" },
      update: { type: "boolean" },
    },
    strict: true,
    tokens: true,
  });
  if (parsed.values.update === true && options.allowUpdate !== true) {
    throw new Error("Unknown option '--update'.");
  }
  const shardTokens = parsed.tokens.filter(
    (token) => token.kind === "option" && token.name === "shard",
  );
  if (shardTokens.length > 1) {
    throw new Error("shard may be specified only once.");
  }
  const shard =
    parsed.values.shard == null
      ? undefined
      : parseTestShard(parsed.values.shard);
  if (parsed.values.update === true && shard != null) {
    throw new Error("update cannot be combined with shard.");
  }
  return {
    help: parsed.values.help === true,
    ...includePropertiesWhen(() => {
      if (shard == null) return undefined;
      return { shard };
    }),
    update: parsed.values.update === true,
  };
}

/** Select one stable round-robin partition without copying unsharded input. */
export function selectTestShard<T>(
  values: readonly T[],
  shard?: TestShard,
): readonly T[] {
  if (shard == null) return values;
  return values.filter((_value, position) =>
    isTestShardPosition(position, shard),
  );
}

/** Return whether a zero-based work position belongs to the selected shard. */
export function isTestShardPosition(
  position: number,
  shard?: TestShard,
): boolean {
  return shard == null || position % shard.total === shard.index - 1;
}
