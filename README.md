# Proof: a web-native tax workpaper

A working workpaper for the Okafor-Lindqvist 2025 return (Form 1040 + California 540NR), built on the Miraflores packet exactly as delivered.

- **Core idea and data model:** [`docs/CORE_IDEA.md`](docs/CORE_IDEA.md)
- **Errors found, and how the design surfaced them:** [`docs/ERRORS_FOUND.md`](docs/ERRORS_FOUND.md)
- **Walkthrough script for the video:** [`docs/WALKTHROUGH.md`](docs/WALKTHROUGH.md)

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/ — host anywhere (relative paths)
```

The packet is served unmodified from `public/packet/okafor_lindqvist_2025_packet.json` and fetched at startup.

## What's where

| Need from the brief | Where it lives |
|---|---|
| Trace any number to its source; any document to where it landed | Click any number → **proof panel** → source card → **document viewer** (field highlighted; "where this document landed"; disposition for unused documents) |
| How each number was verified | Tick marks by method; bulk verify with undo; field-level verification in the document viewer |
| Show how a number was built; reconcile; checks that don't trust the engine | Proof panel "How it was built" (re-footed independently), **Checks**, Schedules › Books to tax, Payments, Sales detail |
| Large detail without swamping review | Computation tree shows exceptions first; sales detail is virtualized (295 lots) |
| Adjust without losing the original; tax effect; what-ifs; bulk with undo | Adjust dialog, Review › Adjustments, Checks › Apply fixes, Judgments & elections (engine what-ifs), toast Undo / Ctrl-Z |
| See changes live; since I last looked; compare versions | Open two tabs as two people; top-bar "Since you last looked"; Season › Compare (v1/v2/v3/workpaper) |
| Judgment, elections, due diligence, variances, completeness | Review › Judgments (authority required), Form 8867 checklist, Schedules › Return vs last year, Documents (accounted for), Filing › Outside filings |
| People: questions, blocking notes, sign-offs that reopen, roles, assignments, client approval | Review tabs; role switcher (bottom-left); client portal (switch to Ngozi or Erik) |
| Filing and after | Filing: extension → approval → 8879 → transmit (rejects if Theo's SSN is still wrong) → freeze → amend; client copy; Letter 566 response record; plan 2026 / roll forward |
| Firm | Firm: standards editor (admin), sensitive data masking + view log, time vs budget, status, export / import / retention |

## Stack and why

- **React + TypeScript + Vite.** A static build, so it runs from any link.
- **Tailwind**, with a small set of design tokens.
- **Motion**, used for meaning, not decoration:
  - tick marks draw themselves when you verify;
  - the highlighter sweeps across the traced field;
  - panels and lists move with springs.
- **cmdk** for the search palette. Typing an amount finds every line and document field with that value.
- **zustand** holding an append-only event log, persisted to IndexedDB and synced live across tabs with BroadcastChannel.
- **@tanstack/react-virtual** for the 295-lot sales detail.

## How AI was used

Built with Claude Code (Claude Opus) as a pair programmer.

**I directed and reviewed:**
- the product idea;
- which errors matter and how they should surface;
- the review rules;
- every screen.

**Claude:**
- read the packet;
- wrote the error-finding scripts;
- generated most of the code;
- drove a headless browser to test flows end to end.

**Hand-checked against the packet:**
- every figure in `docs/ERRORS_FOUND.md`;
- the reconciliations: Brightpath ties to the cent, every lot's holding period, the S-corp basis roll-forward, and books to Schedule C.
