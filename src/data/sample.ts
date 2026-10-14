import type { NewEvent } from '../store/store'

// Optional sample activity so a first-time viewer sees a workpaper mid-review: a preparer's
// verifications, a reviewer's blocking note, a question to the client and its answer.
// Each item is recorded as the person named, exactly as if they had done it in the app.
export const SAMPLE: { actor: string; events: NewEvent[] }[] = [
  {
    actor: 'st-01',
    events: [
      { kind: 'verify', target: 'F1040.1a', method: 'agreed_to_source_document', note: 'Agreed to Corvane and Halvorsen W-2 box 1; the phone photo (D10) is a duplicate of D09.', value: 212400 },
      { kind: 'verify', target: 'F1040.25a', method: 'agreed_to_source_document', note: 'Box 2 of both W-2s.', value: 25400 },
      { kind: 'verify', target: 'Sch3.11', method: 'recalculated', note: '6,944 + 7,316 − 10,918.20 (6.2% × 176,100).', value: 3342 },
      { kind: 'verify', target: 'SchD.6', method: 'agreed_to_prior_year', note: '2024 Schedule D and carryover worksheet (D07 p6).', value: -3200 },
      { kind: 'verify', target: 'SchD.14', method: 'agreed_to_prior_year', value: -11000 },
      { kind: 'verify', target: 'F8582.1c', method: 'agreed_to_prior_year', note: 'Unallowed 6,300 + 9,850 per 2024 Form 8582.', value: -16150 },
      { kind: 'verify', target: 'F8606.2', method: 'agreed_to_third_party_record', note: '2024 Form 5498 (D42) and 2024 Form 8606 line 14.', value: 7000 },
      { kind: 'verify', target: 'SchE.3A', method: 'agreed_to_source_document', note: 'Owner statement and 1099-MISC agree: 3,100 × 12.', value: 37200 },
      { kind: 'verify', target: 'SchA.11', method: 'confirmed_with_client', note: 'St. Brigid 1,500 confirmed by parish phone call and bank statement (check #2207), msg-08.', value: 3350 },
      { kind: 'time', area: 'wages', hours: 1.5, note: 'W-2s, stock plan statements' },
      { kind: 'time', area: 'investments', hours: 2.5 },
      { kind: 'time', area: 'business', hours: 3 },
      { kind: 'signoff', scope: 'wages', level: 'preparer', snapshot: {} },
    ],
  },
  {
    actor: 'st-02',
    events: [
      { kind: 'note', noteId: 'n-sample-1', target: 'SchE.9A', text: 'Insurance 1,850 rests only on the questionnaire. Get the declarations page or the payment record before I can clear this.', blocking: true, assignee: 'st-01', noteType: 'review' },
      { kind: 'note', noteId: 'n-sample-2', target: 'F6251.2i', text: 'ISO granted in CA, exercised after the move. Partner to decide on California-source AMT (Schedule P) before filing.', blocking: true, assignee: 'st-03', noteType: 'review' },
    ],
  },
  {
    actor: 'st-01',
    events: [
      { kind: 'question', qId: 'q-sample-1', to: 'client', target: 'SchE.9A', text: 'Please upload the 2025 landlord insurance declarations page for 1450 Fremont Way (you mentioned 1,850 paid directly to the insurer).' },
      { kind: 'question', qId: 'q-sample-2', to: 'client', target: 'F8949.H.C6', text: 'For the bitcoin moved to Coinhaven in June: can you upload the bank statement showing the 3,050 payment to CryptoNorth on 03/15/2021?' },
    ],
  },
  {
    actor: 'cu-02',
    events: [
      { kind: 'question.answer', qId: 'q-sample-2', text: 'Uploaded the March 2021 statement. The line is “CRYPTONORTH EXCH 3,050.00”.' },
    ],
  },
]
