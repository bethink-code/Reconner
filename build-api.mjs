import { execFileSync } from "child_process";
import { readFileSync, copyFileSync } from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

// All dependencies are external EXCEPT pdf.js-extract which uses
// internal require() paths that Vercel's file tracer can't detect.
const bundledPackages = new Set(["pdf.js-extract"]);

const externalArgs = Object.keys(pkg.dependencies || {})
  .filter((dep) => !bundledPackages.has(dep))
  .flatMap((dep) => [`--external:${dep}`]);

const esbuildBinary = require.resolve("@esbuild/win32-x64/esbuild.exe");
const banner =
  "import { createRequire } from 'module'; " +
  "import { fileURLToPath as __fileURLToPath } from 'url'; " +
  "import { dirname as __pathDirname } from 'path'; " +
  "const require = createRequire(import.meta.url); " +
  "const __filename = __fileURLToPath(import.meta.url); " +
  "const __dirname = __pathDirname(__filename);";

execFileSync(
  esbuildBinary,
  [
    "server/api.ts",
    "--platform=node",
    "--bundle",
    "--format=esm",
    "--outfile=api/index.mjs",
    ...externalArgs,
    "--external:canvas",
    `--banner:js=${banner}`,
  ],
  { stdio: "inherit" }
);

// pdf.js-extract loads pdf.worker.js via eval("require") at runtime.
// esbuild can't statically bundle it, so copy it next to the output.
copyFileSync(
  "node_modules/pdf.js-extract/lib/pdfjs/pdf.worker.js",
  "api/pdf.worker.js"
);
