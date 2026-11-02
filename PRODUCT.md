# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Kế toán viên (accountant)** at Vietnamese SMEs: uploads PO, GRN and invoice documents, reviews the three-way reconciliation result, and approves (level 1) batches daily from an office desktop.
- **Kế toán trưởng (chief_accountant)**: reviews accountant-approved batches and gives final approval or rejects them with a reason (the rejection is emailed).

## Product Purpose

DocuSyncAI reconciles Purchase Orders, Goods Receipt Notes and Invoices line by line, using AI only where documents are not structured, and routes each batch through a two-level approval. Success: discrepancies are caught with clear reasons, matching batches move through approval quickly, and approved batches become trustworthy archives.

## Positioning

- **Transparent tolerance rules.** Tax ID, VAT rate, unit price and quantity must match exactly; money amounts may differ by at most 1,000 VND (rounding) → `minor_diff`, otherwise `major_diff`. Results explain why.
- **XML never goes to AI.** Vietnamese e-invoice XML (GDT, UBL, `DonDatHang`, `PhieuNhapKho`) is parsed locally; only PDF/images use AI extraction, with safeguards and low-quality flags.
- **Two-level approval with immutable archives.** `final_approved` batches cannot be edited or deleted, enforced down to database triggers.

## Operating Context

Batch lifecycle: `incomplete` → `ready` → `approved` → `final_approved` or `rejected`. Users work through overview, upload, batch list/detail (audit trail), user management, settings and thresholds. Real-time notifications via WebSocket; audit logs record actions.

## Capabilities and Constraints

- React 18 + Vite + Tailwind frontend; routes in `frontend/src/routes.js`, strings in `frontend/src/i18n/vi.js`, CSS-variable design tokens.
- All UI text is Vietnamese.
- Desktop is the primary environment; mobile only needs to be usable for viewing.
- Production AI model: `gpt-4o-mini`; offline fallback when no API key.

## Evidence on Hand

- Golden dataset in `dataset/golden/` with `ground_truth.json`; eval reports in `eval/`.
- Live demo at https://c3-app-007.docusyncai.asia/ (accounts issued per reviewer).
- No customer testimonials, case studies or pricing exist; do not fabricate them.

## Product Principles

1. Every discrepancy states its reason and the rule that produced it.
2. Money and document data are never silently altered; corrections are logged and visible.
3. Approved records are final; the interface must make irreversible actions explicit.
4. Keep sensitive structured data local; AI is a fallback, not the default.

## Accessibility & Inclusion

WCAG 2.1 AA: contrast and full keyboard operation.
