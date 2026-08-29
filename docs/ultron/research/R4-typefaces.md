# R4 — Typefaces for The Countdown Room

## Question + affected tasks

**R4:** Which specific openly-licensed typefaces best deliver each of the three type roles — (1) engraved-placard caps for labels, (2) tabular avionics numerals for all live numbers with zero layout shift, (3) quiet grotesk for long-form prose on dark ground?

**Affected tasks:** T8 (direction contract + tokens; "faces from R4"), T9 (write surface; tabular numerals, no layout shift while counting). Secondary: T11 (archive timestamps), T10 (SIGNAL LOST board).

**Delegation record:** track subagent for `deep-research-supreme`, 2026-08-28. **Priority:** P1. **Status:** committed pending synthesis.

## Constraints & criteria

Binding (design brief §3, §7; scoping constraints):

- Open license only — SIL OFL 1.1 or equivalent; **no paid fonts, no runtime Google Fonts dependency**; must be statically bundleable in the Vite build.
- Available in the weights/styles the design needs; woff2 obtainable (shipped or convertible — conversion verified locally with fontTools 4.63).
- Avoid the training-data default cluster: Inter/Roboto kin as identity faces; the cream-and-serif cliche.
- Numerals role is hard-gated: digits MUST be same-advance (monospaced digits or a real `tnum` GSUB feature) — verified at the binary level, not from marketing copy (method below).
- Prose role: multi-thousand-word sessions on charcoal `#14161a` — needs comfortable x-height/apertures at 17–19px, dark-screen comfort.
- Small-size rendering: hinting tables (`fpgm`/`prep`/`cvt`) inspected as a crispness proxy.

**Verification method (this record's core evidence):** the exact self-hostable TTFs from the `google/fonts` GitHub repo (each family directory ships `OFL.txt`) and the DSEG v0.46 release zip were downloaded 2026-08-28 and inspected with fontTools: GSUB feature tags enumerated, per-digit advance widths read from `hmtx`, hinting tables listed, x-height/cap from `OS/2`, and latin-subset woff2 produced with `fontTools.subset` (`U+0020-007E` + typographic punctuation, all layout features, hinted) to measure true bundle cost. These are primary-source artifacts, not specimen-page claims.

## Options considered

### Role 2 — Tabular avionics numerals (all live numbers)

| Candidate | Foundry / author | License (exact) | Weights | Tabular support (verified) | Small-size hinting | woff2 (latin subset) |
|---|---|---|---|---|---|---|
| **B612 Mono** | B612 Project (Airbus-initiated; design Intactile DESIGN w/ ENAC, Univ. de Toulouse III); © 2012 The B612 Project Authors | SIL OFL 1.1 (font files; repo materials additionally EPL-2.0/EDL-1.0); **no RFN** | 400, 700 + italics | **Monospaced family — all digits 1300/2000 upm, equal by construction** | Yes (`fpgm`+`prep`+`cvt`) + repo: "benefited from a complete hinting on all the characters" | 12.4 KB (400), 11.2 KB (700) |
| **IBM Plex Mono** | IBM Corp. (type: Mike Abbink et al.) | OFL-1.1 (repo sidebar + README "following the Open Font License (OFL)"); no RFN | 100–700 (8 weights) + italics | Monospaced — all digits 600/1000; also ships `zero` feature (slashed/dotted zero: '0' = 3 contours vs 'O' 2) | Yes (fpgm+prep+cvt) | 9.9 KB (400), 10.8 KB (600) |
| **Saira** | Omnibus-Type (Héctor Gatti & team) | OFL 1.1 (foundry page: "SIL Open Font License, 1.1"); no RFN | VF wght 100–900 + wdth axis; 9 static weights | `tnum` present **in the variable file only** (tnum tabular width 620 for all digits — verified in GSUB); GF static files (e.g. Saira SemiCondensed Medium) **lack tnum** | VF lightly hinted (`prep` only) | 77.7 KB (full VF subset) / 13.0 KB per static |
| DSEG14 / DSEG7 | keshikan | OFL 1.1 ("Any font files(*.ttf, *.woff, *.sfd) are licensed under the SIL OPEN FONT LICENSE Version 1.1"); **RFN "DSEG"** | Light/Regular/Bold + italics per style (Classic/Modern/Mini × 7seg/14seg) | All digits 816/2048 equal; "Colon and Space have same width", "Period has zero width" (repo) | cvt only (segment glyphs don't need it) | 5.7–5.8 KB shipped per weight (woff2 shipped since v0.42) |

### Role 1 — Engraved-placard caps (tracked uppercase labels)

| Candidate | Foundry / author | License | Weights | Notes (verified) | woff2 (latin subset) |
|---|---|---|---|---|---|
| **Michroma** | Vernon Adams (© 2011, GF since 2011-03-30) | OFL 1.1; no RFN | 400 only | Eurostile/Microgramma-lineage extended caps — the actual engraved-placard idiom; hinted (fpgm+prep+cvt); digits near- but NOT exactly tabular (1948/1984/2048 at upm 2048) — acceptable because placard labels are static | 11.4 KB |
| Saira (wdth axis) | Omnibus-Type | OFL 1.1 | 100–900 × widths | Extended caps + tnum available in VF; press-grotesk flavor, less instrument; statics lack tnum | 77.7 KB (VF) |
| Chakra Petch | Cadson Demak | OFL 1.1 | 300–700 + italics | Squared/technical, but **no tnum, proportional digits** (628/358/550…); display-flavor | 13 KB-ish |

### Role 3 — Quiet prose grotesk (the dying text)

| Candidate | Foundry | License | Weights | Tabular (verified) | x-height | Hinting | woff2 (latin subset) |
|---|---|---|---|---|---|---|---|
| **Source Sans 3** | Adobe (Paul D. Hunt); © 2010–2020 Adobe, **RFN 'Source'** | OFL-1.1; upstream ships OTF/TTF/VF/WOFF/WOFF2 + CSS | VF 200–900 + true italics | **Tabular by default** — all digits 472/1000; `pnum` switches to proportional | 0.478 | GF VF: `prep` only; upstream statics historically fully hinted | 34.5 KB (VF, all weights) |
| Public Sans | USWDS (© 2015 Public Sans Project; fork of Libre Franklin) | OFL 1.1 ("Public Sans is licensed under the SIL Open Font License, Version 1.1") | 100–900 + italic | `tnum` present (README section "Tabular figures (monospaced numerals)"; confirmed in binary) | 0.517 | `prep` only (VF) | 17.6 KB (VF) |
| Atkinson Hyperlegible | Braille Institute of America (© 2020) | OFL 1.1 (GF OFL.txt; no RFN) | 400, 700 + italics only | `tnum` present (binary); slashed/dotted zero ('0' 3 contours vs 'O' 2) | 0.496 | fpgm+prep+cvt | 10.8 KB (400), 11.0 KB (700) |
| Space Grotesk | Florian Karsten | OFL 1.1 | VF 300–700 | `tnum` present (binary); default proportional | 0.486 | `prep` only | ~15 KB |

## Recommendation & rationale

**One face per role — Michroma / B612 Mono / Source Sans 3. Total ≈ 69 KB woff2** (Michroma 11.4 + B612 Mono 400/700 23.6 + Source Sans 3 VF 34.5).

1. **Placard caps: Michroma 400** — the only candidate that *is* the engraved-placard idiom (extended geometric caps, Microgramma lineage — the face of real aerospace panel lettering), OFL, hinted for small sizes, one weight is a feature not a bug for labels (placards don't mix weights), 11.4 KB. Static labels → its non-exact digit widths never cause layout shift.
2. **Avionics numerals: B612 Mono 400 + 700** — "designed and tested to be used on aircraft cockpit screens" (repo README, verbatim; Airbus-initiated research with ENAC/Université de Toulouse III to "improve the display of information on the cockpit screens"); monospaced digits verified equal-advance; "complete hinting on all the characters" (verified: fpgm+prep+cvt); largest x-height of the numeral candidates (0.55); no RFN; 23.6 KB for both weights. The numerals carry the room's authenticity: real cockpit DNA, not a corporate mono cosplay. (If >2 weights or slashed zero ever matter: IBM Plex Mono, 9.9 KB/weight, `zero` feature.)
3. **Prose: Source Sans 3 VF (200–900) + italic** — README: "designed to work well in user interface (UI) environments"; Adobe-maintained with upstream WOFF2/VF/CSS releases; **digits tabular by default** (verified) — free insurance that prose-area numbers (archive lists, wind-down timestamps) never shift, effectively letting this family back up the numerals role; full weight range gives the wind-down/edit states room; 34.5 KB for the whole VF. Not Inter/Roboto kin; not a serif — sidesteps the cream-and-serif cliche while staying quiet. At 18–19px prose on `#14161a` its 0.478 x-height reads comfortably (dark-ground convention is +1–2px over print sizes anyway).

**Optional instrument accent (condition-gated, not a fourth role):** DSEG14 Classic Regular (+ Bold) at 5.7–5.8 KB/weight shipped woff2 — IF R2/T9 conclude the reduced-motion numeric countdown or the SIGNAL LOST board wants a genuine LCD-instrument readout rather than flap-grotesk digits. Do NOT use DSEG for the animated flap countdown (segment-LCD and split-flap are different instruments; mixing them breaks the metaphor). Note RFN "DSEG" on modified builds.

**Strongest alternative set:** Saira VF (labels + tnum numerals from one 77.7 KB file — viable if a multi-weight label system ever outranks Michroma's single-weight authenticity; requires shipping/instancing the VF, since GF statics lack tnum) / IBM Plex Mono / Public Sans (or Atkinson Hyperlegible for a legibility-forward prose voice).

## Evidence

- **B612 / B612 Mono** — repo: https://github.com/polarsys/b612 — README verbatim: "B612 is an highly legible open source font family designed and tested to be used on aircraft cockpit screens"; "In 2010, Airbus initiated a research collaboration" (ENAC, Université de Toulouse III) "to improve the display of information on the cockpit screens"; "benefited from a complete hinting on all the characters"; license: "the terms of the Eclipse Public License v2.0 and Eclipse Distribution License v1.0 and the SIL Open Font License v1.1" (font files OFL 1.1 — confirmed by https://github.com/google/fonts/tree/main/ofl/b612mono `OFL.txt`: "Copyright 2012 The B612 Project Authors"). Self-hostable files: `ofl/b612mono/B612Mono-{Regular,Bold,Italic,BoldItalic}.ttf`.
- **IBM Plex** — https://github.com/IBM/plex — sidebar "OFL-1.1 license"; README: available "following the Open Font License (OFL)". Files: `ofl/ibmplexmono/` (16 statics, Thin–Bold).
- **Michroma** — `ofl/michroma/OFL.txt`: "Copyright 2011 The Michroma Project Authors" (https://github.com/googlefonts/Michroma-font); GF `date_added: 2011-03-30`, designer Vernon Adams.
- **Source Sans 3** — https://github.com/adobe-fonts/source-sans — sidebar "OFL-1.1 license"; README: "designed to work well in user interface (UI) environments", designer Paul D. Hunt, release folders OTF/TTF/VF/WOFF/WOFF2 + CSS. `ofl/sourcesans3/OFL.txt`: "Copyright 2010-2020 Adobe … with Reserved Font Name 'Source'".
- **Public Sans** — https://github.com/uswds/public-sans — README: "Public Sans is licensed under the SIL Open Font License, Version 1.1"; section "Tabular figures (monospaced numerals)"; **"Public Sans as a font is not currently being actively developed or maintained"**; v2.001; fork of Libre Franklin.
- **Atkinson Hyperlegible** — `ofl/atkinsonhyperlegible/OFL.txt`: "Copyright 2020 Braille Institute of America, Inc."
- **Saira** — https://www.omnibus-type.com/specimen/saira/ — "SIL Open Font License, 1.1"; designers Héctor Gatti & Omnibus-Type Team; 18 styles; foundry page lists no feature set (tnum confirmed only via binary: present in `Saira[wdth,wght].ttf`, absent from statics).
- **DSEG** — https://github.com/keshikan/DSEG + https://www.keshikan.net/fonts-e.html — "Any font files(*.ttf, *.woff, *.sfd) are licensed under the SIL OPEN FONT LICENSE Version 1.1"; styles: DSEG7/DSEG14 × Classic/Modern × Mini, each Light/Regular/Bold + italics ("More than 50 types are available"); "Colon and Space have same width", "Period has zero width"; WOFF2 shipped since v0.42; latest stable v0.46 (2020-03-15), latest pre-release v0.50beta1 (2020-12-31); RFN "DSEG".
- **OFL text/policy** — https://openfontlicense.org/ (SIL; embedding/bundling permitted, modification permitted, RFN constrains renaming of modified versions).
- **Binary verification (2026-08-28, fontTools 4.63 on the above files):** B612 Mono & B612 — all 10 digit advances identical (1300/2000); IBM Plex Mono — identical (600/1000), `zero` feature, slashed zero (3-contour '0'); Source Sans 3 — identical (472/1000), default-tabular, `pnum` present; Saira VF — `tnum` GSUB maps every digit to width 620; GF static Saira SemiCondensed — no `tnum`, proportional digits; Public Sans — `tnum` present; Atkinson — `tnum` present; Space Grotesk — `tnum` present; Michroma — no `tnum`, digits 1948/1984/2048; Chakra Petch — no `tnum`, proportional; DSEG14/7 — all digits 816/2048. Hinting tables: fpgm+prep+cvt for B612/B612Mono/PlexMono/Michroma/Atkinson; prep-only for the GF VFs (Public Sans, Source Sans 3, Space Grotesk); x-heights: B612 0.550, Michroma 0.562, Public Sans 0.517, Plex Mono 0.516, Atkinson 0.496, Space Grotesk 0.486, Source Sans 3 0.478.

## Tradeoffs / risks / confidence

- **Michroma single weight (400):** labels get one voice — fine for placards, but no semibold emphasis path; if a label hierarchy ever needs weight, fall back to size+tracking or swap to Saira VF (cost: +66 KB and tnum-via-VF complexity). Michroma's caps are wide: keep placard labels ≤ ~24 chars at 11–12px. Confidence: high.
- **B612 Mono two weights only; unslashed zero ('0' = 2 contours, like 'O'):** in an all-caps HUD context 0/O collision is unlikely (numbers appear in numeric contexts); if it bites, IBM Plex Mono swaps in 1:1 (same metrics philosophy, `zero` feature). B612's dual EPL/EDL/OFL repo packaging is a non-issue: the font files themselves are OFL 1.1 (OFL.txt ships with the GF distribution). Confidence: high.
- **Source Sans 3:** (a) GF VF build is prep-only hinting — mitigate by serving prose at 18–19px where hinting is largely irrelevant on modern rasterizers, or by taking Adobe's upstream hinted statics (400/600 subsets ≈ 2×~15 KB); (b) RFN 'Source' — bundle the unmodified files, or if subsetting, strip/replace internal name records (OFL §1); (c) lowest x-height of the prose finalists — mitigated by dark-ground size bump; if review finds it small, Public Sans (0.517, tnum, OFL, 17.6 KB VF) is a drop-in alternative at the cost of an unmaintained project and a more familiar government-grotesk flavor. Confidence: medium-high (prose comfort is the one criterion not machine-verifiable; flagged for T9 visual check).
- **Saira statics trap:** if Saira is ever adopted, `tnum` only exists in the variable file — record stands so nobody ships a static and loses tabular figures silently.
- **DSEG:** RFN "DSEG" + beta v0.50 line — stick to stable v0.46. Segment faces read as "instrument" only at display sizes; never body text.
- Overall confidence: **high** on licenses, tabular behavior, sizes, weights (all verified against the shipped binaries); medium-high on aesthetic fit (single reviewer, unrendered at final sizes — T8/T9 will see it live).

## Implementation consequences & plan updates

- **T8 (tokens):** add font tokens — `--font-placard: 'Michroma'` (labels; uppercase; letter-spacing ≈ 0.08–0.12em; 10–12px; color bone), `--font-numeric: 'B612 Mono'` (all live numbers; `font-variant-numeric: tabular-nums` is a no-op but harmless belt-and-braces since digits are monospaced by construction), `--font-prose: 'Source Sans 3'` (17–19px/1.6–1.7, weight 400 body). Numerals token also carries `font-feature-settings` note. Self-host under `src/assets/fonts/` (or `public/fonts/`) as unmodified woff2 + `OFL.txt` copies per family directory — no runtime Google Fonts fetch, satisfying the static-bundle constraint. Total font payload ≈ 69 KB woff2 (≈ 81 KB with optional DSEG14 pair).
- **T9 (write surface):** countdown + inactivity countdown + any timing readout use `--font-numeric`; per-digit fixed-width rendering enables the flap-digit cells (each cell can assume uniform digit advance — 0.65em advance in B612 Mono) and guarantees the reduced-motion numeric path has zero layout shift; prose column uses `--font-prose` at 18px minimum on `#14161a`. If R2/T9 choose an LCD readout for reduced-motion/SIGNAL LOST, add DSEG14 Classic (5.7 KB) — condition recorded above.
- **T10/T11:** archive timestamps + flight-log numerals in B612 Mono (tabular, right-aligned against margin per j-card raised line); excerpts in Source Sans 3.
- **Bundling mechanics:** convert GF TTFs (or Adobe upstream) to woff2 unmodified (fontTools `--flavor=woff2` without subsetting) to keep names/RFN clean; subsetting is optional size trim (~20 KB total saved) and requires RFN care only for Source Sans/DSEG.
- No changes to plan task graph; R4 acceptance for T8 ("faces licensing confirmed for open-license bundling") is satisfied by this record.
