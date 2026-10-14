# Proof: core idea and data model

## The idea

A workpaper exists to prove the return. So the unit of the product is not a cell or a schedule: it is **a number together with its proof**. Every one of the return's 627 numbers carries:

- **where it came from**: the exact field on the exact page;
- **how it was built**: its rule and its inputs, recomputed independently;
- **who verified it and how**: an auditor's tick mark recording the method, the person and the time;
- **what was changed**: original kept, who, why, and the tax effect;
- **what is still open**: checks, notes and questions.

Everything else is a view over that one structure:

- the proof map (every number as a square);
- the computation tree;
- the CPA schedules;
- the client portal;
- the examiner's response record.

A 20-year CPA gets what they already trust (tick marks, sign-offs, books-to-tax, a document index), with one difference: every figure is a live link to its evidence. A new hire gets a single habit. Click the number and the app shows you why.

The second idea: **the engine is a colleague, not an oracle.** The packet contains confident mistakes, so the workpaper runs its own checks. Each one rebuilds a figure from the documents, the client's words, the prior year or the agency records, and says how it did so.

## Data model

```
Packet (read-only, loaded exactly as delivered)
  documents ─ pages ─ printed_content
  extracted_values (doc, page, field, position, confidence)
  return_versions v1..v3 ─ lines (key, rule, inputs[], sources[])
  client answers · prior years · agency records · timeline · firm

Model (indexes built at load, never persisted)
  line graph:   inputs ↓ / parents ↑, topological order, sign of each input in every sum (learned from the engine's own numbers)
  evidence:     ev → lines it landed in (per version), doc → lines
  references:   ev-, D, doc:#page, qa-, msg-, call-, py:/, agency:/, asset:, ref: → one resolver

Event log (the only thing saved; append-only)
  verify · adjust (from, to, reason, effect parts) · approve · revert
  note (blocking) · reply · resolve · question · answer
  sign-off (snapshot of every value it covered) · judgment (authority required)
  finding status · document disposition · attachment · correction (SSN, extraction)
  assignment · time · step · sensitive-data view · standards · filing actions · undo

WorkState = replay(Packet, events)
  effective value(line) = engine + adjustment, flowed exactly through every sum/carry;
                          lines with tax logic marked "awaiting engine recompute"
  tax effect            = Σ change × version's per-dollar rate (what-if results used where they exist)
  sign-off state        = stale when today's values differ from its snapshot (reopens itself)
  readiness             = open errors, blocking notes, partner approvals, sign-offs, steps, client
```

### Why an event log

- **Nothing is ever overwritten.** That gives "adjust without losing the original", "compare versions", "freeze at filing; amend on top", undo (an `undo` event), and the 2028 audit trail, all from one structure.
- **Sign-offs can reopen.** Each one stores the values it covered and is compared on every replay.
- **People work at once.** Events broadcast to every open tab (BroadcastChannel) and persist to IndexedDB. A server is a swap of this one adapter, because the model, checks and views never see storage.
- **Roles are enforced where events are created**, through the permissions object: no self-review, partner approval for effects over 1,000, masking and view logging without clearance, and blocking notes stop filing.

### Real documents later

Highlights are keyed by `(document, page, extracted value)`, and each extracted value keeps the pipeline's normalized `position`. The viewer has two layers: printed text, and field positions on a page-shaped canvas. Replacing the simulated page with a real PDF or image only changes the bottom layer. Tracing, landing lists and verification stay as they are.

### Generic by construction

Nothing in the app names this client, a document id or an amount:
- The checks (`src/data/checks.ts`) find their evidence by document type, field and form line.
- Every schedule, reconciliation, outside-filing list, notice response, due-diligence item and client to-do is derived in `src/data/derived.ts`.
- The partner-approval threshold, variance thresholds, verification methods and retention period are read from the firm standards, which the administrator can edit.

Firm › Record › *Open another packet* loads any packet in this format, with its own event log. A test variant (different names, the SSN typo fixed, the duplicate mileage page removed) opens with no errors, and the two checks those errors triggered disappear on their own.

### Tradeoffs

- **Effects are estimates.** The engine can't be rerun, so I use exact arithmetic through sums, and rate estimates where tax rules apply, labelled as such. Where the engine ran a what-if, I use its result.
- **No server.** Persistence is local-first with a live tab sync and export/import, chosen because "run from a link" had to work with zero setup.
- **Checks are explicit functions over the packet**, not a generic rules engine. That's easier to audit, and each one states its method on screen.
