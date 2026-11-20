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
