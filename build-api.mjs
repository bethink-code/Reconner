import { build } from "esbuild";
import { readFileSync, copyFileSync } from "fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

// All dependencies are external EXCEPT pdf.js-extract which uses
// internal require() paths that Vercel's file tracer can't detect.
const bundledPackages = new Set(["pdf.js-extract"]);

const external = Object.keys(pkg.dependencies || {})
  .filter((dep) => !bundledPackages.has(dep));

await build({
  entryPoints: ["server/api.ts"],
  platform: "node",
  bundle: true,
  format: "esm",
  outfile: "api/index.mjs",
  external: [...external, "canvas"],
  // createRequire so bundled CJS code can use require() in the ESM output
  banner: {
    js: `import { createRequire } from 'module'; import { fileURLToPath as __fileURLToPath } from 'url'; import { dirname as __pathDirname } from 'path'; const require = createRequire(import.meta.url); const __filename = __fileURLToPath(import.meta.url); const __dirname = __pathDirname(__filename);`,
  },
});

// pdf.js-extract loads pdf.worker.js via eval("require") at runtime.
// esbuild can't statically bundle it, so copy it next to the output.
copyFileSync(
  "node_modules/pdf.js-extract/lib/pdfjs/pdf.worker.js",
  "api/pdf.worker.js"
);
