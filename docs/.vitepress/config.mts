import { readdirSync, readFileSync } from "node:fs";
import process from "node:process";
import { defineConfig, type HeadConfig } from "vitepress";
import { checkInternalLinks } from "./links.mjs";

const siteSources = new Set(["index.md", "cli.md", "using", "development"]);
const stableOrigin = "https://oseo.dev";
const canaryOrigin = "https://canary.oseo.dev";
const rawChannel = process.env.OSEO_DOCS_CHANNEL ?? "preview";
// Ordinary CI runs were named "build" by the release identity.
const channel = rawChannel === "build" ? "preview" : rawChannel;
const version = process.env.OSEO_DOCS_VERSION;
const core = String.raw`(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)`;
const stableVersion = new RegExp(`^${core}$`, "u");
const canaryVersion = new RegExp(`^${core}-canary\\.[1-9]\\d*$`, "u");
if (channel !== "stable" && channel !== "canary" && channel !== "preview") {
  throw new Error(`Unknown OSEO_DOCS_CHANNEL: ${rawChannel}`);
}
const expectedVersion = channel === "canary" ? canaryVersion : stableVersion;
if (
  (version == null && channel !== "preview") ||
  (version != null && !expectedVersion.test(version))
) {
  throw new Error(`Invalid OSEO_DOCS_VERSION for ${channel} docs.`);
}

const label = { stable: "", canary: "Canary", preview: "Preview" }[channel];
const title = ["Oseo", label, version].filter(Boolean).join(" ");
const description =
  "A native ahead-of-time engine for JavaScript and TypeScript";
const origin =
  channel === "stable"
    ? stableOrigin
    : channel === "canary"
      ? canaryOrigin
      : null;
const quickstart =
  channel === "stable" && version != null
    ? readFileSync(
        new URL("./stable-quickstart.md", import.meta.url),
        "utf8",
      ).replaceAll("{{VERSION}}", version)
    : "";
const head: HeadConfig[] = [
  ["meta", { property: "og:site_name", content: title }],
  ["meta", { name: "oseo:channel", content: channel }],
];
if (version != null) {
  head.push(["meta", { name: "oseo:version", content: version }]);
}
if (channel !== "stable") {
  head.push(["meta", { name: "robots", content: "noindex" }]);
}

export default defineConfig({
  title,
  description,
  // Keep engineering records in the repository rather than rendering them.
  srcExclude: readdirSync(new URL("../", import.meta.url), {
    withFileTypes: true,
  })
    .filter(({ name }) => !name.startsWith(".") && !siteSources.has(name))
    .map((entry) => (entry.isDirectory() ? `${entry.name}/**` : entry.name)),
  head,
  transformPageData(page) {
    if (origin == null || page.relativePath === "404.md") return;
    const path = page.relativePath
      .replace(/(^|\/)index\.md$/u, "$1")
      .replace(/\.md$/u, ".html");
    const url = new URL(path, origin).href;
    page.frontmatter.head ??= [];
    page.frontmatter.head.push(
      ["link", { rel: "canonical", href: url }],
      ["meta", { property: "og:url", content: url }],
    );
  },
  markdown: {
    config(md) {
      md.core.ruler.before("normalize", "oseo-quickstart", (state) => {
        state.src = state.src.replace(
          "<!-- OSEO_STABLE_QUICKSTART -->",
          () => quickstart,
        );
      });
    },
  },
  buildEnd: (site) => checkInternalLinks(site.outDir, origin ?? undefined),
  themeConfig: {
    nav: [
      { text: "Using Oseo", link: "/using/install" },
      { text: "Development", link: "/development/" },
      ...(channel === "canary"
        ? [{ text: "Stable docs", link: `${stableOrigin}/` }]
        : []),
    ],
    sidebar: [
      {
        text: "Using Oseo",
        items: [
          { text: "Installation", link: "/using/install" },
          { text: "Examples", link: "/using/examples" },
          { text: "CLI reference", link: "/cli" },
          { text: "Supported features", link: "/using/features" },
        ],
      },
      {
        text: "Development",
        items: [
          { text: "Contributing", link: "/development/" },
          { text: "Architecture and decisions", link: "/development/design" },
          { text: "Evidence", link: "/development/evidence" },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/dahlia/oseo" }],
  },
});
