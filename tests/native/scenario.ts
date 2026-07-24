import type { TargetDescription } from "../../packages/compiler/src/index.ts";
import { createNodeHost } from "../../packages/host/src/index.ts";

export interface NativeScenarioContext {
  readonly host: ReturnType<typeof createNodeHost>;
  readonly nativeTarget: TargetDescription;
  readonly root: string;
  readonly zigNativeTarget: string;
}
