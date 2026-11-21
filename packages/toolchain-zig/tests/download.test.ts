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
import { Buffer } from "node:buffer";
import { getEventListeners, once } from "node:events";
import { createServer, get, IncomingMessage } from "node:http";
import {
  createServer as createTcpServer,
  getDefaultAutoSelectFamily,
  getDefaultAutoSelectFamilyAttemptTimeout,
  Socket,
} from "node:net";
import process from "node:process";
import test from "node:test";
import { downloadWithNode, openDownload } from "../src/download.ts";

const origin = "https://mirror.example/zig/";

function reply(status: number, location?: string): IncomingMessage {
  const response = new IncomingMessage(new Socket());
  response.statusCode = status;
  if (location !== undefined) response.headers.location = location;
  return response;
}

test("Zig applies the connection policy to every HTTPS hop", async () => {
  const signal = new AbortController().signal;
  const first = reply(308, "../archive");
  const last = reply(200);
  last.push(Buffer.from("archive bytes"));
  last.push(null);
  const seen: string[] = [];
  const input = "https://mirror.example:8443/zig/";
  const response = await downloadWithNode(
    input,
    signal,
    async (url, options) => {
      seen.push(url.href);
      assert.equal(options.signal, signal);
      assert.equal(options.autoSelectFamily, true);
      assert.equal(options.autoSelectFamilyAttemptTimeout, 1_000);
      assert.equal(options.rejectUnauthorized, undefined);
      return seen.length === 1 ? first : last;
    },
  );
  assert.equal(first.destroyed, true);
  assert.deepEqual(seen, [input, "https://mirror.example:8443/archive"]);
  assert.equal(response.url, seen[1]);
  assert.equal(response.status, 200);
  assert.equal(await new Response(response.body).text(), "archive bytes");
});

for (const invalid of [
  "http://mirror.example/zig/",
  "https://name:password@mirror.example/zig/",
]) {
  const protocol = new URL(invalid).protocol;
  test(`Zig closes a forbidden ${protocol} redirect`, async () => {
    const first = reply(302, invalid);
    let requests = 0;
    await assert.rejects(
      downloadWithNode(origin, new AbortController().signal, async () => {
        requests++;
        return first;
      }),
      /Expected an HTTPS download URL without credentials/u,
    );
    assert.equal(requests, 1);
    assert.equal(first.destroyed, true);
  });
}

test("Zig blocks Fetch ports before opening an HTTPS request", async () => {
  const signal = new AbortController().signal;
  await assert.rejects(
    downloadWithNode("https://mirror.example:00022/zig/", signal, async () =>
      assert.fail("Blocked initial URL reached the transport"),
    ),
    /blocked Fetch port/u,
  );

  const first = reply(302, "https://mirror.example:10080/archive");
  let requests = 0;
  await assert.rejects(
    downloadWithNode(origin, signal, async () => {
      assert.equal(++requests, 1, "Blocked redirect reached the transport");
      return first;
    }),
    /blocked Fetch port/u,
  );
  assert.equal(requests, 1);
  assert.equal(first.destroyed, true);
});

test("Zig destroys every response in a redirect loop", async () => {
  const responses: IncomingMessage[] = [];
  await assert.rejects(
    downloadWithNode(origin, new AbortController().signal, async () => {
      const response = reply(302, ".");
      responses.push(response);
      return response;
    }),
    /Too many Zig download redirects/u,
  );
  assert.equal(responses.length, 21);
  assert.ok(responses.every((response) => response.destroyed));
});

test("Zig honors abort before and during headers", async () => {
  const controller = new AbortController();
  await assert.rejects(
    downloadWithNode(origin, controller.signal, async (_url, options) => {
      assert.equal(options.signal, controller.signal);
      controller.abort();
      options.signal!.throwIfAborted();
      return assert.fail("Aborted before headers");
    }),
    { name: "AbortError" },
  );
  await assert.rejects(
    downloadWithNode(origin, controller.signal, async () =>
      assert.fail("Aborted request reached the transport"),
    ),
    { name: "AbortError" },
  );
});

test("Zig propagates body errors and closes cancelled responses", async () => {
  const controller = new AbortController();
  const broken = reply(200);
  const failed = await downloadWithNode(
    origin,
    controller.signal,
    async () => broken,
  );
  const reader = failed.body!.getReader();
  const read = reader.read();
  broken.destroy(new Error("interrupted body"));
  await assert.rejects(read, /interrupted body/u);
  reader.releaseLock();
  assert.equal(broken.destroyed, true);

  const opened = reply(200);
  const live = await downloadWithNode(
    origin,
    controller.signal,
    async () => opened,
  );
  await live.body!.cancel();
  assert.equal(opened.destroyed, true);
});

test(
  "Zig abort closes the active Node HTTP stream",
  {
    skip: process.versions.deno != null,
  },
  async (t) => {
    const defaults = [
      getDefaultAutoSelectFamily(),
      getDefaultAutoSelectFamilyAttemptTimeout(),
    ];
    const arrived = Promise.withResolvers<void>();
    const server = createServer((request, response) => {
      if (request.url === "/headers") arrived.resolve();
      else response.write("start");
    });
    t.after(() => {
      server.closeAllConnections();
      return new Promise<void>((done) => server.close(() => done()));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address instanceof Object && "port" in address);
    const closed: Promise<void>[] = [];
    const open: NonNullable<Parameters<typeof downloadWithNode>[2]> = (
      url,
      options,
    ) =>
      openDownload(url, options, (remote, opts, receive) => {
        // HTTPS and HTTP use the same Node ClientRequest abort handling.
        const local = new URL(
          remote.pathname,
          `http://127.0.0.1:${address.port}`,
        );
        const request = get(local, opts, receive);
        closed.push(new Promise((done) => request.once("close", done)));
        return request;
      });

    const headers = new AbortController();
    const waiting = assert.rejects(
      downloadWithNode(origin + "../headers", headers.signal, open),
      { code: "ABORT_ERR" },
    );
    await arrived.promise;
    headers.abort();
    await waiting;
    await closed[0];
    assert.equal(getEventListeners(headers.signal, "abort").length, 0);

    const streaming = new AbortController();
    const response = await downloadWithNode(origin, streaming.signal, open);
    const reader = response.body!.getReader();
    try {
      assert.equal(
        Buffer.from((await reader.read()).value!).toString(),
        "start",
      );
      const interrupted = assert.rejects(reader.read());
      streaming.abort();
      await interrupted;
    } finally {
      reader.releaseLock();
    }
    await closed[1];
    assert.equal(getEventListeners(streaming.signal, "abort").length, 0);
    assert.deepEqual(
      [
        getDefaultAutoSelectFamily(),
        getDefaultAutoSelectFamilyAttemptTimeout(),
      ],
      defaults,
    );
  },
);

test(
  "Zig rejects a Node protocol upgrade and closes its socket",
  { skip: process.versions.deno != null, timeout: 5_000 },
  async (t) => {
    const closed = Promise.withResolvers<void>();
    const sockets: Socket[] = [];
    const server = createTcpServer((socket) => {
      sockets.push(socket);
      socket.once("close", () => closed.resolve());
      socket.once("data", () => {
        socket.write(
          "HTTP/1.1 101 Switching Protocols\r\n" +
            "Connection: Upgrade\r\nUpgrade: example\r\n\r\n",
        );
      });
    });
    t.after(() => {
      for (const socket of sockets) socket.destroy();
      return new Promise<void>((done) => server.close(() => done()));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address instanceof Object && "port" in address);
    await assert.rejects(
      openDownload(new URL(`http://127.0.0.1:${address.port}`), {}, get),
      /Unexpected protocol upgrade/u,
    );
    await closed.promise;
  },
);

test(
  "Zig rejects a Node request that closes without headers or error",
  { skip: process.versions.deno != null, timeout: 5_000 },
  async () => {
    const local = new URL("http://127.0.0.1/");
    await assert.rejects(
      openDownload(local, {}, (url, options, receive) => {
        const request = get(
          url,
          {
            ...options,
            createConnection: () => new Socket(),
          },
          receive,
        );
        // Exercise the close-only fallback before Node can emit a reset error.
        queueMicrotask(() => {
          request.emit("close");
          request.destroy();
        });
        return request;
      }),
      /closed before receiving headers/u,
    );
  },
);
