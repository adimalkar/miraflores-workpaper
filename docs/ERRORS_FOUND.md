# Errors found in the packet, and how the design surfaced them

Every item below is produced at load time by an independent check in `src/data/checks.ts`. It appears in **Checks** with its evidence, the method used and a proposed fix with the estimated tax effect. It also turns the affected line **red in the proof map** and flags the line in its proof panel.

"Engine silent" means the engine raised no diagnostic and reported high confidence. Effects are estimated at v3 rates (federal / California), or taken from the engine's own what-ifs where they exist.

## Errors the engine made with full confidence

| # | Error | Evidence | Fix | Effect (fed / CA) |
|---|---|---|---|---|
| 1 | **Theo's SSN transposed** on the organizer (…3309 vs …3390). This is the cause of the July e-file rejection R0000-504-02. | 2024 return as filed (D06), SS card (D71) | Correct the household SSN. Blocks filing until fixed. | Rejection avoided; CTC kept |
| 2 | **California taxes Texas wages.** CA-source wages = all box 16 (218,400), but Halvorsen kept CA as the work state through September by mistake. | Paystub at the move: CA wages 22,469 (D73); W-2 note (D09); qa-45 | CA-source wages 129,569 | 0 / −5,685 |
| 3 | **RSU sales taxed on full proceeds.** Noncovered lots N1, N3, N4 used basis 0. The engine matched the plan supplement for the ESPP lot but not for the RSUs, because the lot numbers differ (N1 vs RSU-2502). | Stock plan supplement (D11) matched by acquisition date; W-2 box 14 RSU 38,200 | Basis 19,100 / 19,100 / 9,420 | −15,536 / −1,619 |
| 4 | **1099-K counted twice.** Gross receipts = books 151,300 + the 12,400 1099-K, but the books already include Atlas's card payments, deposited gross. | Books detail (D15); 1099-NEC 142,000 + 9,300 no-1099 = 151,300 | Receipts 151,300 | −4,402 / −384 |
| 5 | **Self-employed health insurance 14,400** deducted although Erik was eligible for a subsidized plan through Ngozi's employers. | qa-25; the 2024 return took none for the same reason | Remove | +4,464 / +605 |
| 6 | **Mileage log page counted twice.** Page 3 is a second scan of page 2 (identical 22 trips; the page itself says so). Miles 11,800 → 8,100. | D23 pages 2–3; trip-by-trip comparison | Car expense 5,670 | +919 / +80 |
| 7 | **Home property tax includes the seller's share.** The full 2025 Travis bill (13,420) was paid from escrow, but the seller credited 6,912 for 1/1–7/7 at closing. | Buyer closing statement (D54); tax receipt (D58) | 6,508 (crosses below the SALT cap) | +1,462 / +332 |
| 8 | **Donated car at blue-book value (6,000).** The charity sold it for 2,900, and the deduction is limited to gross proceeds. This is the first item in the 2028 exam letter. | 1098-C box 4c (D66); qa-39 | 2,900 | +806 / +149 |
| 9 | **Mortgage payoff interest counted twice.** The Lonestar 1098 box 1 already includes the 11/20 payoff interest, and the payoff statement says so. | D55, D56 | −2,150 | +559 / +103 |
| 10 | **Bank sweep interest counted twice** (1,840). The sweep's 1099-INT is reproduced inside the brokerage composite for the same account ending 7731. | D28 p1, D29; the 2024 return reported it once | Remove the duplicate | −640 / −127 |
| 11 | **Fourth federal estimate from the client's memory.** "4,000 I think" on 01/14; the IRS transcript shows 3,000 on 01/15. | IRS transcript (code 670); EFTPS (D67); qa-41 | Estimates 12,000 | balance +1,000 / 0 |
| 12 | **A California estimate applied to the wrong year.** The 09/15/2025 Web Pay payment was designated tax year 2024, and FTB holds it as a 2024 credit. | FTB account; D68 | Estimates 10,500 (or request a transfer) | 0 / balance +3,500 |
| 13 | **Dependent-care provider EIN misread** at 97% confidence: 74-3829516 vs printed 74-3829156 (transposed). Form 2441 also names the first provider "Bright Oak Preschool" instead of "Bright Oak Kids Club". | D62, D61, 2024 return | Correct the extraction | Form 2441 accuracy |
| 14 | **Swedish interest converted at the 2024 average rate** (10.56) instead of 2025 (9.86). | D36; fx rates | 1,871 instead of 1,747 | +43 / +9 |

## Errors the engine half-saw

| # | Item | What the design adds |
|---|---|---|
| 15 | Meridian summary 71,965 vs detail 71,715 (engine: `BROKER_SUMMARY_DETAIL_MISMATCH`) | The 250 gap is lot **M18 on page 32, which was never read**. Proceeds 250, basis 310: added as a new 8949 line. |
| 16 | Crypto lot C6 at zero basis (engine: `DIGITAL_ASSET_BASIS_MISSING`) | The client later gave the cost (3,050, 03/15/2021, msg-07). That makes the lot **long-term**. Recorded as a judgment, since it rests on one bank statement line. |
| 17 | Home office area changed (engine: info) | The 2024 return used 300 sq ft (the prior preparer wrote "2 rooms combined?"). The room is 220: 2024 was overstated. |

## Judgment calls and completeness items

18. **HVAC 11,000 expensed as a repair.** It was a whole-system replacement, so the engine's own what-if (+3,633 / +896) supports capitalizing it.
19. **SEP over-contribution of 2,786.** A 6% excise applies unless it is withdrawn, and the Schedule C fixes raise the limit.
20. **The client says there is no prior IRA basis, but the documents show 7,000.** The documents govern. The engine was right; the questionnaire was wrong.
21. **Possible unfiled 2023 Form 3520** for the inheritance of more than 100,000 from Erik's mother. The prior preparer left this open and the 2025 questionnaire only asked about 2025.
22. **Questionnaire said no sales**, but the documents show 282 brokerage and 12 crypto disposals. Surfaced as a contradiction with the client's own answer.

Outside filings identified on the Filing page:
- FBAR
- late 1099-NECs to two contractors
- the 3520 above
- Oregon and Arizona composite returns (both covered)
- Ada's own return (consistent with this one)
- Woodworks' 1120-S

## Net effect

With items 1–14 applied, plus 15 and the mixed-use expense fix (phone 70%, internet 50%, Spotify personal), the federal result moves from a **4,220 balance due to a refund of about 6,585**. The California refund moves from 8,256 to about 11,246.

The scripted July "balance paid late, with interest and penalty" is therefore an artifact of the uncorrected return.

## What did *not* turn out to be an error

These are recorded so a reviewer doesn't repeat the work:
- All 260 Brightpath lots tie to the broker summary to the cent (ST 139,615.96 / LT 195,112.56; wash sales 1,326.05 / 1,580.24).
- Every 8949 lot's box agrees with its holding period.
- The Woodworks basis roll-forward in v3 (2,300 at the start of 2025, a 21,215 excess distribution) agrees with the 2023 K-1.
- The prior-year carryovers agree with the 2024 return.
- The excess social security credit recomputes exactly.
