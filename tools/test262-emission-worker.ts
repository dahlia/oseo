import { parentPort } from "node:worker_threads";
import { emitScriptFragments } from "../packages/backend-c/src/index.ts";
import type {
  FragmentEmissionRequest,
  FragmentEmissionResponse,
} from "./test262-emission-protocol.ts";

if (parentPort == null) {
  throw new Error("Fragment emission requires a worker parent port.");
}
const port = parentPort;
port.on("message", (request: FragmentEmissionRequest) => {
  let response: FragmentEmissionResponse;
  try {
    response = {
      id: request.id,
      result: emitScriptFragments(
        request.harness,
        request.body,
        request.mapping,
      ),
    };
  } catch (error) {
    response = {
      id: request.id,
      error:
        error instanceof Error
          ? error
          : new Error("Fragment emission failed.", { cause: error }),
    };
  }
  port.postMessage(response);
});
