import { copyFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { defineConfig } from "tsup";

function copyDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dest, entry);
    if (statSync(s).isDirectory()) {
      copyDir(s, d);
    } else {
      mkdirSync(dirname(d), { recursive: true });
      copyFileSync(s, d);
    }
  }
}

function copyVendor(distStatic: string): void {
  const vendorDir = join(distStatic, "vendor");
  mkdirSync(vendorDir, { recursive: true });
  const files: Array<[string, string]> = [
    ["node_modules/vue/dist/vue.global.prod.js", "vue.global.prod.js"],
    ["node_modules/element-plus/dist/index.full.min.js", "index.full.min.js"],
    ["node_modules/element-plus/dist/index.css", "index.css"],
    ["node_modules/xlsx/dist/xlsx.full.min.js", "xlsx.full.min.js"],
  ];
  for (const [src, name] of files) {
    copyFileSync(src, join(vendorDir, name));
  }
}

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  outExtension: () => ({ js: ".mjs" }),
  async onSuccess() {
    const distStatic = "dist/static";
    copyDir("static", distStatic);
    copyVendor(distStatic);
    const rel = relative(process.cwd(), distStatic);
    process.stdout.write(`STATIC copied → ${rel}\n`);
  },
});
