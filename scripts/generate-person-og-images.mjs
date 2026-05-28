// Generate per-person OG images (1200x630) for each person in
// website/src/data/people.json. Embeds the LinkedIn-style profile photo into
// a cream-canvas card with the lekana mark, full name, and title.
//
// Output: website/og-<slug>.png — committed to git so the static site can
// reference /og-<slug>.png on the person's page meta.
//
// Run with:  node scripts/generate-person-og-images.mjs
//
// Cream canvas (not sunshine) deliberately - sunshine is the lekana product
// brand. Cream marks "lekana introduced by a person", same logic as the
// favicon/contact-card surfaces in the site.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const CACHE_DIR = "scripts/.font-cache";
const FONTS = [
  { family: "Nunito",  weight: 400, file: "Nunito-400.ttf"  },
  { family: "Nunito",  weight: 600, file: "Nunito-600.ttf"  },
  { family: "Figtree", weight: 400, file: "Figtree-400.ttf" },
];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

async function ensureFont({ family, weight, file }) {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = join(CACHE_DIR, file);
  if (existsSync(cachePath)) return resolve(cachePath);
  console.log(`  fetching ${file}...`);
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`;
  const css = await (await fetch(cssUrl, { headers: { "User-Agent": UA } })).text();
  const match = css.match(/url\((https:\/\/[^)]+\.ttf)\)/);
  if (!match) throw new Error(`No TTF URL in Google Fonts CSS for ${family} ${weight}`);
  const ttf = Buffer.from(await (await fetch(match[1])).arrayBuffer());
  writeFileSync(cachePath, ttf);
  return resolve(cachePath);
}

const escapeXml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function buildSvg(person, photoBase64) {
  // Four-strip layout (1200x630):
  //   [0-300]   Logo      | lekana mark + wordmark, centered
  //   [300-900] Picture   | profile photo filling a 600x630 square
  //   [900-1200] Text     | name + title + URL stacked vertically
  // When WhatsApp / iMessage square-crop the centre (~x=285..915), the viewer
  // sees almost exactly the picture. The expanded landscape shows everything.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <rect width="1200" height="630" fill="#F5EDE6"/>

  <!-- LEFT STRIP: lekana mark + wordmark, both centered on x=150 -->
  <g transform="translate(96, 255)">
    <circle cx="20" cy="40" r="13" fill="#1A1200"/>
    <rect x="50" y="2" width="11" height="76" rx="6" fill="#1A1200"/>
    <circle cx="91" cy="40" r="13" fill="#1A1200"/>
  </g>
  <text x="150" y="385" text-anchor="middle"
        font-family="Nunito" font-weight="400" font-size="40" fill="#1A1200" letter-spacing="-1">lekana</text>

  <!-- MIDDLE: profile photo, 600x630 square, edge-to-edge top to bottom -->
  <image href="data:image/jpeg;base64,${photoBase64}"
         x="300" y="0" width="600" height="630"
         preserveAspectRatio="xMidYMid slice"/>

  <!-- RIGHT STRIP: name (wrapped two lines) + title + URL, left-aligned at x=930 -->
  <text x="930" y="280" font-family="Nunito" font-weight="600" font-size="44" fill="#1A1200" letter-spacing="-1">${escapeXml(person.firstName)}</text>
  <text x="930" y="332" font-family="Nunito" font-weight="600" font-size="44" fill="#1A1200" letter-spacing="-1">${escapeXml(person.lastName)}.</text>
  <text x="930" y="382" font-family="Figtree" font-weight="400" font-size="22" fill="#6B7280">${escapeXml(person.title)}</text>
  <text x="930" y="450" font-family="Nunito" font-weight="400" font-size="22" fill="#1A1200" letter-spacing="-0.5">lekana.app/${escapeXml(person.slug)}</text>
</svg>`;
}

console.log("Loading brand fonts...");
const fontFiles = await Promise.all(FONTS.map(ensureFont));

const people = JSON.parse(readFileSync("website/src/data/people.json", "utf8")).people;

for (const person of people) {
  if (!person.photo) {
    console.log(`Skipping ${person.slug}: no photo configured`);
    continue;
  }
  const photoPath = join("website", person.photo);
  const photoBase64 = readFileSync(photoPath).toString("base64");
  const svg = buildSvg(person, photoBase64);
  const resvg = new Resvg(svg, {
    background: "#F5EDE6",
    fitTo: { mode: "width", value: 1200 },
    font: { fontFiles, defaultFontFamily: "Nunito", loadSystemFonts: false },
  });
  const png = resvg.render().asPng();
  const out = `website/og-${person.slug}.png`;
  writeFileSync(out, png);
  console.log(`Wrote ${out} (${png.length} bytes)`);
}
