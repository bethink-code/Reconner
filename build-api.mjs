import { execFileSync } from "child_process";
import { readFileSync, copyFileSync, mkdirSync, readdirSync } from "fs";
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

// Email templates are read with fs.readFileSync at module load, relative to
// the bundle (__dirname). Copy them alongside api/index.mjs so the runtime
// path resolves the same way it does in dev (server/email.ts → server/email-templates/).
mkdirSync("api/email-templates", { recursive: true });
for (const file of readdirSync("server/email-templates")) {
  if (file.endsWith(".html")) {
    copyFileSync(`server/email-templates/${file}`, `api/email-templates/${file}`);
  }
}

// The pricing/viability tool HTML is read with fs.readFileSync at module load
// (server/pricingRoutes.ts → server/pricing-tool/). Copy it next to the bundle
// so the runtime path (api/pricing-tool/) resolves the same way.
mkdirSync("api/pricing-tool", { recursive: true });
for (const file of readdirSync("server/pricing-tool")) {
  if (file.endsWith(".html")) {
    copyFileSync(`server/pricing-tool/${file}`, `api/pricing-tool/${file}`);
  }
}
