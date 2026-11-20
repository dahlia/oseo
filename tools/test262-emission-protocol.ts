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

import type {
  EmittedScriptFragments,
  FragmentSourceMap,
} from "../packages/backend-c/src/index.ts";
import type {
  EmittedNativeSource,
  HarnessFragment,
  NativeSourceFile,
  ScriptFragment,
} from "../packages/compiler/src/index.ts";

/** Pure emission inputs, cloned without lossy JSON number conversion. */
export interface FragmentEmissionRequest {
  readonly id: number;
  readonly harness: HarnessFragment;
  readonly body: ScriptFragment;
  readonly mapping: FragmentSourceMap;
}

/** A backend exception remains a failed request rather than a retry. */
export type FragmentEmissionResponse =
  | { readonly id: number; readonly result: EmittedScriptFragments }
  | { readonly id: number; readonly error: Error };

function isSourceFile<T>(value: T): value is T & NativeSourceFile {
  return (
    value != null &&
    typeof value === "object" &&
    "source" in value &&
    typeof value.source === "string" &&
    "sourceName" in value &&
    typeof value.sourceName === "string"
  );
}

function isSource<T>(value: T): value is T & EmittedNativeSource {
  return (
    isSourceFile(value) &&
    value != null &&
    typeof value === "object" &&
    (!("compilationUnits" in value) ||
      value.compilationUnits === undefined ||
      (Array.isArray(value.compilationUnits) &&
        value.compilationUnits.every(isSourceFile)))
  );
}

/** Reject corrupted transport replies before touching a pending request. */
export function isFragmentEmissionResponse<T>(
  value: T,
): value is T & FragmentEmissionResponse {
  if (
    value == null ||
    typeof value !== "object" ||
    !("id" in value) ||
    !Number.isSafeInteger(value.id)
  ) {
    return false;
  }
  if ("error" in value) return value.error instanceof Error;
  if (!("result" in value)) return false;
  const result = value.result;
  return (
    result != null &&
    typeof result === "object" &&
    "harness" in result &&
    isSource(result.harness) &&
    "body" in result &&
    isSource(result.body) &&
    "launcher" in result &&
    isSource(result.launcher)
  );
}
