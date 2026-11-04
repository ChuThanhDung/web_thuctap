---
target: toàn bộ ứng dụng
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:E:\\Group 7\\P-007\\frontend\\src\\App.jsx"
target_fingerprint: "sha256:88000912ee6646b962b9dbf662fb60d94626d15288e3d854869fe8349c4a2d39"
target_path: "E:\\Group 7\\P-007\\frontend\\src\\App.jsx"
timestamp: 2026-11-04T10-36-24Z
slug: frontend-src-app-jsx
---
Method: dual-agent (A: design review · B: detector + browser)

## Design Health Score: 29/40 (Good)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Overview "Chưa đủ chứng từ 0" while /upload shows a batch needing 3 documents (empty batches drop out of the count) |
| 2 | Match with real world | 3 | Machine batch codes; English leaks ("Upload bổ sung", "AI trích xuất") |
| 3 | User control and freedom | 3 | No undo of level-1 approval; A auto-advances away from what was just signed |
| 4 | Consistency and standards | 2 | Amber used for missing documents and low AI quality; ISO dates on /upload; uppercase "BƯỚC 1 / 2"; left-aligned prices; two brand marks |
| 5 | Error prevention | 3 | Threshold changes save with no confirmation; quantity tolerance and "100.000 VND" example contradict the published rules |
| 6 | Recognition rather than recall | 3 | Icon-only rail by default, even for a 4-item menu |
| 7 | Flexibility and efficiency | 3 | No bulk level-1 approve, no shortcut help, kbd hints only ≥1280px |
| 8 | Aesthetic and minimalist | 3 | /upload: three static doc-type cards compete with the dropzone |
| 9 | Error recovery | 3 | Small title-only buttons; generic "Vui lòng thử lại" fallbacks |
| 10 | Help and documentation | 3 | Guide, checklist and sample set exist; no inline help at decision points |

## Design specificity
Specific to the product: copy chips in fixed PO·HĐ·GRN order, three-copy table with nudged cells, voucher signature strip, neutral plain-language results, landing stations demonstrating the real mechanism. Generic slips: AdminConsole 4-up StatCard grid (banned by DESIGN.md), ThresholdConfig icon tiles, overview bar chart with 2-3 data points, Upload doc-type cards. Brand mark split: brass Check on public pages vs Files mark on login/signup and the app.

Detector: CLI 0 findings on frontend/src. In-page overlay (CSP bypassed in the test browser): line-length on /huong-dan (5, GuidePage.jsx:67 has no max width) and / (1, Landing.jsx:369 max-w-3xl); stragglers (low value); nested-cards on /huong-dan (borderline, table frame); overused-font inter (false positive, user kept Inter). No overflow at 390px, no console errors.

## Priority issues
1. [P1] Tolerance configuration contradicts published rules, no safeguard (ThresholdConfig.jsx) → /impeccable harden
2. [P1] Amber misused for missing documents and low AI quality (UploadQueue.jsx) → /impeccable polish
3. [P2] Brand mark and standards diverge (two logos, eyebrow, ISO dates, left-aligned money, KPI cards in AdminConsole) → /impeccable polish
4. [P2] /upload layout cluttered, doc-type cards stateless, push list down on mobile → /impeccable distill
5. [P2] Icon-only nav by default; unlabeled search input and small title-only buttons → /impeccable audit + harden

## Persona red flags
- Alex: no bulk approve, no shortcut sheet, no undo after A, terms modal on every version bump.
- Sam: audit search input unlabeled; title-only 20px buttons; landing h1 announces "1"; focus: vs focus-visible on ThresholdConfig toggle.
- Jordan: unlabeled rail icons; "Gắn nhầm liên GRN" gives no next step in the list; "Lệch nhỏ/Lệch lớn" unexplained in place; primary CTA is a mailto.

## Minor observations
Ragged summary line cells; Reject close to Approve on desktop; audit description inaccurate; test-looking demo batch; personal Gmail as public contact; terms dialog over a bare scrim; guide/landing line length.

## Questions
- Should final approval visibly stamp the seal?
- Should tolerance be configurable, and should each result cite the threshold in force?
- Does Free's 6-month retention fit the archive promise?
