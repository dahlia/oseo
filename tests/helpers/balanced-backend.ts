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

import assert from "node:assert/strict";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import type { EmittedNativeSource } from "../../packages/compiler/src/index.ts";

/** Transform the aggregate and every actual compiler input consistently. */
export function mapNativeSources(
  emitted: EmittedNativeSource,
  transform: (source: string) => string,
): EmittedNativeSource {
  const transformed = { ...emitted, source: transform(emitted.source) };
  if (emitted.compilationUnits == null) return transformed;
  return {
    ...transformed,
    compilationUnits: emitted.compilationUnits.map((unit) => ({
      ...unit,
      source: transform(unit.source),
    })),
  };
}

/** A successful native teardown must prove actual public context balance. */
export const balancedInteropBackend: typeof cBackend = {
  ...cBackend,
  emit(input) {
    const emitted = cBackend.emit(input);
    const teardown = "oseo_context_destroy(&context);";
    assert.ok(emitted.source.includes(teardown));
    return mapNativeSources(emitted, (source) =>
      source.replaceAll(
        teardown,
        "if (context.active_frame_slots != 0u || " +
          "context.call_depth != 0u || context.roots != NULL) abort();\n" +
          "        " +
          teardown,
      ),
    );
  },
};
