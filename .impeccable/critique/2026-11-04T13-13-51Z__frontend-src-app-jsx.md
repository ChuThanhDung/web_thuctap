---
target: frontend/src/App.jsx
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:E:\\Group 7\\P-007\\frontend\\src\\App.jsx"
target_fingerprint: "sha256:65b4e09da8acb8aa9533ac419e1968447ec2703373fbe5f5d30933fcf88368fb"
target_path: "E:\\Group 7\\P-007\\frontend\\src\\App.jsx"
timestamp: 2026-11-04T13-13-51Z
slug: frontend-src-app-jsx
---
# Critique: DocuSync AI app (rerun after c782bb4)
Method: dual-agent (A: design review · B: detector + browser)

Score 26/40. H1 3, H2 3, H3 2, H4 2, H5 3, H6 3, H7 1, H8 2, H9 4, H10 3.

Priority issues:
- [P1] major_diff shows grey "Cần xem lại" in the list (BatchListItem.jsx:47) but red on the overview: map major_diff to danger "Lệch lớn".
- [P1] Comparison table: long supplier names wrap 5 lines right-aligned; left-align text, right-align only numbers, truncate with title, line items sooner.
- [P2] Upload hierarchy: note card and slot rows compete with dropzone; placeholder contrast 2.2:1; collapse note, show goal "Đủ 3 liên".
- [P2] No keyboard flow / bulk approve / next-batch after approving.
- [P3] Default Recharts bar chart on overview (AccountantOverview.jsx:290); 5 filter tabs wrap to 2 rows in 360px list; "Chờ N ngày" doesn't escalate.

Detector: CLI 0 findings. Browser: upload placeholder 2.2:1, nested-cards + ~89ch lines on /huong-dan, cramped 3px padding on /audit-trail, Inter flag (intentional), stragglers (noise). Overflow 0 at 1440/390 on 6 pages.
