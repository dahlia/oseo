/* eslint-disable no-await-in-loop -- Corpus reads stay sequential. */

/**
 * Compare the pinned property tables against an independent oracle.
 *
 * The upstream Test262 corpus carries one generated file per Unicode property
 * escape, each listing the exact code points that property matches. Those
 * files are produced from Unicode 17.0.0 by a third-party generator that
 * shares no code with Oseo, so agreeing with all of them is evidence that the
 * tables describe the pinned release rather than that the generator agrees
 * with itself. The files are read as data: nothing here promotes them into
 * the reviewed Test262 subset or its result manifest.
 */

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  binaryPropertySet,
  canonicalPropertyName,
  canonicalPropertyValue,
  generalCategorySet,
  maxCodePoint,
  scriptExtensionsSet,
  scriptSet,
  unicodeVersion,
} from "../packages/unicode/src/index.ts";
import {
  codePointSetFromRanges,
  type CodePointRange,
  type CodePointSet,
} from "../packages/unicode/src/set.ts";

const corpusRoot = join(
  dirname(fileURLToPath(import.meta.resolve("test262/package.json"))),
  "test/built-ins/RegExp/property-escapes/generated",
);

function oracleSet(source: string, path: string): CodePointSet {
  const start = source.indexOf("const matchSymbols = buildString({");
  const end = source.indexOf("});", start);
  assert.ok(start >= 0 && end > start, `${path} has no match set`);
  const block = source.slice(start, end);
  const ranges: CodePointRange[] = [];
  const lone = /loneCodePoints:\s*\[([^\]]*)\]/u.exec(block);
  if (lone != null) {
    for (const match of (lone[1] ?? "").matchAll(/0x([0-9A-Fa-f]+)/gu)) {
      const codePoint = Number.parseInt(match[1] ?? "", 16);
      ranges.push({ end: codePoint, start: codePoint });
    }
  }
  const listed = /ranges:\s*\[([\s\S]*)$/u.exec(block);
  if (listed != null) {
    const pattern = /\[0x([0-9A-Fa-f]+),\s*0x([0-9A-Fa-f]+)\]/gu;
    for (const match of (listed[1] ?? "").matchAll(pattern)) {
      ranges.push({
        end: Number.parseInt(match[2] ?? "", 16),
        start: Number.parseInt(match[1] ?? "", 16),
      });
    }
  }
  assert.ok(ranges.length > 0, `${path} lists no code points`);
  for (const range of ranges) {
    assert.ok(
      range.start >= 0 && range.end <= maxCodePoint,
      `${path} is out of range`,
    );
  }
  return codePointSetFromRanges(ranges);
}

function tableSet(specification: string): CodePointSet | undefined {
  const separator = specification.indexOf("=");
  if (separator < 0) {
    const property = canonicalPropertyName(specification.trim());
    return property == null ? undefined : binaryPropertySet(property);
  }
  const name = specification.slice(0, separator).trim();
  const value = specification.slice(separator + 1).trim();
  const property = canonicalPropertyName(name);
  const canonical = canonicalPropertyValue(name, value);
  if (property == null || canonical == null) return undefined;
  if (property === "General_Category") return generalCategorySet(canonical);
  if (property === "Script") return scriptSet(canonical);
  if (property === "Script_Extensions") return scriptExtensionsSet(canonical);
  return undefined;
}

test("the tables match every generated property-escape oracle", async () => {
  const names = (await readdir(corpusRoot)).filter((name) =>
    name.endsWith(".js"),
  );
  assert.ok(names.length > 400, `only ${names.length} oracle files were found`);
  let compared = 0;
  for (const name of names.toSorted()) {
    const path = join(corpusRoot, name);
    const source = await readFile(path, "utf8");
    const version = /Unicode v(\d+\.\d+\.\d+)/u.exec(source);
    assert.equal(
      version?.[1],
      unicodeVersion,
      `${name} was generated from another Unicode version`,
    );
    const described = /Unicode property escapes for `([^`]+)`/u.exec(source);
    assert.ok(described != null, `${name} names no property`);
    const specification = described[1] ?? "";
    const ours = tableSet(specification);
    assert.ok(ours != null, `${specification} resolves to no table`);
    assert.deepEqual(
      ours,
      oracleSet(source, name),
      `${specification} disagrees with ${name}`,
    );
    compared += 1;
  }
  assert.ok(compared > 400, `only ${compared} properties were compared`);
});
