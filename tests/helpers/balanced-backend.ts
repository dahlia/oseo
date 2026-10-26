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
