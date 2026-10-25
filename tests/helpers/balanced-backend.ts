import assert from "node:assert/strict";

import { cBackend } from "../../packages/backend-c/src/index.ts";

/** A successful native teardown must prove actual public context balance. */
export const balancedInteropBackend: typeof cBackend = {
  ...cBackend,
  emit(input) {
    const emitted = cBackend.emit(input);
    const teardown = "oseo_context_destroy(&context);";
    assert.ok(emitted.source.includes(teardown));
    return {
      ...emitted,
      source: emitted.source.replaceAll(
        teardown,
        "if (context.active_frame_slots != 0u || " +
          "context.call_depth != 0u || context.roots != NULL) abort();\n" +
          "        " +
          teardown,
      ),
    };
  },
};
