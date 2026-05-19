# lekana.app website - content brief

**Version 1.0  ·  May 2026  ·  Bethink (Pty) Ltd  ·  Confidential**

This document explains the structure, copy, and rationale of the lekana.app
website. Read this before changing anything substantive. The structure is
deliberate - each section does specific work in a specific order.

---

## The core argument

The site argues one thing, in three beats:

1. **Reconciliation removes pain.** A day's work becomes five minutes.
   This is the known problem the operator already knows they have.
2. **Insights reveals opportunity.** Once the matching is done, the data
   tells you things you didn't know to ask about. This is the bigger
   product, but it cannot be sold first because the operator doesn't
   recognise the pain yet.
3. **It's working in the wild.** One pilot site has found R 42 000 to
   R 100 000 a month in leakage over six months. The number is the
   evidence the product earns its keep.

Everything on the page serves one of these three beats, in this order.

---

## Audience

Three audiences read the site at the same time. Each one finds what it
needs without the others crowding their path.

| Audience | Primary section | What they need |
|---|---|---|
| Fuel station operators (Pieter's network) | Reconciliation + How it works | Concrete proof this fits their workflow |
| Broader SMB owners | Modules + Pricing | Confidence that lekana isn't fuel-only forever |
| Investors / partners | Proof point + Insights | A market opportunity story with numbers |

The operator path is the load-bearing one. Investors are reading the
operator's page over their shoulder.

---

## Section-by-section

### Hero
**Goal:** Land the strapline. Earn 10 seconds of attention.

The strapline is locked: *A day's work in 5 minutes.* The sub-line is
locked: *lekana matches your bank transactions to your point-of-sale.
Across every bank. In five minutes. The things a spreadsheet hides,
lekana finds.*

The pre-alpha badge is the only acknowledgement of stage on this page -
honest, but not apologetic. Two CTAs: primary request access, secondary
ghost link to "See how it works" which anchor-scrolls to the How it
works section.

### Reconciliation
**Goal:** Show the base product is real and works. Sell on its own.

Copy heading: *Every transaction matched. Nothing missed.* (locked - this
is one of the brand's locked strings.)

Side-by-side with a real screenshot of the Summary tab. The 92% match
rate, the verified/investigate split, the surplus/shortfall card. This
screen is doing the heavy lifting - it shows the product works,
unembellished. The four bullet points beneath the body copy are concrete:
card/cash/debtor, configurable tolerance, every unmatched item flagged,
full audit trail.

### Human in the loop
**Goal:** Pre-empt the "is this a black box?" objection.

This section exists because the Transactions screenshot showed two
columns: "Lekana matched" and "Garth matched". That distinction matters.
A reconciliation tool that silently rejects what it can't match would
fail any auditor. lekana matches what it can; you confirm the rest;
nothing is silently discarded.

Heading: *You confirm what lekana cannot.* Strong because it reverses
the usual SaaS framing ("we automate everything") into something more
honest and more trustworthy.

Note for the dev: the screenshot shows "Garth matched" as a literal
column header in the live app. **Before this site goes public**, the
column should be renamed to something user-neutral like "User confirmed".
Flag to Garth.

### The pivot (dark canvas)
**Goal:** Signal a tonal change. Set up the Insights section.

One line: *Once everything matches, the data has more to tell you.*
Then: *Reconciliation answers a question you already ask. Insights
answers the questions you didn't know to ask.*

This is the bridge. The page shifts from selling a fix to revealing an
opportunity. The dark canvas signals "different temperature, different
product."

### Proof point (dark canvas)
**Goal:** Make Insights' value concrete with a real number.

For one operator, leakage over six months ranged from R 42 000 to
R 100 000 a month. Three stat tiles show: Lowest month, Highest month,
Continuous pilot duration. Honest framing in the closing note: *"Your
figures will differ. The patterns will not."*

This section is intentionally placed BEFORE the Insights deep dive.
That sequence is: claim, evidence, mechanism. By the time the operator
reads about the reports, they already believe the reports produce value.

### Insights
**Goal:** Show the reports are real and shipped, not vaporware.

Three live cards (Reconciliation overview, Attendants, Declined card
transactions) and two coming-soon (Trends, Pump performance). Then a
deep-dive on each live report with its real screenshot. Each deep-dive
follows the same pattern: copy block names what the report answers, the
screenshot proves the report exists.

The "Declined card transactions" deep dive is the strongest single sell
on the page - the screenshot shows actual fraud patterns (Card 0077 with
7 repeated decline attempts at R 4 819.90 each) with the system's
pattern-detection badges visible.

### How it works
**Goal:** Show the operator the flow they will use.

Four steps, each with the real screenshot from that step. The plum,
teal, burnt orange, sunshine stepper bands appear inside the screenshot
frames - this is the only place these colours appear on the marketing
site, and it shows that they're functional (state-of-flow indicators),
not decorative.

The copy of step 4 is intentional: *"Sunshine is earned."* This is a
brand statement. The yellow canvas is the payoff colour - you only see
it as a full surface in the app when the work is done.

### Modules
**Goal:** Signal that lekana is built to grow.

lekana fuel (live), lekana retail (soon), lekana butchery (soon). The
"one engine, three vocabularies" line frames this honestly - it's the
same matching engine, with different domain vocabularies and reports.

Important for the investor read: this section is what makes the company
a multi-vertical platform, not a fuel-only product.

### Bank coverage
**Goal:** Concrete trust signal.

FNB, ABSA, Standard Bank, Nedbank shown as plain large text. No logos,
no marks. The brand strictly avoids using third-party logos as
endorsement signals - the bank names alone do the work.

### Pricing
**Goal:** Anchor the value with a clear number.

Pre-alpha pricing (R 2 500 and R 5 000) shown as the current price with
the standard rate (R 5 000 and R 10 000) struck through above each.
A small "Pre-alpha 50% off" flag tops each card. A banner above the
cards explains the discount once, clearly.

The dark card (Reconciliation + Insights) is the visual anchor - same
shape as the base, in the primary brand colour, indicating "this is the
fuller offer." Both cards close with the same fine print line: *"Sites
are approved individually during pre-alpha."*

VAT-exclusive throughout. The per-station rate above 3 sites is
acknowledged but not specified yet (intentional - contact us is the
right call for sites 4+).

### Security and data
**Goal:** Quiet trust. Anticipate the auditor question.

Three short cards: hosting (South African data), access (Google OAuth,
no passwords), audit (everything logged). Plain, declarative, no
security theatre.

### Request access
**Goal:** Convert.

Same form pattern as the in-app login back-face (consistency matters -
once they sign in, they meet the same form). The "Subject to site
approval" note above the form sets honest expectations rather than
hiding the gate.

Orange Send request button. This is the only place orange appears on the
site outside the Bethink logo dot.

### Footer
**Goal:** Close gracefully. Bethink credit.

The "a TimeWarp product by bethink (Pty) Ltd" credit is locked language.
Two link columns: Product anchors back into the page, Company links to
external pages.

---

## Copy rules in force

These come from the lekana design system. They apply to any future
edits.

- **lekana is always lowercase.** Even at the start of a sentence.
- **No em dashes.** Plain hyphens, or rewrite.
- **No AI-tell words:** genuinely, straightforward, delve, leverage,
  unlock, seamless, effortless, elevate.
- **No exclamation marks.** Anywhere.
- **No filler questions.** Don't write "Ready to get started?". Write
  "Get started" or rewrite the sentence.
- **No italic, no bold.** The brand uses weight and colour, not slant.
- **Money is `R 5 000`** with spaces as thousand separators, comma for
  decimals where present. Tabular numerals everywhere data lives.
- **It is "bank and POS"**, not "bank statements". The product
  reconciles transactions, not statements.
- **It is "matched" or "needs review"**, never "resolved" or
  "processed".

---

## Locked strings (quote verbatim, never paraphrase)

- Strapline: *A day's work in 5 minutes.*
- Description: *lekana matches your bank transactions to your
  point-of-sale. Across every bank. In five minutes. The things a
  spreadsheet hides, lekana finds.*
- Reconciliation H2: *Every transaction matched. Nothing missed.*
- Bank coverage H2: *Works with FNB, ABSA, Standard Bank and Nedbank.*
- Sub-brand: *a TimeWarp product by Bethink (Pty) Ltd*
- Module names: *lekana fuel · lekana retail · lekana butchery*

---

## Open items (to be decided)

1. **Per-station pricing above 3 sites.** Not on the site yet. Decide
   the rate and update the pricing fine print.
2. **The "Garth matched" column.** Live in the app currently. Rename to
   a user-neutral label before this site goes public.
3. **Terms of use and privacy.** Need to be written and hosted at
   `/terms.html` and `/privacy.html`. Terms content exists in the login
   handover doc.
4. **The proof point figures.** Confirm with Pieter that the R 42-100k
   range is OK to share publicly (anonymised). The note "shared with
   their permission" needs to be true.
5. **OG share image.** Needs producing. Suggested: lekana mark + word-
   mark + strapline on Sunshine canvas, 1200x630.

---

## Future expansion (not in v1)

These are intentionally not on the page. Add them later when there is
real material.

- Case studies / operator testimonials
- Press / coverage section
- Blog or operator insights articles
- Detailed FAQ page (the FAQ schema is already in `<head>` - render to
  page when content grows)
- Demo video
- Multi-language (Afrikaans, isiZulu) for the operator base

---

## Contacts

- **Product / brand:** Garth - garth@bethink.co.za
- **Operations:** Pieter - pieter@molo.page

When in doubt, ask. Drift in either copy or design is more expensive to
unwind than a five-minute check.
