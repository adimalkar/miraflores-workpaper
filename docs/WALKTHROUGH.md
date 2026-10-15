# Video walkthrough: script (about 8–10 minutes)

Start in a fresh browser (or Firm › Record › Reset demo). Keep a second tab ready.

1. **Today (45 s).** The greeting, the role-aware 'Up next' queue with inline *Apply fix*, the bottom line and the path to filing. Then press `f` for focus mode: `a` applies a fix and advances; `Tab` switches to *Verify numbers*, where `v` verifies a number against its highlighted source field.

1b. **The thesis: the proof map on Today.**
   - "The engine's output is a claim. The workpaper's job is the proof."
   - Point at the proof map: 627 squares, one per number, colored by proof state, and the 31 red ones the engine never flagged.
   - Point at "Where the return stands" and "What stands between this return and filing".

2. **Trace a number (1 min).**
   - Press ⌘K and type `1840`: every line and document field with that value.
   - Open SchB.1.1. Show "How it was built", the source card with confidence, and History (2024 → v1 → v2 → v3).
   - Click the source: the document opens and the highlighter lands on box 1.
   - Show "Where this document landed".
   - The independent check is already pinned to this line: the same 1,840 is on two lines.

3. **Checks that don't trust the engine (2 min): Checks.**
   - Theo's SSN: three sources compared, and this is exactly why the real e-file was rejected in July.
   - California taxing Texas wages: the paystub at the move date versus box 16.
   - RSU basis: why the engine matched the ESPP lot but not the RSUs (lot numbers differ). Match by date.
   - Mileage: page 3 is a second scan.
   - Point at "engine silent" and "How this check works" on each.
   - Apply one fix and show the toast Undo. Then apply all clear-cut fixes in one batch.

4. **What changed, exactly (1 min).**
   - Overview: AGI and the California figures move exactly, because sums flow through the line graph.
   - Tax lines show "awaiting engine recompute", with the estimate from per-dollar rates.
   - Explain the tradeoff: the engine can't be rerun, so arithmetic flows exactly and tax logic is estimated, never silently guessed.
   - Schedules › Books to tax still reconciles to 0.

5. **People (1.5 min).**
   - Open a second tab and switch it to Daniel (reviewer). Add a blocking note on a line.
   - In the first tab: the badge "Since you last looked", the presence avatar and the note on the line.
   - Review › Adjustments: switch to Helen (partner) and approve over-1,000 changes in bulk.
   - Sign-offs: Daniel can't sign an area he adjusted. Sign the return.
   - Adjust any line: the sign-off reopens and says what moved.
   - Ask the client a question, switch to Ngozi in the portal, answer it. The answer is now evidence on the line.

6. **Filing and after (1.5 min).**
   - Send for approval: it is blocked until the steps are done. Show the Form 8867 due diligence checklist.
   - Ngozi signs the 8879 with her PIN. Helen transmits.
   - Show both outcomes: if the SSN fix was dismissed, the IRS rejects with R0000-504-02; with it, the return is accepted and the workpaper freezes.
   - Open an amendment on top of the frozen return.
   - Letter 566 (2028): build the response record. Noncash gifts and receipts reconciled to the 1099s, each document one click away.
   - Plan 2026: the safe harbor from this return.

7. **Firm (30 s).**
   - As Marcus (no clearance), SSNs are masked and reveal is disabled.
   - As Jo (admin), edit the variance threshold.
   - The view log, time against budget, and export of the event log.

8. **Tradeoffs (1 min).**
   - **Local-first event log instead of a server.** It runs from a link, works offline, and syncs tabs live. One adapter swap moves it to a server.
   - **Explicit checks instead of a rules DSL.** Each states its method and is auditable.
   - **Simulated documents.** Highlights are keyed by page and position, so real PDFs drop in.
   - **What I'd do next:**
     - recompute through a real engine API;
     - per-firm check libraries;
     - true multi-user sync (CRDT or server);
     - a PDF renderer behind the same viewer.
