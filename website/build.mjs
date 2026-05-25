// lekana website build — assembles static pages from src/ into dist/.
// Pure Node, no dependencies. Run by Vercel via `node build.mjs`
// (buildCommand in vercel.json), or locally to preview dist/.
//
// Each src/pages/*.html starts with an HTML comment metadata block:
//   <!--meta { "title": "...", "description": "...", "route": "/pilot",
//             "ogImage": "/og-image.png", "headExtra": "<script>..." } -->
// followed by the page's <main> body content.

import {
  readFileSync, writeFileSync, mkdirSync, rmSync,
  readdirSync, copyFileSync, statSync, existsSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "src");
const DIST = join(__dirname, "dist");
const SITE = "https://lekana.app";

const layout = readFileSync(join(SRC, "layout.html"), "utf8");
const navPartial = readFileSync(join(SRC, "partials", "nav.html"), "utf8");
const footerPartial = readFileSync(join(SRC, "partials", "footer.html"), "utf8");

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

function parseMeta(raw) {
  const m = raw.match(/^\s*<!--meta\s*([\s\S]*?)-->/);
  if (!m) throw new Error("page is missing its <!--meta--> block");
  return { meta: JSON.parse(m[1]), body: raw.slice(m[0].length).trim() };
}

const absUrl = (p) => (!p ? "" : p.startsWith("http") ? p : SITE + p);
const canonicalFor = (route) => (route === "/" ? SITE + "/" : SITE + route);

// Replace a token with a literal string (function form avoids $-pattern issues).
const put = (html, token, value) => html.replaceAll(token, () => value);

const pageFiles = readdirSync(join(SRC, "pages")).filter((f) => f.endsWith(".html"));
const routes = [];

for (const file of pageFiles) {
  const { meta, body } = parseMeta(readFileSync(join(SRC, "pages", file), "utf8"));

  let nav = navPartial;
  const key = meta.route.replace(/^\//, "");
  if (key) nav = nav.replaceAll(`data-nav="${key}"`, `data-nav="${key}" aria-current="page"`);

  let html = layout;
  html = put(html, "{{TITLE}}", meta.title);
  html = put(html, "{{DESCRIPTION}}", meta.description);
  html = put(html, "{{CANONICAL}}", canonicalFor(meta.route));
  html = put(html, "{{OG_IMAGE}}", absUrl(meta.ogImage || "/og-image.png"));
  html = put(html, "{{HEAD_EXTRA}}", meta.headExtra || "");
  html = put(html, "{{NAV}}", nav);
  html = put(html, "{{FOOTER}}", footerPartial);
  html = put(html, "{{BODY}}", body);

  writeFileSync(join(DIST, file), html, "utf8");
  routes.push(meta.route);
}

// Static passthrough → dist/
function copyRecursive(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir)) {
    const s = join(srcDir, entry);
    const d = join(destDir, entry);
    if (statSync(s).isDirectory()) copyRecursive(s, d);
    else copyFileSync(s, d);
  }
}

const staticFiles = [
  "favicon.svg", "og-image.png", "og-image.svg",
  "site.css", "policy.css", "terms.html", "privacy.html",
];
for (const f of staticFiles) {
  if (existsSync(join(__dirname, f))) copyFileSync(join(__dirname, f), join(DIST, f));
}
copyRecursive(join(__dirname, "assets"), join(DIST, "assets"));

// robots.txt + sitemap.xml (apex URLs only, kept in sync with pages)
writeFileSync(join(DIST, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`, "utf8");

const sitemapRoutes = [...routes, "/terms.html", "/privacy.html"];
const urls = sitemapRoutes.map((r) => `  <url><loc>${canonicalFor(r)}</loc></url>`).join("\n");
writeFileSync(
  join(DIST, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
  "utf8",
);

console.log(`Built ${routes.length} pages -> dist/ (${routes.join(", ")})`);
