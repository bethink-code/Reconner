// One-shot rasteriser: website/og-image.svg -> website/og-image.png at 1200x630.
//
// Run with:  node scripts/generate-og-image.mjs
//
// Uses @resvg/resvg-js (a small wasm rasteriser, no Chromium). Pulls the
// brand fonts (Nunito 300/400, Figtree 400) from Google Fonts via the CSS
// API, extracts the gstatic TTF URLs, and caches the files in
// scripts/.font-cache/ so subsequent runs are offline.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const CACHE_DIR = "scripts/.font-cache";
const FONTS = [
  { family: "Nunito",  weight: 300, file: "Nunito-300.ttf"  },
  { family: "Nunito",  weight: 400, file: "Nunito-400.ttf"  },
  { family: "Figtree", weight: 400, file: "Figtree-400.ttf" },
];

// Desktop UA gets us the TTF format (mobile UA returns woff2).
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
  const ttfBuffer = Buffer.from(await (await fetch(match[1])).arrayBuffer());
  writeFileSync(cachePath, ttfBuffer);
  return resolve(cachePath);
}

console.log("Loading brand fonts...");
const fontFiles = await Promise.all(FONTS.map(ensureFont));

const svg = readFileSync("website/og-image.svg", "utf8");

const resvg = new Resvg(svg, {
  background: "#F5C400",
  fitTo: { mode: "width", value: 1200 },
  font: {
    fontFiles,
    defaultFontFamily: "Nunito",
    loadSystemFonts: false,
  },
});

const png = resvg.render().asPng();
writeFileSync("website/og-image.png", png);

console.log(`Wrote website/og-image.png (${png.length} bytes)`);
