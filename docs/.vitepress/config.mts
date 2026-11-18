import { readdirSync } from "node:fs";
import { defineConfig } from "vitepress";
import { checkInternalLinks } from "./links.mjs";

const siteSources = new Set(["index.md", "cli.md", "using", "development"]);

export default defineConfig({
  title: "Oseo",
  description: "A native ahead-of-time engine for JavaScript and TypeScript",
  // Keep engineering records in the repository rather than rendering them.
  srcExclude: readdirSync(new URL("../", import.meta.url), {
    withFileTypes: true,
  })
    .filter(({ name }) => !name.startsWith(".") && !siteSources.has(name))
    .map((entry) => (entry.isDirectory() ? `${entry.name}/**` : entry.name)),
  buildEnd: (site) => checkInternalLinks(site.outDir),
  themeConfig: {
    nav: [
      { text: "Using Oseo", link: "/using/install" },
      { text: "Development", link: "/development/" },
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
