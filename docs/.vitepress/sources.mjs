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

import { lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const docsDir = fileURLToPath(new URL("../", import.meta.url));
const repoDir = resolve(docsDir, "..");
const sections = ["overview", "using", "development", "adr"];
const adrPattern = /^(?!0000-)\d{4}-.+\.md$/u;
const published = new Map();
const included = new Map();
const adrs = [];
// VitePress turns dots in these headings into hyphens; GitHub removes them.
const profileAnchors = new Map([
  ["#arrayfromasync", "#array-fromasync"],
  ["#atomicspause", "#atomics-pause"],
  ["#dateprototype-methods", "#date-prototype-methods"],
  ["#regexpprototypecompile", "#regexp-prototype-compile"],
  ["#stringprototype-methods", "#string-prototype-methods"],
]);
const es2026 = resolve(docsDir, "language-profile-es2026.md");

for (const page of [
  "index.md",
  ...sections.flatMap((section) =>
    readdirSync(resolve(docsDir, section), { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith(".md") &&
          (section !== "adr" ||
            entry.name === "index.md" ||
            adrPattern.test(entry.name)),
      )
      .map((entry) => `${section}/${entry.name}`),
  ),
]) {
  const file = resolve(docsDir, page);
  const text = readFileSync(file, "utf8");
  const include = /^<!-- @include: ([^\n]+) -->\s*$/u.exec(text);
  const source = include == null ? file : resolve(dirname(file), include[1]);
  const route = `/${page.replace(/(^|\/)index\.md$/u, "$1")}`;
  published.set(file, route);
  if (include != null) {
    published.set(source, route);
    included.set(file, source);
  }
  if (page.startsWith("adr/") && adrPattern.test(page.slice(4))) {
    adrs.push({ page, title: text.split("\n")[0] });
  }
}

export const srcExclude = [
  ...readdirSync(docsDir, { withFileTypes: true })
    .filter(
      ({ name }) =>
        !name.startsWith(".") &&
        name !== "index.md" &&
        !sections.includes(name),
    )
    .map((entry) => (entry.isDirectory() ? `${entry.name}/**` : entry.name)),
  ...readdirSync(resolve(docsDir, "adr"))
    .filter((name) => name !== "index.md" && !adrPattern.test(name))
    .map((name) => `adr/${name}`),
];

export const adrIndex = adrs
  .toSorted((a, b) => a.page.localeCompare(b.page, "en"))
  .map(({ page, title }) => `- [${title}](./${page.slice(4)})`)
  .join("\n");

// Rewrite Markdown tokens before VitePress normalizes URLs and checks links.
// A whole-page include uses the original file, not the wrapper, as its base.
export function repositoryLinks(md, revision) {
  md.core.ruler.after("inline", "oseo-repository-links", (state) => {
    const file = state.env.realPath ?? state.env.path;
    if (file == null) return;
    const source = included.get(file) ?? file;
    const base = dirname(source);
    for (const block of state.tokens) {
      for (const token of block.children ?? []) {
        const attr =
          token.type === "link_open"
            ? "href"
            : token.type === "image"
              ? "src"
              : null;
        if (attr == null) continue;
        const url = token.attrGet(attr);
        if (url == null) continue;
        if (source === es2026 && profileAnchors.has(url)) {
          token.attrSet(attr, profileAnchors.get(url));
          continue;
        }
        if (/^(?:[a-z][\w+.-]*:|[/#?])/iu.test(url)) continue;
        const pathname = url.split(/[?#]/u, 1)[0];
        if (pathname === "") continue;
        const suffix = url.slice(pathname.length);
        const target = resolve(base, decodeURI(pathname));
        const route =
          published.get(target) ?? published.get(resolve(target, "index.md"));
        if (route != null) {
          token.attrSet(
            attr,
            route +
              (target === es2026
                ? (profileAnchors.get(suffix) ?? suffix)
                : suffix),
          );
          continue;
        }
        const path = relative(repoDir, target);
        if (path === ".." || path.startsWith(`..${sep}`)) continue;
        const stat = lstatSync(target, { throwIfNoEntry: false });
        if (stat == null) continue;
        const directory =
          stat.isDirectory() ||
          (stat.isSymbolicLink() && statSync(target).isDirectory());
        const location =
          attr === "src"
            ? `https://raw.githubusercontent.com/dahlia/oseo/${revision}`
            : `https://github.com/dahlia/oseo/${directory ? "tree" : "blob"}/${revision}`;
        const encoded = path.split(sep).map(encodeURIComponent).join("/");
        token.attrSet(attr, `${location}/${encoded}${suffix}`);
      }
    }
  });
}
