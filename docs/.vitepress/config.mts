import { readFileSync } from "node:fs";
import process from "node:process";
import { defineConfig, type HeadConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";
import { checkInternalLinks } from "./links.mjs";
import { adrIndex, repositoryLinks, srcExclude } from "./sources.mjs";

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

const title = "Oseo";
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

const config = withMermaid(
  defineConfig({
    title,
    description,
    cleanUrls: true,
    // Keep engineering records in the repository rather than rendering them.
    srcExclude,
    head,
    transformPageData(page) {
      if (origin == null || page.relativePath === "404.md") return;
      const path = page.relativePath
        .replace(/(^|\/)index\.md$/u, "$1")
        .replace(/\.md$/u, "");
      const url = new URL(path, origin).href;
      page.frontmatter.head ??= [];
      page.frontmatter.head.push(
        ["link", { rel: "canonical", href: url }],
        ["meta", { property: "og:url", content: url }],
      );
    },
    markdown: {
      include: { rebaseRelativeUrls: false },
      config(md) {
        repositoryLinks(
          md,
          channel === "stable" ? version : process.env.GITHUB_SHA || "main",
        );
        md.core.ruler.before("normalize", "oseo-quickstart", (state) => {
          state.src = state.src
            .replace("<!-- OSEO_STABLE_QUICKSTART -->", () => quickstart)
            .replace("<!-- OSEO_ADR_INDEX -->", () => adrIndex);
        });
      },
    },
    buildEnd: (site) => checkInternalLinks(site.outDir, origin ?? undefined),
    themeConfig: {
      nav: [
        { text: "Overview", link: "/overview/" },
        { text: "Using Oseo", link: "/using/install" },
        { text: "Development", link: "/development/" },
        ...(version != null ? [{ text: version, link: "/using/install" }] : []),
        ...(channel === "canary"
          ? [{ text: "Stable docs", link: `${stableOrigin}/` }]
          : []),
      ],
      sidebar: [
        {
          text: "Overview",
          items: [
            { text: "Introduction", link: "/overview/" },
            { text: "Comparison", link: "/overview/comparison" },
            { text: "White paper", link: "/overview/white-paper" },
            { text: "Roadmap", link: "/overview/roadmap" },
          ],
        },
        {
          text: "Using Oseo",
          items: [
            { text: "Installation", link: "/using/install" },
            { text: "Examples", link: "/using/examples" },
            { text: "CLI reference", link: "/using/cli" },
            { text: "Supported features", link: "/using/features" },
          ],
        },
        {
          text: "Development",
          items: [
            { text: "Development setup", link: "/development/" },
            { text: "Contributing", link: "/development/contributing" },
            { text: "Releasing", link: "/development/releasing" },
            {
              text: "Architecture",
              items: [
                { text: "Architecture overview", link: "/development/design" },
                {
                  text: "Compiler design",
                  link: "/development/compiler-design",
                },
                {
                  text: "Runtime components",
                  link: "/development/runtime-components",
                },
                { text: "Architecture decision records", link: "/adr/" },
              ],
            },
            {
              text: "Language compatibility",
              items: [
                {
                  text: "ECMAScript 2026 profile",
                  link: "/development/language-profile-es2026",
                },
                {
                  text: "M5 profile (historical)",
                  link: "/development/language-profile-m5",
                },
              ],
            },
            { text: "Evidence", link: "/development/evidence" },
            { text: "Security", link: "/development/security" },
          ],
        },
      ],
      socialLinks: [
        { icon: "github", link: "https://github.com/dahlia/oseo" },
        {
          icon: "jsr",
          link: "https://jsr.io/@oseo/cli",
          ariaLabel: "Oseo on JSR",
        },
        {
          icon: "npm",
          link: "https://www.npmjs.com/package/@oseo/cli",
          ariaLabel: "Oseo on npm",
        },
      ],
    },
  }),
);

// The plugin lists Mermaid's transitive dependencies as top-level imports.
// Under pnpm, pre-bundle Mermaid itself so Vite resolves them from Mermaid.
config.vite.optimizeDeps.include = ["mermaid"];

export default config;
