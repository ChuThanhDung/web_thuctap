---
name: DocuSync AI
description: Three-way PO · Invoice · GRN reconciliation, drawn as three carbon copies of one transaction.
colors:
  form-blue: "#1f4fa3"
  form-blue-deep: "#173d80"
  copy-tint: "#e8effa"
  ink-navy: "#0e1b33"
  ink-muted: "#3a4a66"
  ink-subtle: "#50607c"
  paper: "#ffffff"
  canvas: "#f2f6fc"
  surface-muted: "#eaf0f9"
  surface-sunken: "#dfe7f3"
  rule-line: "#dae2ee"
  rail-navy: "#13213d"
  seal-brass: "#d9b26a"
  input-line: "#788aa8"
  match-green: "#0a6b48"
  match-green-bg: "#e8f6ef"
  match-green-line: "#aaddc4"
  rounding-amber: "#8a4b00"
  rounding-amber-bg: "#fff4dd"
  rounding-amber-line: "#f5d08c"
  mismatch-red: "#a81626"
  mismatch-red-bg: "#fdebec"
  mismatch-red-line: "#f4c0c4"
  info-blue: "#1d4ed8"
  brand-line: "#b9cbea"
  neutral-tone: "#33415a"
  chart-success: "#059669"
  chart-warning: "#c86e06"
  chart-danger: "#c81e32"
  chart-neutral: "#64748b"
typography:
  display:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "clamp(1.75rem, 6vw, 2.5rem)"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.33
  title:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
    fontFeature: "\"ss01\""
  label:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.33
  figure-lead:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "\"tnum\""
  figure:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "\"tnum\""
rounded:
  control: "4px"
  card: "6px"
  modal: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "20px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.form-blue}"
    textColor: "{colors.paper}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.form-blue-deep}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-navy}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "40px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-muted}"
  button-ghost:
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "40px"
  button-danger:
    backgroundColor: "{colors.mismatch-red-bg}"
    textColor: "{colors.mismatch-red}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "40px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-navy}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "40px"
  copy-chip:
    backgroundColor: "{colors.copy-tint}"
    textColor: "{colors.form-blue-deep}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "2px 6px"
    width: "40px"
  status-badge:
    rounded: "{rounded.control}"
    typography: "{typography.label}"
    padding: "4px 10px"
  card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.card}"
    padding: "16px 20px"
  modal:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.modal}"
    padding: "20px 24px"
  table-header-cell:
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    padding: "10px 16px"
  sidebar-rail:
    backgroundColor: "{colors.form-blue}"
    textColor: "{colors.paper}"
    width: "64px"
  sidebar-item-active:
    backgroundColor: "{colors.form-blue-deep}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    height: "44px"
---

# Design System: DocuSync AI

## Overview

**Creative North Star: "The Three Carbon Copies"**

A purchase order, an invoice and a goods receipt note are three copies of one transaction. The interface lays them on top of each other and shows exactly where they fail to register, the way a misaligned carbon copy shows its offset. Everything else is the plain apparatus of an accounting form: white paper, navy ink, a single form blue for structure and signature, ruled lines doing the work of separation.

The system is dense and calm. It is built for accountants working at office desktops every day, so it favours tabular reading, right-aligned tabular figures, stable column order and in-place detail over decoration. Depth is almost absent; 1px rules and a 2px blue header rule carry hierarchy. Colour is spent on meaning: blue for structure and the human signature, green for agreement, amber only for rounding-level (minor) differences, neutral grey for missing or incomplete data, red for real mismatch and refusal.

It explicitly rejects the default SaaS admin dashboard: no grid of same-size KPI cards, no pill badges scattered everywhere, no modal for every detail, no coloured side stripes.

**Key Characteristics:**
- Three copies in fixed order PO · HĐ · GRN, on every surface that compares them.
- Square, form-like geometry: 4px controls, 6px cards, 8px dialogs.
- Rules over shadows: 1px lines everywhere, one 2px form-blue rule under comparison table headers.
- Tabular, right-aligned figures in every table.
- Severity colour is semantic and scarce; neutral blue-white carries the rest.
- Master-detail in place at wide widths; the dialog is the narrow-screen fallback, not the default.

## Colors

A blue-and-white form palette blended along one gradient: rail navy fading into form blue, then into a blue-white page ground. One saturated form blue, a cool blue-tinted paper ladder, navy ink, one brass accent used only for the brand mark and the seal, and three severity tones that mean only one thing each.

### Primary
- **Form Blue** (form-blue): the lower end of the sidebar gradient, primary buttons, the 2px rule under comparison table headers, signed names in the signature strip, the lead figure in the summary line, focus rings. It is the colour of structure and of a human signature.
- **Deep Form Blue** (form-blue-deep): primary hover and copy-chip lettering.
- **Rail Navy** (rail-navy): the top of the sidebar gradient, of the public landing page's journey rail (the same 180° rail navy → form blue sweep) and of the login ground (135° navy → form blue → copy tint).
- **Seal Brass** (seal-brass): the brand mark square, the "Đã đối soát" seal on the login illustration, and focus rings on the rail. Never a status colour: amber stays reserved for rounding differences.
- **Copy Tint** (copy-tint): the fill of the PO / HĐ / GRN copy chips, brand-tone badges, dropzone-active state, and text selection (form blue at 22%).

### Neutral
- **Ink Navy** (ink-navy): all primary text and table figures.
- **Muted Ink** (ink-muted): descriptions, table header labels, secondary metadata.
- **Subtle Ink** (ink-subtle): placeholders, hints, unsigned signature cells, SKUs.
- **Paper** (paper): cards, tables, dialogs, inputs; the detail pane.
- **Canvas** (canvas): the page ground, a blue-white #f2f6fc. The app shell lays a copy-tint wash over its top 28rem that fades into canvas, the same pale end as the login gradient; white paper surfaces sit on it.
- **Scrim** (scrim): navy #0e1b33 (black in dark mode) behind dialogs and the mobile drawer. Never use fg for a backdrop: fg inverts in dark mode.
- **Pale Ledger** (surface-muted): the list column of master-detail, row hover, table footers and figcaptions.
- **Sunken Ledger** (surface-sunken): wells and recessed tracks.
- **Rule Line** (rule-line): every 1px divider and card border.
- **Input Line** (input-line): the stronger 1px stroke of inputs and secondary buttons, so controls read as fillable against ruled paper (WCAG non-text contrast).

### Severity tones
Each tone is a triple of foreground, tinted background and 1px line, used together.
- **Match Green** (match-green / -bg / -line): matched results, approved and archived states.
- **Rounding Amber** (rounding-amber / -bg / -line): money differences within the 1,000 VND rounding tolerance (minor_diff), and nothing else. Missing copies, fields a copy did not record and batches still waiting for documents use the neutral tone.
- **Mismatch Red** (mismatch-red / -bg / -line): major_diff cells and rows, rejection, destructive actions, field errors.
- **Info Blue** (info-blue): in-progress extraction only.
- **Chart solids** (chart-success, chart-warning, chart-danger, chart-neutral): heavier solids for bars, donut segments and legend dots, where the text-weight tone foregrounds would be too faint.

Dark mode remaps every token by variable and keeps the same blend: canvas #0b1324 one step below paper #101a2f so the top wash shows, ink #ecf1fa, form blue lifts to #7aa6f0 with dark text on it, and the rail gradient runs #0a1326 → #1b3670 (the `sidebar-end` token, so white rail text keeps its contrast). Seal brass stays #d9b26a in both themes. Components never carry their own `dark:` colours; they read the same semantic tokens.

### Named Rules
**The Severity Means One Thing Rule.** Red marks a real mismatch (major_diff), a rejection or a destructive action, never emphasis. Amber marks a rounding-level difference only, never missing data and never a hard mismatch; missing data is neutral grey. Green marks agreement. If a colour is on screen, a reader can say what went wrong without reading the label, and the label is still there.

**The Form Blue Is Structure Rule.** Form blue draws the frame (rail, header rule, primary action, signature ink). It is not a decoration fill for large panels; large areas stay paper or pale ledger.

## Typography

**Display Font:** Inter (with system-ui, -apple-system, sans-serif)
**Body Font:** Inter, with stylistic set `ss01`
**Label/Mono Font:** Inter for labels; the platform monospace only for SKUs.

**Character:** one workmanlike sans at form weights. Hierarchy comes from weight (600 and 700) and size, never from a second display face, letter-spacing or capitals.

### Hierarchy
- **Display** (700, clamp(1.75rem, 6vw, 2.5rem), 1.25, -0.02em): the login headline only.
- **Headline** (600, 24px; 20px below 640px): one page H1 per screen via the page header; the selected batch code in the detail pane uses the same size at 700.
- **Title** (600, 16px; 18px in dialog titles): card and section headers ("Chi tiết hàng hóa", "Bảng đối chiếu thông tin").
- **Body** (400, 14px, 1.43): tables, lists, descriptions. Inputs render at 16px below 640px to avoid mobile zoom, 14px above.
- **Label** (600, 12px): table header cells, badges, signature-strip labels; copy chips use 700.
- **Figures** (700, 36px lead / 24px others, line-height 1, tabular): the summary line only.

### Named Rules
**The Tabular Ledger Rule.** Every table sets `font-variant-numeric: tabular-nums` globally, and numeric columns are right-aligned, so money compares down a column across the three copies.

**The Sentence-Case Rule.** App chrome is sentence case at normal tracking. Capitals belong only inside document facsimiles (the invoice preview and printed reconciliation report) where the paper form itself uses them.

## Layout

The shell is a fixed sidebar (vertical gradient, rail navy to form blue) plus a canvas content column. The sidebar opens expanded (260px, with labels) by default from 1280px, and as a 64px icon rail from 768px to 1279px; users can switch from 1024px up, and the choice persists. Below 768px it becomes a drawer.

The batch surfaces (Bộ đối soát for both roles, Audit Trail) are master-detail. From 1280px the page splits into a 360px list column on pale ledger and a paper detail pane; choosing a row by click or ↑/↓ updates the detail in place, with no dialog. Below 1280px the list stands alone and the detail opens in a near-full-screen dialog.

The detail pane reads top to bottom: batch code (headline), one meta line separated by middle dots (supplier · MST · VAT · result), the decisive actions at the right with Reject (outlined) held apart from Approve (filled), the signature strip, three equal copy cards, the three-copy line-item table, then the field comparison table.

Overviews open with the summary line, then a two-column grid of cards (work queue and charts wide, attention and per-accountant narrow).

Spacing runs on a 4px base: 16px table cell inset, 12px row padding, 16px by 20px card headers, 20px by 24px dialog bodies, 16–24px page gutters.

### Named Rules
**The In-Place Detail Rule.** On wide screens a selected record is read beside its list, never over it. Dialogs are for confirmation, preview, and narrow screens.

**The Fixed Copy Order Rule.** PO, then HĐ (invoice), then GRN, in every table, chip stack, card row, column and sentence. The order is never sorted by severity or by which copy differs.

## Elevation & Depth

The system is flat and ruled. Surfaces sit on canvas separated by 1px rule lines; the only resting shadow is a hairline that reads as a paper edge rather than a lift. One real shadow exists, for things that float above the page: dialogs, toasts, popovers and menus. Dialog backdrops use the scrim token at 50%, dark in both themes.

### Shadow Vocabulary
- **Paper edge** (`box-shadow: 0 1px 0 rgb(14 27 51 / 0.04)`; dark `0 1px 2px rgb(0 0 0 / 0.4)`): cards, inputs, primary buttons.
- **Pop** (`box-shadow: 0 12px 32px -8px rgb(14 27 51 / 0.22), 0 2px 6px rgb(14 27 51 / 0.08)`; dark variant deeper): dialogs, toasts, dropdowns, the date-filter popover only.

### Named Rules
**The Rules Not Shadows Rule.** Hierarchy is drawn with 1px lines and the 2px header rule. If something needs to feel more important, give it weight or form blue, not a shadow.

## Shapes

Square, form-like corners: controls, badges, chips and table cells at 4px; cards and list containers at 6px; dialogs at 8px (top corners only when they rise as a bottom sheet on mobile). Full rounds are reserved for things that are round by nature: avatars, legend dots, progress tracks, donut charts, numbered step markers (the journey rail's stations, guide steps) and the brass seal stamp.

Borders are 1px throughout, with two deliberate exceptions: the 2px form-blue rule under comparison table headers, and the 2px rule-line separator between line-item groups in the three-copy table. Highlight boxes are tinted fills with a full 1px border, never a thick left edge.

### Named Rules
**The Header Rule Rule.** A table that compares or lists records carries a 2px form-blue rule under its header row. It is the form's printed rule; nothing else in the system is 2px blue.

**The No Side Stripe Rule.** Selection, severity and emphasis are never a coloured bar on one side of a card, row or callout. Use a tinted fill, a full 1px ring, or weight.

## Components

### Buttons
Plain, rectangular, firm.
- **Shape:** square-cornered (4px), minimum 40px tall (32px small).
- **Primary:** form-blue fill, white 14px semibold text, paper-edge shadow; deep form blue on hover.
- **Secondary:** paper fill with the 1px input-line stroke, ink text; pale-ledger fill on hover.
- **Ghost:** no fill, muted ink; pale ledger on hover.
- **Danger:** mismatch-red tint fill, red text, 1px red line. Used for Reject and Delete, never as a filled red slab.
- **Focus:** 2px focus ring in form blue, 2px offset. Disabled at 50% opacity; loading replaces the leading icon with a spinner and sets aria-busy.
- **Approve / Reject placement:** Reject (outlined) and Approve (filled) are separated, never adjacent twins.

### Status Badges
- **Style:** 4px corners, tinted background, 1px tone line, 12px semibold text, always with a leading icon so meaning never depends on colour alone.
- **Two families:** reconciliation (processing, missing, matched, mismatch) and approval (waiting for accountant, waiting for chief, approved, rejected). Both appear only where the state is not already said in words beside them.

### Copy Chip (signature)
The PO / HĐ / GRN marker. A small square chip, at least 40px wide, copy-tint fill, deep-form-blue 12px bold letters, with the full document name as an abbreviation title. Appears in the line-item table, the login illustration and copy card headers.

### Three-Copy Line-Item Table (signature)
Each item is a group of three stacked rows, one per copy in fixed order. Item name and unit span the group on the left; quantity, unit price and amount sit right-aligned and tabular; a Result column on the right says the reason in words ("Đơn giá HĐ cao hơn PO 150.000 đ") in the tone colour. A mismatching value is shown as a red-tint cell with a 1px red ring, nudged 8px out of its column like a misregistered carbon copy; a major-difference group gets a faint red wash. Groups are separated by a 2px rule-line, rows inside by a lighter 1px line.

### Field Comparison Table
Supplier, tax ID, VAT rate and totals in three fixed columns PO · HĐ · GRN, with a Result column stating the neutral finding ("HĐ khác PO và GRN", "Khớp · GRN không ghi").

### Signature Strip
A three-cell ruled block like the foot of an accounting voucher: Người lập · Duyệt cấp 1 · Duyệt cuối. Signed names print in form blue at semibold; unsigned cells say what they are waiting for in subtle ink. A final-approved batch shows an "Đã lưu trữ" success chip with a lock in the last cell.

### Summary Line
Replaces KPI card grids on overviews: figures stand side by side in one ruled band (1px top and bottom, 1px vertical dividers). The lead item (the user's own pending work) is form blue at 36px; the rest are ink at 24px. Clickable items filter the list they summarise.

### Cards / Containers
- **Corner Style:** 6px.
- **Background:** paper on canvas.
- **Shadow Strategy:** paper edge only (see Elevation).
- **Border:** 1px rule line; header separated by a 1px rule.
- **Internal Padding:** 16px by 20px header; bodies are often flush tables.

### Inputs / Fields
- **Style:** paper fill, 1px input-line stroke, 4px corners, 40px tall, paper-edge shadow; label above at 14px medium.
- **Focus:** 2px form-blue ring with offset.
- **Error / Disabled:** red stroke and a red 12px message with role alert; disabled fills pale ledger at 70% opacity.

### Navigation
The sidebar is a vertical gradient from rail navy to form blue, with the brand mark on a brass square. Items are 44px tall, 4px corners, 20px line icons with pale-blue muted labels; hover lays white at 10% and the active item white at 15% with white semibold text and a faint inset white ring, so states read the same anywhere on the gradient. Theme toggle, user, sign-out and the expand control sit at the foot. Status filters inside the list column are a compact segmented row, the active segment filled form blue.

The public landing page carries the same rail as a journey rail: 300px wide from 1024px (a sticky top bar below), the same gradient, item states and brass focus ring, with numbered round station markers (brass-filled when active) and a scroll-spy that lights the station being read. Actions on the rail invert to paper fill with rail-navy text.

### Dialogs and Toasts
Dialogs: paper, 8px corners, pop shadow, 1px ruled header and footer, actions right-aligned; bottom sheet on mobile. Toasts: tone triple with icon, 6px corners, pop shadow, bottom-right, pause on hover or focus.

## Do's and Don'ts

### Do:
- **Do** keep the copy order PO · HĐ · GRN on every surface, in every table, chip stack and sentence.
- **Do** describe differences neutrally ("HĐ khác PO và GRN", "Ba liên khác nhau"); when two copies agree, mark only the odd one; when none agree, mark all present copies.
- **Do** use amber only for differences within the 1,000 VND rounding tolerance, neutral for missing data, and red only for major differences, rejection and destructive actions.
- **Do** put a 2px form-blue rule under the header of every comparison or record table, and right-align tabular figures.
- **Do** use 4px corners on controls and chips, 6px on cards, 8px on dialogs.
- **Do** separate with 1px rule lines; reserve the pop shadow for things floating above the page.
- **Do** read records in place beside the list at 1280px and wider.
- **Do** pair every status colour with an icon and words.

### Don't:
- **Don't** colour or label any copy as "correct" or "wrong"; the interface does not know which copy was misread.
- **Don't** use side stripes (a thick coloured border on one side) for selection, severity or callouts.
- **Don't** build overviews from a grid of same-size KPI cards; use the summary line.
- **Don't** use pill-shaped badges or chips; round shapes are for avatars, dots, tracks, charts, step numbers and the seal.
- **Don't** add resting drop shadows, gradients or glows to cards or buttons. Gradients live only on navy rails (the app sidebar and the landing journey rail), the login ground and the copy-tint top wash on the shell and public pages.
- **Don't** introduce a second typeface, uppercase letter-spaced labels or eyebrow lines above headings in app chrome.
- **Don't** open a modal for record detail on wide screens.
- **Don't** hard-code palette colours (Tailwind gray, blue, red scales) in components; use the semantic tokens so dark mode follows.
