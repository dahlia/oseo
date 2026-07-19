import type { RuntimeInput, RuntimeInputProvider } from "@oseo/compiler";

const runtimeInput: RuntimeInput = {
  abiVersion: "m5-4",
  assets: [
    {
      kind: "header",
      name: "oseo_runtime.h",
      url: new URL("../native/oseo_runtime.h", import.meta.url),
    },
    {
      kind: "header",
      name: "runtime_internal.h",
      url: new URL("../native/runtime_internal.h", import.meta.url),
    },
    {
      kind: "source",
      name: "runtime_core.c",
      url: new URL("../native/runtime_core.c", import.meta.url),
    },
    {
      kind: "source",
      name: "runtime_memory.c",
      url: new URL("../native/runtime_memory.c", import.meta.url),
    },
    {
      kind: "source",
      name: "runtime.c",
      url: new URL("../native/runtime.c", import.meta.url),
    },
  ],
};

/** Reviewed C runtime inputs kept separate from generated JavaScript. */
export const cRuntimeProvider: RuntimeInputProvider = {
  getRuntimeInput(): RuntimeInput {
    return runtimeInput;
  },
};
