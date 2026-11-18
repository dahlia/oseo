import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

// VitePress checks Markdown page links, but not theme links or fragments.
export async function checkInternalLinks(
  outDir,
  origin = "https://preview.invalid",
) {
  const files = new Set(
    (await readdir(outDir, { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) =>
        relative(outDir, join(entry.parentPath, entry.name))
          .split(sep)
          .join("/"),
      ),
  );
  const pages = new Map(
    await Promise.all(
      [...files]
        .filter((file) => file.endsWith(".html"))
        .map(async (file) => {
          const html = await readFile(join(outDir, file), "utf8");
          return [
            file,
            {
              ids: new Set(
                Array.from(html.matchAll(/ id="([^"]+)"/g), ([, id]) => id),
              ),
              links: Array.from(
                html.matchAll(/<a\b[^>]*\shref="([^"]+)"/g),
                ([, href]) => href,
              ),
            },
          ];
        }),
    ),
  );

  const broken = [];
  for (const [file, { links }] of pages) {
    for (const href of new Set(links)) {
      const target = new URL(href, `${origin}/${file}`);
      if (target.origin !== origin) continue;
      const path = decodeURIComponent(target.pathname.slice(1));
      const dest = target.pathname.endsWith("/") ? `${path}index.html` : path;
      const resolved = [dest, `${dest}.html`, `${dest}/index.html`].find((p) =>
        files.has(p),
      );
      const fragment = decodeURIComponent(target.hash.slice(1));
      if (
        resolved == null ||
        (fragment !== "" &&
          pages.has(resolved) &&
          !pages.get(resolved).ids.has(fragment))
      ) {
        broken.push(`${file}: ${href}`);
      }
    }
  }
  if (broken.length > 0) {
    throw new Error(`Broken internal links:\n${broken.join("\n")}`);
  }
}
