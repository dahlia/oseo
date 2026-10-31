import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

/** Complete pinned sources reserved by the native-frame prerequisite. */
export const unicodeClassSubjects = [
  {
    name: "start-unicode-10.0.0-class-escaped.js",
    sha256: "fa3017eb9c86dc0b02f9416cb5555195dc6696ca4bfd60df67b12776fb8829d6",
  },
  {
    name: "start-unicode-10.0.0-class.js",
    sha256: "dcf082bde41a400573a2077cee17b962616259c1e9852a540c331a33de642150",
  },
  {
    name: "start-unicode-13.0.0-class-escaped.js",
    sha256: "753228c671462f3a371eb6953bbf14389d234a1e143ca7f242d11d2ec75b693c",
  },
  {
    name: "start-unicode-13.0.0-class.js",
    sha256: "eec6ec5213a9fb67cc70105b09c8a373579ecc12ec75fc2a4696f7473a490e02",
  },
  {
    name: "start-unicode-5.2.0-class-escaped.js",
    sha256: "aa27f25380750b21278e29e988c538ae048674358f82b7099d19cbb0271afffe",
  },
  {
    name: "start-unicode-5.2.0-class.js",
    sha256: "a2e7a5699c5e8ef31cf62c28e8530ca3d8fd4e0bda4cbe06bb1ebea38a2e4f21",
  },
  {
    name: "start-unicode-8.0.0-class-escaped.js",
    sha256: "3da88aec50b2f145805414d7da7720524b19aebd1b07d088c9040a658637fb60",
  },
  {
    name: "start-unicode-8.0.0-class.js",
    sha256: "e8f2f11b19fd531a833c6de3dba0329815ce4aced04b3262d621618d5fb6b664",
  },
  {
    name: "start-unicode-9.0.0-class-escaped.js",
    sha256: "c14f5b40c3bb0005554031f06865133489d696f953bca77b3540eac7b343ca40",
  },
  {
    name: "start-unicode-9.0.0-class.js",
    sha256: "1b734884ab2dd857213e40326c3f8fbc7846c3783b8c2dabb1ae535c19a85c87",
  },
] as const;

/** Verify upstream bytes before compiling any strictness or policy variant. */
export async function loadUnicodeClassSource(
  subject: (typeof unicodeClassSubjects)[number],
): Promise<string> {
  const source = await readFile(
    new URL(
      import.meta.resolve(`test262/test/language/identifiers/${subject.name}`),
    ),
    "utf8",
  );
  assert.equal(
    createHash("sha256").update(source).digest("hex"),
    subject.sha256,
    "The complete pinned Unicode class source must remain unchanged.",
  );
  return source;
}
