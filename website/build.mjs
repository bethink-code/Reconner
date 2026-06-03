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
import QRCode from "qrcode";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "src");
const DIST = join(__dirname, "dist");
const SITE = "https://lekana.app";

const layout = readFileSync(join(SRC, "layout.html"), "utf8");
const navPartial = readFileSync(join(SRC, "partials", "nav.html"), "utf8");
const footerPartial = readFileSync(join(SRC, "partials", "footer.html"), "utf8");
const personTemplate = readFileSync(join(SRC, "templates", "person.html"), "utf8");
const people = JSON.parse(readFileSync(join(SRC, "data", "people.json"), "utf8")).people;

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

// Per-person share pages (for example /garth) + matching .vcf downloads.
// Each page personalises the lekana site; the .vcf is what the "Save to contacts"
// button downloads. The QR encodes the page URL so scanning opens the page on a
// phone, from where the visitor can save contacts or read about lekana.
for (const person of people) {
  const url = `${SITE}/${person.slug}`;

  // vCard 3.0 - widely supported across iOS and Android contacts apps.
  // Surname can be blank; FN falls back to firstName so the saved contact still
  // shows something sensible.
  const fullName = [person.firstName, person.lastName].filter(Boolean).join(" ");
  const vcardLines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${person.lastName};${person.firstName};;;`,
    `FN:${fullName}`,
    `ORG:${person.vcardOrg}`,
    `TITLE:${person.vcardTitle}`,
    `EMAIL;TYPE=INTERNET:${person.email}`,
    `URL:${url}`,
  ];
  if (person.phoneE164) vcardLines.push(`TEL;TYPE=CELL,VOICE:${person.phoneE164}`);
  if (person.linkedin) vcardLines.push(`URL;TYPE=LinkedIn:${person.linkedin}`);
  vcardLines.push("END:VCARD");
  const vcardText = vcardLines.join("\r\n") + "\r\n";

  // QR encodes the page URL (not the raw vCard) so the scan lands the visitor
  // on the page first - where they get lekana context, then save the contact
  // via the .vcf download button. Smaller payload = lower error-correction
  // demand and a cleaner-looking code at print sizes.
  const qrSvg = await QRCode.toString(url, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
  });

  const linkedinRow = person.linkedin
    ? `<li><span class="k">LinkedIn</span> <a href="${person.linkedin}">View profile</a></li>`
    : "";
  const whatsappRow = person.whatsapp
    ? `<li><span class="k">WhatsApp</span> <a href="${person.whatsapp}">${person.phoneDisplay}</a></li>`
    : `<li><span class="k">WhatsApp</span> ${person.phoneDisplay || "To be confirmed"}</li>`;
  const photoBlock = person.photo
    ? `<div class="person-photo"><img src="${person.photo}" alt="${fullName}" width="120" height="120"></div>`
    : "";

  let body = personTemplate;
  body = put(body, "{{SLUG}}", person.slug);
  body = put(body, "{{FIRST_NAME}}", person.firstName);
  body = put(body, "{{FULL_NAME}}", fullName);
  body = put(body, "{{TITLE}}", person.title);
  body = put(body, "{{ROLE}}", person.role);
  body = put(body, "{{INTRO}}", person.intro);
  body = put(body, "{{BEST_FOR}}", person.bestFor);
  body = put(body, "{{EMAIL}}", person.email);
  body = put(body, "{{WHATSAPP_ROW}}", whatsappRow);
  body = put(body, "{{LINKEDIN_ROW}}", linkedinRow);
  body = put(body, "{{PHOTO_BLOCK}}", photoBlock);
  body = put(body, "{{QR_SVG}}", qrSvg);

  const pageTitle = `${fullName} - ${person.title}.`;
  const pageDescription = `${fullName}, ${person.title}. ${person.role}. Save my contact card or share the link. lekana is a POS to bank reconciliation tool built by Bethink (Pty) Ltd in South Africa.`;
  const route = `/${person.slug}`;
  const personOgImage = existsSync(join(__dirname, `og-${person.slug}.png`))
    ? `/og-${person.slug}.png`
    : "/og-image.png";

  let html = layout;
  html = put(html, "{{TITLE}}", pageTitle);
  html = put(html, "{{DESCRIPTION}}", pageDescription);
  html = put(html, "{{CANONICAL}}", canonicalFor(route));
  html = put(html, "{{OG_IMAGE}}", absUrl(personOgImage));
  html = put(html, "{{HEAD_EXTRA}}", "");
  html = put(html, "{{NAV}}", navPartial);
  html = put(html, "{{FOOTER}}", footerPartial);
  html = put(html, "{{BODY}}", body);

  writeFileSync(join(DIST, `${person.slug}.html`), html, "utf8");
  writeFileSync(join(DIST, `${person.slug}.vcf`), vcardText, "utf8");
  routes.push(route);
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
  ...people.map((p) => `og-${p.slug}.png`),
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
