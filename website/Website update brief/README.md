# Handoff: lekana marketing site

## Overview

A single-page marketing site for **lekana** — a bank-to-POS reconciliation product for South African operators (a TimeWarp product by Bethink (Pty) Ltd). It is a six-view site (Home, Reconciliation, Insights, Pricing, Pilot, Contact) with client-side view switching and a two-question interactive opener on the Home view that branches the hero message.

The job is to position the product: lead a visitor through "do you feel money is leaking?" → "can you actually prove it isn't?" and land them on the pilot/pricing ask.

## About the design files

The files in this bundle are **design references created in HTML** — a working prototype that shows the intended look, copy, and behaviour. **They are not production code to lift wholesale.** The task is to **recreate this design in the target codebase's environment** (React, Vue, Svelte, Astro, plain templates — whatever the project uses), following that codebase's established patterns, routing, and component conventions. If no codebase exists yet, this is a marketing site with light interactivity — a static-site framework (Astro, Next static export, plain HTML+CSS) is the most appropriate choice; avoid pulling in a heavy SPA stack for what is fundamentally content with one branching widget.

Everything visual derives from the **lekana design system**. `colors_and_type.css` (included) is the source of truth for tokens and should be ported into the target app's styling layer (CSS variables, Tailwind theme, design-token file — whatever fits). The full brand brief is in `reference/lekana-brand-brief.html`.

## Fidelity

**High-fidelity.** Final colours, typography, spacing, radii, and interactions. Recreate the UI to match — but source every value from the design tokens below rather than eyeballing the prototype. Where the prototype hard-codes a hex, there is a matching token; prefer the token.

---

## Brand rules that constrain every decision

These are non-negotiable and easy to violate by reflex. Read before implementing.

- **Lowercase wordmark.** Always `lekana`, never "Lekana" — even sentence-start. The mark is `·|·` (dot-line-dot) followed by the word.
- **Type weights are capped.** Nunito (display) never above **600**. Figtree (body) never above **500**. No italics, ever. Headings are deliberately *light* (Nunito 300/400) — do not "fix" them to bold.
- **Two type families only:** Nunito (display/headings/labels/wordmark), Figtree (body/data/numbers). Both via Google Fonts.
- **No drop-shadows on cards. No borders as the primary separator.** Separation is created by colour/surface change, not edges. A 1px hairline (`--lk-hair`) is allowed for subtle dividers only.
- **No em dashes (—)** in copy. Use a full stop, comma, or rewrite. (They read as AI-generated.)
- **Tabular numerals** on all data/prices/stats (`font-variant-numeric: tabular-nums`).
- **Colour discipline:**
  - **Sunshine `#F5C400`** is a *focus accent*, used in small deliberate spots — never as a full-screen wash. In this site it appears as: (a) a rough brush-stroke highlight behind the emphasised phrase in each hero headline, (b) a few small focal cards, (c) the "Free for six weeks" pill. (Historical note: an earlier draft flooded whole hero screens in yellow — that was explicitly rejected. Keep yellow small and intentional.)
  - **Dark `#1A1200`** is used for high-contrast "closing" panels (the proof/stat band, the recommended pricing tier) and body text.
  - **Orange `#FC6722`** ("Bethink orange") is used for **primary buttons** sitewide in this design. *Note for the team:* the brand brief technically reserves orange for the login "Send request" action and the Bethink dot only — using it as the site-wide primary CTA was a deliberate client decision in this project. Implement as shown (orange primary buttons) but be aware it bends the documented rule.
  - **Teal `#1E4F4A` / Plum `#6B2B4B`** are the reconciliation-flow stepper accents. This design reuses them for the two Home opener answer cards (teal = the "yes/leak" path, plum = the "no/balanced" path). Same caveat: the brief scopes these to the reconciliation flow; their use on the marketing opener was a deliberate choice here.

---

## Design tokens

Ported verbatim from `colors_and_type.css`. Use these names/values in the target app.

### Colour

| Token | Hex | Role |
|---|---|---|
| `--lk-sunshine` | `#F5C400` | Focus accent only (highlights, small focal cards, pills). Never a full-screen background, never on buttons/borders/inputs. |
| `--lk-dark` | `#1A1200` | Primary text; dark contrast panels; dark canvas. |
| `--lk-cream` | `#F5EDE6` | Text/elements on dark or orange surfaces; soft surfaces. |
| `--lk-page-bg` | `#F4F4F0` | Resting page background. **Never pure white.** |
| `--lk-orange` | `#FC6722` | Primary buttons (this site). Hover → `#E85B18`. |
| `--lk-white` | `#FFFFFF` | Cards & modals only — not the page background. |
| `--lk-hair` | `#E5E3DC` | Hairline dividers (subtle, optional). |
| `--lk-muted` | `#6B7280` | Secondary text. |
| `--lk-step-teal` | `#1E4F4A` | Home opener "yes" answer card. |
| `--lk-step-plum` | `#6B2B4B` | Home opener "no" answer card. |
| `--lk-step-burnt` | `#B5471F` | (Reconciliation flow only — not used on this site.) |

### Type

- **Families:** `--font-display: 'Nunito'` · `--font-body: 'Figtree'`. Load via Google Fonts: `Nunito:wght@300;400;600` and `Figtree:wght@300;400;500`.
- **Scale:**

| Token | Size | Family / weight |
|---|---|---|
| `--t-hero` | `clamp(40px, 5vw, 56px)` | Nunito 300 |
| `--t-h1` | `40px` | Nunito 300 |
| `--t-h2` | `32px` | Nunito 400 |
| `--t-h3` | `22px` | Nunito 400 |
| `--t-label` | `11px`, `letter-spacing 0.12em`, uppercase | Nunito 600 |
| `--t-body` | `15px` | Figtree 400 |
| `--t-body-sm` | `13px` | Figtree 400 |
| `--t-data-lg` | `28px` (tabular) | Figtree 500 |
| `--t-data` | `18px` (tabular) | Figtree 500 |
| `--t-caption` | `12px` | Figtree 300 |

Headlines in the prototype run larger than `--t-h1` (e.g. `clamp(34px, 6vw, 64px)` for the result hero, `clamp(30px, 5vw, 52px)` for the opener question) with `line-height: ~1.16` and `letter-spacing: -1px`. Match the prototype's clamps.

### Spacing

`--sp-1: 4 · --sp-2: 8 · --sp-3: 12 · --sp-4: 16 · --sp-5: 24 · --sp-6: 32 · --sp-7: 48 · --sp-8: 64 · --sp-9: 80` (px).

### Radii

`--r-sm: 6 · --r-md: 8 · --r-lg: 12 · --r-xl: 16` (px). Buttons use 8 (`--r-md`), chips/badges use 6 (`--r-sm`), cards 12 (`--r-lg`), large panels (proof band, wedge) 16 (`--r-xl`).

### Motion

- `--ease-default: cubic-bezier(0.2, 0.7, 0.2, 1)` — use for all transitions.
- `--dur-fast: 120ms` (buttons) · `--dur-base: 200ms` (cards/answers) · `--dur-slow: 360ms`.
- No bounce/overshoot easings. Buttons darken on hover with a 1px press, they do **not** lift.
- Scroll-reveal: elements fade up `translateY(12px) → 0`, opacity `0 → 1` over `0.6s --ease-default`, triggered by an IntersectionObserver at threshold `0.12`. Reveal animations must degrade to visible (no permanent `opacity:0`) under reduced-motion / no-JS.

---

## Global chrome

### Top nav (`.topbar`)
- Fixed, full width. Left: wordmark `·|·  lekana` (click → Home). Right: text links — Home, Reconciliation, Insights, Pricing, Pilot, Contact, then a primary orange button "Start a pilot".
- Links: Figtree 500, 14px, `--lk-dark` at 0.7 opacity; active link is full-opacity `--lk-dark`. No underlines; hover raises opacity.
- On scroll past 30px the bar gets a solid `--lk-page-bg` background + a 1px `--lk-hair` bottom divider (no blur, no shadow).

### Footer
- Multi-column: brand blurb + link columns. Headings are Nunito 600, 11px, uppercase, `0.12em` tracking.
- Locked strings (use verbatim): tagline **"Finding the money you're losing. A day's work in 5 minutes."**, attribution **"a TimeWarp product by Bethink (Pty) Ltd"**.

### Mockup banner
- The prototype shows a small fixed "Mockup · {Page}" banner. **This is prototype scaffolding — drop it in production.**

---

## Views

The prototype is one HTML file with six `.page` divs; only one has `.active` at a time (client-side switching via `goto(pageId)`). In the target app these become **routes** (`/`, `/reconciliation`, `/insights`, `/pricing`, `/pilot`, `/contact`) unless the team specifically wants a single-page app. Switching scrolls to top and re-runs reveal animations.

### 1. Home (`/`) — two-question opener, then branched result
The signature interaction. Structure:

**Stage Q1** (`#stage-q1`, full-height centred):
- Eyebrow (label style): "Before the pitch, two questions".
- Question (Nunito 300, large): "Do you ever feel that **less money lands** than your sales say it should?" — the bold phrase carries the sunshine brush highlight (see "Hero highlight" below).
- Subtitle (Figtree, muted).
- Two answer cards side by side (see "Answer cards" component).
- Progress hint below.

**Stage Q2** (`#stage-q2`, hidden until Q1 answered):
- A "← back" link (returns to Q1).
- A context line that changes based on the Q1 answer:
  - Q1 = yes → "You're not imagining it. Now the one that matters."
  - Q1 = no → "Then let's test that. Here's the one that matters." (rendered in plum)
- Question: "When you reconcile, do you know every cent is accounted for?"
- Two answer cards.

**Result** (`#result`, hidden until Q2 answered): hero + the rest of the home content (proof band, "where the leak lives" cards, final CTA). The hero tag/title/lead are **set by JS based on the Q2 answer**:
  - Q2 = yes (can trace every cent): tag "Then you're rarer than most"; title "If you can trace every cent, **you're already ahead.**"; lead about proving totals balanced ≠ proving nothing was taken.
  - Q2 = no (not to the cent): tag "You're not imagining it"; title "You reconcile. **And you're still losing money.**"; lead about reconciliation confirming agreement, not existence.

Use the exact copy from the prototype JS (`answerQ1`/`answerQ2` in `lekana-site.html`, ~line 1007) — it is final.

Below the hero on the result: a **proof band** (dark panel, cream text, big tabular stat numbers + "leak-tag" chips), a "where the leak lives" section of small cards (one of which — "Actual cash" — is a sunshine focal card), and a final dark CTA.

### 2. Reconciliation (`/reconciliation`)
- Page hero: crumb label "Reconciliation", headline "The foundation. Without this, **the leak stays hidden.**" (bold phrase highlighted), muted lead.
- Body: step blocks (numbered, Nunito-light headings), report-style blocks with status tags (see "Status tags"), and a sunshine "Cash NEW" focal card.

### 3. Insights (`/insights`)
- Hero: crumb "Insights", headline "Once the data is clean, **the leak surfaces.**"
- Body: numbered insight cards (`.num-card`), one with the `.highlight` modifier rendered as a sunshine focal card; supporting copy in muted tone.

### 4. Pricing (`/pricing`)
- Hero: crumb "Pricing", headline "Two products. **Plain numbers.**", plus a small **sunshine pill** "Free for six weeks during the pilot".
- Two price cards. The **recommended** card (`.recommended`) is a **dark panel** (cream text) for contrast; its feature checkmarks are cream and its CTA button is orange. The base card is white with dark checkmarks and a quiet secondary button. Prices are Figtree 500, tabular.
- (Note: an earlier "Most businesses" ribbon badge was removed as too gimmicky — the recommended tier signals itself through the dark card + orange button. Do not reintroduce a ribbon.)
- FAQ list below (Nunito-light question headings).

### 5. Pilot (`/pilot`)
- Hero: crumb "The pilot", headline "The leak you feel. **The leak you find.**"
- A two-column "A fair trade" section: "What we ask of you" (white card) and "What you get" (**sunshine** focal card — its list text must be dark `rgba(26,18,0,0.82)` to stay legible on yellow). Week-by-week blocks. A "Free for six weeks during the pilot" framed line.

### 6. Contact (`/contact`)
- Hero: crumb "Contact", headline "Talk to **the people building it.**"
- Contact cards (person/role/contact lines). Roles in muted tone. A line "Looking to join the pilot? The application form is on the pilot page." (the "pilot page" is a link to `/pilot`).

---

## Components

### Primary button (`.btn-primary`)
- Background `--lk-orange` `#FC6722`, text `--lk-cream`, Figtree 400 15px, padding `14px 28px`, radius 8px, no border.
- Hover: background darkens to `#E85B18` (no lift). Active: `translateY(1px)`.
- Transition: `background var(--dur-fast) var(--ease-default), transform var(--dur-fast)`.
- **Contrast note:** cream-on-orange is ~2.5:1. It matches the login button spec but is light for body-text legibility; it's acceptable for short button labels. If the team wants stronger contrast, switching button text to `--lk-dark` raises it to ~5.8:1.

### Secondary / ghost button (`.btn-ghost`)
- Quiet: Figtree 400, dark text on cream/canvas, no fill emphasis. Used for the base pricing tier and secondary actions.

### Answer cards (`.answer-btn`) — Home opener
- White card, radius 12px, no border, generous padding. The **answer phrase itself is the colour** (no icon/dot):
  - `.yes` → text `#1E4F4A` (teal), `.no` → text `#6B2B4B` (plum), each with a small inline "→" arrow in the same colour and a muted-grey subtitle line beneath.
  - **Hover:** the whole card *fills* with its colour (teal or plum), text + subtitle turn cream, the arrow nudges right. Transition `--dur-base --ease-default`. Reads like a primary action.
- No borders, no circular dot/affordance — the coloured sentence does the work.

### Status tags (`.report-tag`, etc.)
- One unified chip style: Nunito 600, 10px, uppercase, `0.12em` tracking, radius 6px. **Not hue-coded by status.**
  - `live` / `new` → cream chip, dark text.
  - `soon` → transparent chip, muted text, 1px hairline border.

### Cards (`.card`, `.num-card`, `.report-block`)
- White surface, radius 12px, no shadow, no border. Headings Nunito **400** (light), body in muted/dark.
- **Focal (sunshine) variant:** background `--lk-sunshine`, all text dark (`--lk-dark` / `rgba(26,18,0,0.7–0.82)`). Used sparingly (one per section at most).
- **Dark (contrast) variant:** background `--lk-dark`, cream text. Used for the proof band and recommended pricing tier.

### Hero highlight (the sunshine brush)
The emphasised phrase (`<strong>`) inside each hero/question headline gets a **rough brush-stroke** sunshine highlight, not a flat rectangle. Implementation in the prototype: an inline SVG (feTurbulence + feDisplacementMap distorting a rounded `#F5C400` rect) encoded as a data-URI and applied as `background-image: ...; background-size: 100% 100%` on the `<strong>`, with `box-decoration-break: clone` so it wraps correctly across lines. Padding ~`0.1em 0.22em`. The text stays crisp (only the yellow shape is displaced).
- Recreate this as a small reusable component/utility (e.g. a `<Highlight>` wrapper or a `.brush` class). The exact SVG is in `lekana-site.html` (search `data-marker="marker"` / the `feTurbulence` data-URI).
- The prototype also contains a dev-only "Highlight style" switcher (Band/Rounded/Underline/Marker). **That switcher is prototype scaffolding — do not ship it.** Ship only the "Marker" (brush) treatment.

---

## Interactions & behaviour

- **View switching:** `goto(pageId)` toggles `.active` on `.page`, updates the active nav link, scrolls to top, re-inits reveals. In the target app, prefer real routes + the framework's router; preserve scroll-to-top and the reveal re-trigger on navigation.
- **Home Q1 → Q2 → result:** branch logic and copy as documented above; `answerQ1` sets the Q2 context line (and plum styling when Q1=no), `answerQ2` sets the hero tag/title/lead and reveals the result. "← back" returns Q2 → Q1. Navigating away and back to Home resets the flow (`resetHomeFlow`).
- **Scroll reveals:** IntersectionObserver, threshold 0.12, adds `.in`. Must be safe under reduced-motion and no-JS (content visible by default).
- **Sticky nav** state on scroll > 30px.
- **Smooth in-page scroll** for anchor jumps (`scrollToId`) — but do **not** use `scrollIntoView` if it interferes with the app shell; a controlled scroll is fine.

## State

Minimal, all client-side and ephemeral (nothing persisted, no fetching):
- `currentPage` (which view/route is active).
- Home flow: `q1Answer` ('yes' | 'no'), `q2Answer` ('yes' | 'no'), and a derived stage ('q1' | 'q2' | 'result'). These drive the branched hero content.
- Nav sticky boolean (scroll position).

There is **no backend, no form submission wired** in the prototype — CTAs are placeholders. Confirm with the team where "Start a pilot" / pilot application should POST.

## Assets

In `assets/`:
- `lekana-mark.svg` — dot-line-dot mark, dark (for light surfaces).
- `lekana-mark-cream.svg` — same mark in cream (for dark/sunshine surfaces).
- `bethink-logo.svg` — parent-company lockup (footer).

The prototype renders the wordmark mark as the literal text `·|·`; prefer the SVG mark in production where crispness matters. Fonts are Google Fonts (CDN) — no local font files.

## Files in this bundle

| File | What it is |
|---|---|
| `lekana-site.html` | The full design reference — all six views, the Home flow JS, the brush-highlight SVG, all final copy. Open in a browser to see intended behaviour. |
| `colors_and_type.css` | **The design tokens** — CSS variables + semantic type/surface classes. Port this into the target app. Source of truth for all values. |
| `reference/lekana-brand-brief.html` | The canonical brand brief — mark, colour rules, type rules, copy rules, locked strings. Read for anything not covered here. |
| `assets/` | Logos / marks (see above). |

## Implementation checklist

- [ ] Port `colors_and_type.css` tokens into the app's styling layer.
- [ ] Load Nunito (300/400/600) + Figtree (300/400/500).
- [ ] Build the six views as routes; one-at-a-time, scroll-to-top on nav.
- [ ] Sticky nav with scroll state (solid bg + hairline, no blur/shadow).
- [ ] Home two-question flow with branched hero copy (verbatim from prototype JS).
- [ ] Answer cards: coloured phrase, fill-on-hover, no dots/borders.
- [ ] Brush-highlight component for hero emphasis (ship Marker style only; drop the switcher).
- [ ] Cards: white/sunshine-focal/dark-contrast variants, no shadows/borders.
- [ ] Orange primary buttons (hover `#E85B18`); unified status chips.
- [ ] Tabular numerals on all data/prices.
- [ ] Scroll-reveal that degrades to visible (reduced-motion / no-JS).
- [ ] Remove all prototype scaffolding (mockup banner, highlight switcher).
- [ ] Confirm CTA/form destinations with the team.
- [ ] Verify no em dashes, no caps "Lekana", no shadows, no over-weight type crept in.
