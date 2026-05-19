# lekana.app website - developer handover

**Version 1.0  ·  May 2026  ·  Bethink (Pty) Ltd  ·  Confidential**

This folder contains everything needed to deploy lekana.app as a static
marketing site. Single HTML page, separate asset files, no build step
required for v1.

---

## What's in this folder

```
lekana-website/
├── index.html                       The website
├── assets/
│   ├── screenshots/                 Product screenshots used in the site
│   │   ├── summary.png              Hero recon section
│   │   ├── transactions.png         "You confirm what lekana cannot"
│   │   ├── step1-fuel.png           How it works - step 1 (plum band)
│   │   ├── step2-bank.png           How it works - step 2 (teal band)
│   │   ├── step3-configure.png      How it works - step 3 (burnt band)
│   │   ├── matching-complete.png    How it works - step 4 (sunshine band)
│   │   ├── insights.png             Insights landing
│   │   ├── insights-overview.png    Recon overview report
│   │   ├── insights-attendants.png  Attendants report
│   │   ├── insights-declined.png    Declined cards report
│   │   └── periods-dashboard.png    (not used on page, kept for reference)
│   └── brand/
│       ├── lekana-mark.svg          The dot-line-dot mark, dark
│       ├── lekana-mark-cream.svg    The mark in cream (dark canvas use)
│       └── bethink-logo.svg         Parent company lockup
└── docs/
    ├── README.md                    This file
    └── brief.md                     The content brief - copy, structure,
                                     rationale for every section
```

---

## Quick start

This is a static site. To preview locally:

```bash
# In this folder
python3 -m http.server 8000
# or
npx serve .
```

Then open `http://localhost:8000`.

To deploy, push the contents of this folder to any static host (Vercel,
Netlify, Cloudflare Pages, S3 + CloudFront, plain nginx). No build step.

---

## What still needs the dev's hands

These items are intentionally left for production work, in priority order.

### 1. Request access form (BLOCKING - form submits do nothing yet)

The form at `#request` POSTs to `/api/request-access`. The endpoint does
not exist yet. The handler should:

- Accept JSON body: `{ "name": "string", "email": "string", "cell": "string", "business": "string" }`
- Send an email to **garth@bethink.co.za** and **pieter@molo.page** with the
  submission details
- Rate limit: 3 requests per IP per hour
- Return 200 with `{ "ok": true }` on success
- Return 4xx with `{ "ok": false, "error": "..." }` on bad input

Recommended provider: Resend (resend.com). The same backend should serve
the in-app request access flow on the login page, so a single endpoint
handles both.

In the current JS, replace the simulated success state with a real fetch:

```javascript
const res = await fetch('/api/request-access', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});
```

### 2. Favicons and OG image

The `<head>` references these files but they are not in this folder yet:

- `/favicon.svg` - SVG favicon (use the lekana mark)
- `/favicon-32x32.png` - 32x32 PNG fallback
- `/favicon-16x16.png` - 16x16 PNG fallback
- `/apple-touch-icon.png` - 180x180 for iOS home screen
- `/site.webmanifest` - PWA manifest
- `/og-image.png` - 1200x630 social share image

Generate these from the lekana mark on the Sunshine canvas. Keep
margins generous. For the OG image, the wordmark + strapline + "a TimeWarp
product by Bethink" combination at large size works well.

### 3. Terms and privacy pages

The footer links to `/terms.html` and `/privacy.html`. Neither exists yet.
The terms of use content is in `lekana-dev-handover-full.docx` (the login
handover) - reuse that. Privacy should be a short POPIA-focused page.

### 4. Production hosting notes

- Set `Cache-Control: public, max-age=31536000, immutable` on `/assets/*`
- Set `Cache-Control: no-cache` on `/index.html`
- Enable Brotli compression
- Add `Strict-Transport-Security` header
- Add `X-Content-Type-Options: nosniff`
- Add `Referrer-Policy: strict-origin-when-cross-origin`
- CSP: at minimum, allow `https://fonts.googleapis.com` and `https://fonts.gstatic.com`

---

## Locked design decisions (do not change without consulting)

These were established through the lekana design system. They are not
preferences - they are rules.

1. **lekana is always lowercase.** Never `Lekana`, never `LEKANA`. Even at
   the start of a sentence.
2. **Sunshine yellow `#F5C400` is canvas only.** Never on buttons, badges,
   borders, inputs, or interactive elements. Never on a light background.
3. **Bethink orange `#FC6722`** is restricted to the Send request button
   and the Bethink logo dot. Nowhere else.
4. **No drop shadows. No card borders.** Separation comes from background
   colour against white cards.
5. **No em dashes.** Plain hyphens, or rewrite the sentence.
6. **No emoji. Anywhere.** Not in copy, not in errors, not in alerts.
7. **Two type families only:** Nunito (display, 300/400/600) and Figtree
   (body and data, 300/400/500). Never above those weights.
8. **No AI-tell words:** genuinely, straightforward, delve, leverage,
   unlock, seamless, effortless, elevate.
9. **The stepper colours (plum, teal, burnt orange, sunshine)** appear
   only inside the reconciliation flow. The marketing site shows them
   inside screenshot frames only. They are not used as marketing canvas
   surfaces.

---

## SEO setup

The page is shipped SEO-ready. The dev should not need to touch the
metadata unless content changes substantively.

- Title, description, keywords in head
- Canonical URL set to https://lekana.app/
- Open Graph and Twitter Card metadata
- South African geo and locale signals
- JSON-LD structured data:
  - `Organization` for Bethink (Pty) Ltd
  - `SoftwareApplication` for lekana with both pricing offers
  - `Product` with AggregateOffer (low/high price)
  - `FAQPage` with seven canonical questions
  - `WebSite` for the site itself
- Semantic HTML5 landmarks: `<header>`, `<main>`, `<nav>`, `<footer>`,
  `<section>` with `aria-labelledby`, `<article>` for cards, `<figure>`
  and `<figcaption>` for screenshots
- Skip link for keyboard users
- Tabular numerals on amounts
- `lang="en-ZA"` on `<html>`

**After deployment, submit the sitemap to Google Search Console.** A
sitemap.xml with a single entry for the homepage is sufficient at v1.

---

## File sizes and performance

- `index.html` is around 67KB (no embedded images)
- Total screenshot weight is around 1MB
- Fonts load from Google Fonts CDN (preconnect hints in place)

Largest screenshots (over 100KB): `step3-configure.png`, `transactions.png`,
`insights-attendants.png`. Consider running these through an optimiser
like Squoosh or ImageOptim before going live. Target: under 150KB each
without losing the small text legibility.

---

## Brand assets reference

- **Primary canvas (hero, CTA):** Sunshine `#F5C400`
- **App background, alternate sections:** Page background `#F4F4F0`
- **Soft accent sections:** Cream `#F5EDE6`
- **Dark surfaces (pivot, proof, pricing card, footer):** Dark `#1A1200`
- **Primary text:** Dark `#1A1200` (not pure black)
- **Muted text:** `#6B7280`
- **Verified / success:** Verified green `#166534`
- **Investigate / warning:** Investigate amber `#B45309`
- **Send request button only:** Bethink orange `#FC6722`

Typography:

- **Headings, wordmark, labels:** Nunito (300 for hero/display, 400 for
  H2/H3 and wordmark, 600 for uppercase micro-labels)
- **Body, data, form fields:** Figtree (300 for light supporting copy,
  400 for body, 500 for emphasised amounts and data)
- **Money:** Figtree 500, tabular numerals, formatted with space
  thousand separators and comma decimals (e.g. `R 4 287 650,00`)

---

## Contacts

- **Product / brand:** Garth - garth@bethink.co.za - WhatsApp 083 496 6860
- **Operations:** Pieter - pieter@molo.page - WhatsApp 083 225 2986

For questions about the design system itself, the brief document in this
folder (`docs/brief.md`) explains the rationale behind every section.
