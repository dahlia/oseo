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

import type { ClientRequest, IncomingMessage } from "node:http";
import { get } from "node:https";
import type { RequestOptions } from "node:https";
import type { TcpNetConnectOpts } from "node:net";
import { Readable } from "node:stream";

export type DownloadResponse = Pick<Response, "status" | "url" | "body">;

type DownloadOptions = RequestOptions &
  Pick<
    TcpNetConnectOpts,
    "autoSelectFamily" | "autoSelectFamilyAttemptTimeout"
  >;

type OpenDownload = (
  url: URL,
  options: DownloadOptions,
) => Promise<IncomingMessage>;

type StartDownload = (
  url: URL,
  options: DownloadOptions,
  receive: (response: IncomingMessage) => void,
) => ClientRequest;

const redirects = new Set([301, 302, 303, 307, 308]);

// Match the port policy of the Node 24.21.0 Fetch implementation.
// https://github.com/nodejs/node/blob/v24.21.0/deps/undici/src/lib/web/fetch/constants.js#L10-L20
const blockedPorts = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79,
  87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137,
  139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723,
  2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669,
  6679, 6697, 10080,
]);

/** Settle when Node delivers headers or the request ends without them. */
export function openDownload(
  url: URL,
  options: DownloadOptions,
  start: StartDownload = get,
): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    let receivedHeaders = false;
    const request = start(url, options, (response) => {
      receivedHeaders = true;
      resolve(response);
    });
    request.once("error", reject);
    request.once("close", () => {
      if (!receivedHeaders) {
        reject(new Error("Zig download closed before receiving headers."));
      }
    });
    request.once("upgrade", (_response, socket) => {
      socket.destroy();
      reject(new Error("Unexpected protocol upgrade during Zig download."));
    });
  });
}

/** Allow slow address attempts only for Zig's HTTPS requests. */
export async function downloadWithNode(
  input: string,
  signal: AbortSignal,
  open: OpenDownload = openDownload,
): Promise<DownloadResponse> {
  let url = new URL(input);
  for (let count = 0; ; count += 1) {
    signal.throwIfAborted();
    if (url.protocol !== "https:" || url.username || url.password) {
      throw new Error("Expected an HTTPS download URL without credentials.");
    }
    if (blockedPorts.has(Number(url.port))) {
      throw new Error("Zig download URL uses a blocked Fetch port.");
    }
    // oxlint-disable-next-line no-await-in-loop -- Follow each hop in order.
    const response = await open(url, {
      signal,
      autoSelectFamily: true,
      autoSelectFamilyAttemptTimeout: 1_000,
      headers: { "Accept-Encoding": "identity" },
    });
    if (signal.aborted) {
      response.destroy();
      signal.throwIfAborted();
    }
    const status = response.statusCode ?? 0;
    const location = response.headers.location;
    if (!redirects.has(status) || location == null) {
      // SAFETY: An IncomingMessage with no encoding set emits byte chunks.
      const body = Readable.toWeb(response, {
        strategy: {
          highWaterMark: response.readableHighWaterMark,
          size: (chunk: Uint8Array) => chunk.byteLength,
        },
      }) as Response["body"];
      return { status, body, url: url.href };
    }
    response.destroy();
    if (count >= 20) throw new Error("Too many Zig download redirects.");
    url = new URL(location, url);
  }
}
