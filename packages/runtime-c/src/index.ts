import type { RuntimeInput, RuntimeInputProvider } from "@oseo/compiler";

const runtimeInput: RuntimeInput = {
  abiVersion: "m5-3",
  assets: [
    {
      kind: "header",
      name: "oseo_runtime.h",
      url: new URL("../native/oseo_runtime.h", import.meta.url),
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
