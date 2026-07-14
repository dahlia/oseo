import { defineConfig, type UserConfig } from "tsdown";

const config: UserConfig = defineConfig({
  attw: {
    level: "error",
    profile: "esm-only",
  },
  clean: true,
  deps: {
    neverBundle: [/^@oseo\//],
  },
  dts: {
    sourcemap: true,
  },
  entry: ["src/index.ts"],
  format: ["esm"],
  minify: false,
  outExtensions(): { readonly js: ".js" } {
    return { js: ".js" };
  },
  publint: {
    level: "error",
  },
  sourcemap: true,
});

export default config;
