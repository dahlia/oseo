import assert from "node:assert/strict";
import test from "node:test";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import { createPublicationWithFiles } from "../src/executable-publication.ts";

import { createExecutablePublisher } from "../src/index.ts";

const elf = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 1, 2, 3]);
const macho = Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 4, 5, 6]);

async function fixture(
  body: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "oseo-publication-"));
  try {
    await body(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

test("publishes unchanged bytes and linker permission bits", async () => {
  await fixture(async (directory) => {
    const publisher = createExecutablePublisher();
    const linked = join(directory, "linked");
    const output = join(directory, "output");
    await writeFile(linked, elf);
    await chmod(linked, 0o751);
    const destination = await publisher.inspect(output, [linked]);
    await publisher.publish(linked, destination);
    assert.deepEqual(await readFile(output), elf);
    assert.equal((await lstat(output)).mode & 0o777, 0o751);
    assert.deepEqual((await readdir(directory)).toSorted(), [
      "linked",
      "output",
    ]);
  });
});

test("replaces ELF and Mach-O with a new inode", async () => {
  await fixture(async (directory) => {
    const publisher = createExecutablePublisher();
    const linked = join(directory, "linked");
    const output = join(directory, "output");
    await writeFile(linked, macho);
    for (const bytes of [elf, macho]) {
      // eslint-disable-next-line no-await-in-loop -- Replace in order.
      await writeFile(output, bytes);
      // eslint-disable-next-line no-await-in-loop
      const before = await lstat(output);
      // eslint-disable-next-line no-await-in-loop
      const destination = await publisher.inspect(output, []);
      // eslint-disable-next-line no-await-in-loop
      await publisher.publish(linked, destination);
      // eslint-disable-next-line no-await-in-loop
      assert.notEqual((await lstat(output)).ino, before.ino);
      // eslint-disable-next-line no-await-in-loop
      assert.deepEqual(await readFile(output), macho);
    }
  });
});

test("refuses non-executables and graph sources", async () => {
  await fixture(async (directory) => {
    const publisher = createExecutablePublisher();
    const source = join(directory, "source.ts");
    const script = join(directory, "script");
    const folder = join(directory, "folder");
    const alias = join(directory, "alias");
    await writeFile(source, elf);
    await writeFile(script, "#!/bin/sh\n");
    await mkdir(folder);
    await symlink(source, alias);
    await assert.rejects(
      publisher.inspect(script, []),
      /not an ELF or Mach-O/u,
    );
    await assert.rejects(publisher.inspect(folder, []), /not a regular file/u);
    await assert.rejects(publisher.inspect(alias, []), /not a regular file/u);
    await assert.rejects(publisher.inspect(source, [alias]), /build graph/u);
    await assert.rejects(publisher.inspect(join(folder, "missing", "out"), []));
    await assert.rejects(publisher.inspect(join(script, "out"), []));
  });
});

test("failed copies preserve the destination", async () => {
  await fixture(async (directory) => {
    const publisher = createExecutablePublisher();
    const output = join(directory, "output");
    await writeFile(output, elf);
    const destination = await publisher.inspect(output, []);
    await assert.rejects(
      publisher.publish(join(directory, "missing-linked"), destination),
    );
    assert.deepEqual(await readFile(output), elf);
    assert.deepEqual(await readdir(directory), ["output"]);
  });
});

test("refuses a file appearing during build and removes staging", async () => {
  await fixture(async (directory) => {
    const publisher = createExecutablePublisher();
    const linked = join(directory, "linked");
    const output = join(directory, "output");
    await writeFile(linked, elf);
    const destination = await publisher.inspect(output, []);
    await writeFile(output, macho);
    await assert.rejects(publisher.publish(linked, destination), /changed/u);
    assert.deepEqual(await readFile(output), macho);
    assert.deepEqual((await readdir(directory)).toSorted(), [
      "linked",
      "output",
    ]);
  });
});

test("refuses replaced or changed destinations", async () => {
  await fixture(async (directory) => {
    const publisher = createExecutablePublisher();
    const linked = join(directory, "linked");
    const output = join(directory, "output");
    await writeFile(linked, macho);
    await writeFile(output, elf);
    const replacement = join(directory, "replacement");
    await writeFile(replacement, macho);
    const destination = await publisher.inspect(output, []);
    await unlink(output);
    await assert.rejects(publisher.publish(linked, destination), /changed/u);
    await rename(replacement, output);
    await assert.rejects(publisher.publish(linked, destination), /changed/u);
    const updated = await publisher.inspect(output, []);
    await writeFile(output, "ordinary text");
    await assert.rejects(publisher.publish(linked, updated), /not an ELF/u);
    assert.equal(await readFile(output, "utf8"), "ordinary text");
    await unlink(output);
    await symlink(linked, output);
    await assert.rejects(publisher.publish(linked, updated), /not a regular/u);
    assert.deepEqual((await readdir(directory)).toSorted(), [
      "linked",
      "output",
    ]);
  });
});

test("concurrent creation publishes one complete file", async () => {
  await fixture(async (directory) => {
    const publisher = createExecutablePublisher();
    const linked = join(directory, "linked");
    const output = join(directory, "output");
    await writeFile(linked, elf);
    const destination = await publisher.inspect(output, []);
    const results = await Promise.allSettled([
      publisher.publish(linked, destination),
      publisher.publish(linked, destination),
    ]);
    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.deepEqual(await readFile(output), elf);
    assert.deepEqual((await readdir(directory)).toSorted(), [
      "linked",
      "output",
    ]);
  });
});

test("hard-link refusal falls back only for EPERM or ENOTSUP", async () => {
  for (const code of ["EPERM", "ENOTSUP", "EIO"]) {
    // eslint-disable-next-line no-await-in-loop -- Check each error code.
    await fixture(async (directory) => {
      const linked = join(directory, "linked");
      const output = join(directory, "output");
      await writeFile(linked, elf);
      const publisher = createPublicationWithFiles({
        link() {
          throw Object.assign(new Error(code), { code });
        },
      });
      const destination = await publisher.inspect(output, []);
      if (code === "EIO") {
        await assert.rejects(publisher.publish(linked, destination), /EIO/u);
        assert.deepEqual(await readdir(directory), ["linked"]);
      } else {
        await publisher.publish(linked, destination);
        assert.deepEqual(await readFile(output), elf);
      }
    });
  }
});

test("fallback rechecks the destination after link failure", async () => {
  await fixture(async (directory) => {
    const linked = join(directory, "linked");
    const output = join(directory, "output");
    await writeFile(linked, elf);
    const publisher = createPublicationWithFiles({
      async link() {
        await writeFile(output, macho);
        throw Object.assign(new Error("no hard links"), { code: "EPERM" });
      },
    });
    const destination = await publisher.inspect(output, []);
    await assert.rejects(publisher.publish(linked, destination), /changed/u);
    assert.deepEqual(await readFile(output), macho);
    assert.deepEqual((await readdir(directory)).toSorted(), [
      "linked",
      "output",
    ]);
  });
});

test("copy, mode, and rename failures preserve output", async () => {
  for (const operation of ["copy", "mode", "rename"] as const) {
    // eslint-disable-next-line no-await-in-loop -- Check each failure.
    await fixture(async (directory) => {
      const linked = join(directory, "linked");
      const output = join(directory, "output");
      await writeFile(linked, macho);
      await writeFile(output, elf);
      const failures = {
        copy: {
          async copyFile(
            _from: import("node:fs").PathLike,
            to: import("node:fs").PathLike,
          ) {
            await writeFile(to, "partial");
            throw new Error("copy failure");
          },
        },
        mode: {
          chmod() {
            throw new Error("mode failure");
          },
        },
        rename: {
          rename() {
            throw new Error("rename failure");
          },
        },
      };
      const publisher = createPublicationWithFiles(failures[operation]);
      const destination = await publisher.inspect(output, []);
      await assert.rejects(publisher.publish(linked, destination), /failure/u);
      assert.deepEqual(await readFile(output), elf);
      assert.deepEqual((await readdir(directory)).toSorted(), [
        "linked",
        "output",
      ]);
    });
  }
});

test("cleanup failure follows the original publication failure", async () => {
  await fixture(async (directory) => {
    const linked = join(directory, "linked");
    const output = join(directory, "output");
    await writeFile(linked, macho);
    await writeFile(output, elf);
    const publisher = createPublicationWithFiles({
      chmod() {
        throw new Error("original mode failure");
      },
      unlink() {
        throw new Error("cleanup failure");
      },
    });
    const destination = await publisher.inspect(output, []);
    await assert.rejects(publisher.publish(linked, destination), {
      name: "AggregateError",
      message: /original mode failure.*cleanup failure/u,
    });
    assert.deepEqual(await readFile(output), elf);
  });
});

test("destination paths keep a leading file: literal", async () => {
  const path = `file:oseo-${randomUUID()}`;
  const destination = await createExecutablePublisher().inspect(path, []);
  assert.equal(destination.path, resolve(path));
});

test("protects file URLs with case-insensitive schemes", async () => {
  await fixture(async (directory) => {
    const publisher = createExecutablePublisher();
    const source = join(directory, "source name.ts");
    await writeFile(source, elf);
    for (const scheme of ["file:", "FILE:", "FiLe:"]) {
      const protectedUrl = pathToFileURL(source).href.replace("file:", scheme);
      // eslint-disable-next-line no-await-in-loop -- Verify each URL spelling.
      await assert.rejects(
        publisher.inspect(source, [protectedUrl]),
        /build graph/u,
      );
    }
    assert.deepEqual(await readFile(source), elf);
    assert.deepEqual(await readdir(directory), ["source name.ts"]);
  });
});
