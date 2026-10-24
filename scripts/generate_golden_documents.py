"""Sinh bản PDF và ảnh (JPG) cho một phần golden dataset, để thử đường đọc bằng AI.

Dùng lại đúng kịch bản của scripts/generate_golden_dataset.py (cùng seed) nên số liệu, đáp án
và loại sai lệch giống hệt bản XML cùng mã bộ. Việc sinh file không gọi API nào.

    python scripts/generate_golden_documents.py            # ghi vào dataset/golden_docs

Bố cục theo mẫu chứng từ thường gặp: đơn đặt hàng có quốc hiệu, phiếu nhập kho mẫu 01-VT
(Thông tư 200/2014/TT-BTC), bản thể hiện hóa đơn GTGT điện tử song ngữ có chữ ký số.
Mọi doanh nghiệp, thương hiệu và mã tra cứu đều là giả định, chân trang ghi rõ dữ liệu kiểm thử.

Cần reportlab, Pillow, PyMuPDF và font Times New Roman của Windows (hoặc đặt --font-dir).
"""

import argparse
import io
import json
import random
import shutil
import sys
from pathlib import Path
from xml.sax.saxutils import escape

import pymupdf
from PIL import Image, ImageFilter
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_golden_dataset import (  # noqa: E402
    BUYER,
    SUPPLIER_INFO,
    Scenario,
    amount_in_words,
    build_scenarios,
    ground_truth,
    invoice_amounts,
)

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "dataset" / "golden_docs"

BUYER_ADDRESS = "Tầng 5, Tòa nhà Sông Đà, 18 Phạm Hùng, Phường Mỹ Đình 1, Quận Nam Từ Liêm, Hà Nội"
BUYER_PHONE = "024 3795 1188"
WAREHOUSE = "Kho GoNow, 18 Phạm Hùng, Nam Từ Liêm, Hà Nội"
BANKS = [
    "Vietcombank - CN Thành Công",
    "VietinBank - CN Đống Đa",
    "BIDV - CN Sở Giao dịch 2",
    "Techcombank - CN Tân Bình",
]
INK = colors.HexColor("#1f2937")
LINE = colors.HexColor("#6b7280")
HEAD_BG = colors.HexColor("#eef2f7")
ACCENT = colors.HexColor("#1e3a8a")
SIGN_RED = colors.HexColor("#c62828")

# (nhóm, loại sai lệch, định dạng): chọn bộ đầu tiên trong dataset khớp.
# 10 bộ PDF (có bộ nhiều trang) + 8 bộ ảnh (một trang nên giới hạn số dòng).
PICKS = [
    ("small", "match", "pdf"),
    ("small", "price_up_invoice", "pdf"),
    ("medium", "match", "pdf"),
    ("medium", "qty_over_invoice", "pdf"),
    ("medium", "tax_id_mismatch", "pdf"),
    ("medium", "vat_rate_mismatch", "pdf"),
    ("medium", "rounding_line", "pdf"),
    ("large", "match", "pdf"),
    ("large", "short_delivery", "pdf"),
    ("large", "price_off_small", "pdf"),
    ("xlarge", "match", "pdf"),
    ("small", "match", "image"),
    ("small", "total_tampered", "image"),
    ("small", "rounding_vat", "image"),
    ("medium", "match", "image"),
    ("medium", "extra_product_on_invoice", "image"),
    ("medium", "short_by_one", "image"),
    ("medium", "short_delivery", "image"),
    ("small", "price_up_invoice", "image"),
]
IMAGE_MAX_LINES = 12  # vừa một trang A4 kể cả phần đầu và chữ ký


# ── Font, kiểu chữ, tiện ích ──
def register_fonts(font_dir: Path) -> None:
    for name, file in (
        ("Serif", "times"),
        ("Serif-Bold", "timesbd"),
        ("Serif-Italic", "timesi"),
        ("Serif-BI", "timesbi"),
    ):
        pdfmetrics.registerFont(TTFont(name, str(font_dir / f"{file}.ttf")))
    pdfmetrics.registerFontFamily(
        "Serif", normal="Serif", bold="Serif-Bold", italic="Serif-Italic", boldItalic="Serif-BI"
    )


def _style(name, size=10, align=TA_LEFT, font="Serif", leading=None, color=INK, **kw):
    return ParagraphStyle(
        name, fontName=font, fontSize=size, leading=leading or size * 1.25, alignment=align, textColor=color, **kw
    )


S = {
    "body": _style("body"),
    "small": _style("small", 8.5),
    "center": _style("center", align=TA_CENTER),
    "center_b": _style("center_b", font="Serif-Bold", align=TA_CENTER),
    "center_s": _style("center_s", 9.5, align=TA_CENTER),
    "center_i": _style("center_i", 9, font="Serif-Italic", align=TA_CENTER),
    "right_i": _style("right_i", font="Serif-Italic", align=TA_RIGHT),
    "title": _style("title", 17, font="Serif-Bold", align=TA_CENTER, leading=21),
    "section": _style("section", 10, font="Serif-Bold", spaceBefore=4, spaceAfter=2),
    "cell": _style("cell", 9, leading=11),
    "cell_c": _style("cell_c", 9, align=TA_CENTER, leading=11),
    "cell_r": _style("cell_r", 9, align=TA_RIGHT, leading=11),
    "cell_rb": _style("cell_rb", 9, font="Serif-Bold", align=TA_RIGHT, leading=11),
    "head": _style("head", 9, font="Serif-Bold", align=TA_CENTER, leading=11),
    "head_i": _style("head_i", 8, font="Serif-Italic", align=TA_CENTER, leading=10),
    "seller": _style("seller", 12, font="Serif-Bold", color=ACCENT, leading=15),
    "sign_red": _style("sign_red", 8.5, align=TA_CENTER, color=SIGN_RED, leading=11),
}


def para(text, style="body"):
    return Paragraph(text, S[style])


def vnd(value: int) -> str:
    return f"{int(value):,}".replace(",", ".")


def ymd(iso: str) -> tuple[str, str, str]:
    year, month, day = iso.split("-")
    return day, month, year


def dmy(iso: str) -> str:
    return "/".join(ymd(iso))


def long_date(iso: str, place: str = "") -> str:
    day, month, year = ymd(iso)
    return f"{place + ', ' if place else ''}ngày {day} tháng {month} năm {year}"


def city_of(address: str) -> str:
    return "TP. Hồ Chí Minh" if "Hồ Chí Minh" in address else "Hà Nội"


def supplier_phone(s: Scenario) -> str:
    rng = random.Random(s.supplier[0])
    prefix = "028" if "Hồ Chí Minh" in SUPPLIER_INFO[s.supplier[0]]["address"] else "024"
    return f"{prefix} {rng.randint(3500, 3999)} {rng.randint(1000, 9999)}"


def supplier_bank(s: Scenario) -> str:
    rng = random.Random(s.supplier[0] + "bank")
    return f"{rng.randint(10**11, 10**12 - 1)} tại {rng.choice(BANKS)}"


def grid(rows, widths, header_rows=1, extra=()):
    t = Table(rows, colWidths=widths, repeatRows=header_rows)
    t.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.5, LINE),
                ("BACKGROUND", (0, 0), (-1, header_rows - 1), HEAD_BG),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 2.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                *extra,
            ]
        )
    )
    return t


def plain(rows, widths, align="TOP", extra=()):
    t = Table(rows, colWidths=widths)
    t.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), align),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                *extra,
            ]
        )
    )
    return t


def signatures(roles: list[tuple[str, str, str]], width: float, gap=16 * mm):
    """roles: (chức danh, ghi chú, họ tên)."""
    col = width / len(roles)
    rows = [
        [para(f"<b>{role}</b>", "center") for role, _, _ in roles],
        [para(f"<i>{hint}</i>", "center_i") for _, hint, _ in roles],
        [Spacer(1, gap) for _ in roles],
        [para(name, "center") for _, _, name in roles],
    ]
    return KeepTogether(plain(rows, [col] * len(roles)))


def footer(canvas, doc, text):
    canvas.saveState()
    canvas.setFont("Serif-Italic", 7.5)
    canvas.setFillColor(LINE)
    canvas.drawString(15 * mm, 9 * mm, text)
    canvas.drawRightString(A4[0] - 15 * mm, 9 * mm, f"Trang {doc.page}")
    canvas.restoreState()


def make_doc(path: Path, title: str, margins=15 * mm):
    return SimpleDocTemplate(
        str(path), pagesize=A4, title=title, author="DocuSync AI - dữ liệu kiểm thử",
        leftMargin=margins, rightMargin=margins, topMargin=13 * mm, bottomMargin=16 * mm,
    )  # fmt: skip


TEST_NOTE = "Chứng từ mô phỏng phục vụ kiểm thử DocuSync AI - không có giá trị pháp lý."


# ── Đơn đặt hàng ──
def render_po(s: Scenario, path: Path) -> None:
    doc = make_doc(path, f"Đơn đặt hàng {s.po_no}")
    width = doc.width
    info = SUPPLIER_INFO[s.supplier[0]]
    subtotal = sum(i.qty * i.price for i in s.po_items)
    tax = subtotal * s.vat_po // 100
    story = [
        plain(
            [[
                [para(f"<b>{BUYER[0]}</b>", "center_s"), para(f"Số: {s.po_no}/ĐĐH-GN", "center")],
                [para("<b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b>", "center"), para("<b>Độc lập - Tự do - Hạnh phúc</b>", "center"),
                 para("―――――――――――", "center")],
            ]],
            [width * 0.5, width * 0.5],
        ),
        Spacer(1, 2 * mm),
        para(long_date(s.dates[0], "Hà Nội"), "right_i"),
        Spacer(1, 4 * mm),
        para("ĐƠN ĐẶT HÀNG", "title"),
        para(f"Số: <b>{s.po_no}</b>", "center"),
        Spacer(1, 4 * mm),
        para(f"<b>Kính gửi:</b> {s.supplier[0]}"),
        para(f"Địa chỉ: {info['address']} - MST: {s.supplier[1]}", "small"),
        Spacer(1, 2 * mm),
        para(
            f"{BUYER[0]} (MST: {BUYER[1]}), địa chỉ: {BUYER_ADDRESS}, có nhu cầu đặt mua hàng hóa tại Quý công ty "
            "theo nội dung dưới đây:"
        ),
        para("I. CHI TIẾT ĐƠN HÀNG", "section"),
    ]  # fmt: skip
    head = [
        para(h, "head")
        for h in ("STT", "Mã hàng", "Tên hàng hóa, quy cách", "ĐVT", "Số lượng", "Đơn giá", "Thành tiền")
    ]
    rows = [head] + [
        [para(str(n), "cell_c"), para(i.sku, "cell"), para(escape(i.name), "cell"), para(i.unit, "cell_c"),
         para(vnd(i.qty), "cell_r"), para(vnd(i.price), "cell_r"), para(vnd(i.qty * i.price), "cell_r")]
        for n, i in enumerate(s.po_items, 1)
    ]  # fmt: skip
    n = len(rows)
    rows += [
        [para("Cộng tiền hàng", "cell_rb"), "", "", "", "", "", para(vnd(subtotal), "cell_rb")],
        [para(f"Thuế GTGT ({s.vat_po}%)", "cell_rb"), "", "", "", "", "", para(vnd(tax), "cell_rb")],
        [para("Tổng tiền thanh toán", "cell_rb"), "", "", "", "", "", para(vnd(subtotal + tax), "cell_rb")],
    ]
    spans = [("SPAN", (0, r), (5, r)) for r in range(n, n + 3)]
    story += [
        grid(rows, [width * w for w in (0.06, 0.12, 0.36, 0.08, 0.1, 0.13, 0.15)], extra=spans),
        Spacer(1, 1.5 * mm),
        para(f"<i>(Bằng chữ: {amount_in_words(subtotal + tax)})</i>", "small"),
        para("II. ĐIỀU KHOẢN GIAO NHẬN VÀ THANH TOÁN", "section"),
        para(f"- Thời gian giao hàng: chậm nhất ngày {dmy(s.dates[1])}."),
        para(f"- Địa điểm giao hàng: {WAREHOUSE}. Người nhận: {s.people['storekeeper']} (Thủ kho)."),
        para("- Hình thức thanh toán: chuyển khoản trong vòng 30 ngày kể từ ngày nhận đủ hàng và hóa đơn GTGT hợp lệ."),
        para("- Hàng giao phải đúng quy cách, số lượng; bên mua có quyền từ chối nhận hàng không đạt yêu cầu."),
        Spacer(1, 6 * mm),
        signatures(
            [("ĐẠI DIỆN BÊN BÁN", "(Xác nhận, ký, ghi rõ họ tên)", s.people["seller_rep"]),
             ("ĐẠI DIỆN BÊN MUA", "(Ký, ghi rõ họ tên, đóng dấu)", s.people["buyer_contact"])],
            width,
        ),
    ]  # fmt: skip
    doc.build(
        story, onFirstPage=lambda c, d: footer(c, d, TEST_NOTE), onLaterPages=lambda c, d: footer(c, d, TEST_NOTE)
    )


# ── Phiếu nhập kho (mẫu 01-VT) ──
def render_grn(s: Scenario, path: Path) -> None:
    doc = make_doc(path, f"Phiếu nhập kho {s.grn_no}")
    width = doc.width
    subtotal = sum(actual * item.price for item, actual in s.grn_items)
    story = [
        plain(
            [[
                [para(f"Đơn vị: <b>{BUYER[0]}</b>"), para("Bộ phận: Kho vận")],
                [para("<b>Mẫu số 01 - VT</b>", "center"),
                 para("(Ban hành theo Thông tư số 200/2014/TT-BTC ngày 22/12/2014 của Bộ Tài chính)", "center_i")],
            ]],
            [width * 0.58, width * 0.42],
        ),
        Spacer(1, 5 * mm),
        plain(
            [[
                "",
                [para("PHIẾU NHẬP KHO", "title"), para(f"<i>{long_date(s.dates[1])}</i>", "center"), para(f"Số: <b>{s.grn_no}</b>", "center")],
                [para("Nợ: 152, 156"), para("Có: 331")],
            ]],
            [width * 0.25, width * 0.5, width * 0.25],
            align="BOTTOM",
            extra=[("LEFTPADDING", (2, 0), (2, 0), 12 * mm)],
        ),
        Spacer(1, 4 * mm),
        para(f"- Họ và tên người giao: <b>{s.people['deliverer']}</b> - {s.supplier[0]}"),
        para(f"- Theo đơn đặt hàng số <b>{s.po_no}</b> ngày {dmy(s.dates[0])} của {s.supplier[0]}"),
        para(f"- Nhập tại kho: <b>{WAREHOUSE}</b>"),
        Spacer(1, 3 * mm),
    ]  # fmt: skip
    head1 = [para("STT", "head"), para("Tên, nhãn hiệu, quy cách, phẩm chất vật tư, dụng cụ, sản phẩm, hàng hóa", "head"),
             para("Mã số", "head"), para("Đơn vị tính", "head"), para("Số lượng", "head"), "", para("Đơn giá", "head"),
             para("Thành tiền", "head")]  # fmt: skip
    head2 = ["", "", "", "", para("Theo chứng từ", "head"), para("Thực nhập", "head"), "", ""]
    letters = [para(x, "head_i") for x in ("A", "B", "C", "D", "1", "2", "3", "4")]
    rows = [head1, head2, letters] + [
        [para(str(n), "cell_c"), para(escape(item.name), "cell"), para(item.sku, "cell_c"), para(item.unit, "cell_c"),
         para(vnd(item.qty), "cell_r"), para(vnd(actual), "cell_r"), para(vnd(item.price), "cell_r"), para(vnd(actual * item.price), "cell_r")]
        for n, (item, actual) in enumerate(s.grn_items, 1)
    ]  # fmt: skip
    rows.append(["", para("<b>Cộng</b>", "cell_c"), para("x", "cell_c"), para("x", "cell_c"), para("x", "cell_c"),
                 para("x", "cell_c"), para("x", "cell_c"), para(vnd(subtotal), "cell_rb")])  # fmt: skip
    spans = [("SPAN", (c, 0), (c, 1)) for c in (0, 1, 2, 3, 6, 7)] + [("SPAN", (4, 0), (5, 0))]
    story += [
        grid(rows, [width * w for w in (0.06, 0.34, 0.11, 0.08, 0.1, 0.09, 0.1, 0.12)], header_rows=3,
             extra=[*spans, ("BACKGROUND", (0, 2), (-1, 2), colors.white)]),
        Spacer(1, 2 * mm),
        para(f"- Tổng số tiền (viết bằng chữ): <i>{amount_in_words(subtotal)}</i>"),
        para(f"- Số chứng từ gốc kèm theo: 01 (Đơn đặt hàng {s.po_no})"),
        Spacer(1, 2 * mm),
        para(long_date(s.dates[1], "Hà Nội"), "right_i"),
        Spacer(1, 2 * mm),
        signatures(
            [("Người lập phiếu", "(Ký, họ tên)", s.people["preparer"]),
             ("Người giao hàng", "(Ký, họ tên)", s.people["deliverer"]),
             ("Thủ kho", "(Ký, họ tên)", s.people["storekeeper"]),
             ("Kế toán trưởng", "(Hoặc bộ phận có nhu cầu nhập)", s.people["chief_accountant"])],
            width,
        ),
    ]  # fmt: skip
    doc.build(
        story, onFirstPage=lambda c, d: footer(c, d, TEST_NOTE), onLaterPages=lambda c, d: footer(c, d, TEST_NOTE)
    )


# ── Hóa đơn GTGT điện tử (bản thể hiện) ──
def invoice_page(canvas, doc, lookup: str):
    canvas.saveState()
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.2)
    canvas.rect(9 * mm, 13 * mm, A4[0] - 18 * mm, A4[1] - 22 * mm)
    canvas.setLineWidth(0.4)
    canvas.rect(10.2 * mm, 14.2 * mm, A4[0] - 20.4 * mm, A4[1] - 24.4 * mm)
    canvas.restoreState()
    footer(canvas, doc, f"Tra cứu hóa đơn tại https://tracuu.docusync.test - Mã tra cứu: {lookup}. {TEST_NOTE}")


def render_invoice(s: Scenario, path: Path) -> None:
    doc = make_doc(path, f"Hóa đơn {s.inv_serial} {s.inv_no}", margins=14 * mm)
    width = doc.width
    info = SUPPLIER_INFO[s.supplier[0]]
    lines, subtotal, tax, total = invoice_amounts(s)
    day, month, year = ymd(s.dates[2])
    lookup = f"{info['code']}{random.Random(s.batch_id).randint(10**9, 10**10 - 1)}"

    logo = Table([[para(f"<b>{info['code']}</b>", "center")]], colWidths=[18 * mm], rowHeights=[18 * mm])
    logo.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1.5, ACCENT), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TEXTCOLOR", (0, 0), (-1, -1), ACCENT), ("FONTSIZE", (0, 0), (-1, -1), 16),
    ]))  # fmt: skip
    seller_block = [
        para(s.supplier[0], "seller"),
        para(f"Mã số thuế <i>(Tax code)</i>: <b>{s.inv_supplier_tax}</b>", "small"),
        para(f"Địa chỉ <i>(Address)</i>: {info['address']}", "small"),
        para(f"Điện thoại <i>(Tel)</i>: {supplier_phone(s)}", "small"),
        para(f"Số tài khoản <i>(Account No.)</i>: {supplier_bank(s)}", "small"),
    ]
    title_block = [
        para("HÓA ĐƠN GIÁ TRỊ GIA TĂNG", "title"),
        para("<b><i>(VAT INVOICE)</i></b>", "center"),
        para("Bản thể hiện của hóa đơn điện tử <i>(Electronic invoice display)</i>", "center_i"),
        para(f"Ngày <i>(date)</i> {day} tháng <i>(month)</i> {month} năm <i>(year)</i> {year}", "center"),
    ]
    serial_block = [
        para("Mẫu số <i>(Form)</i>: <b>1</b>", "small"),
        para(f"Ký hiệu <i>(Serial)</i>: <b>{s.inv_serial}</b>", "small"),
        para(f"Số <i>(No.)</i>: <b><font color='#c62828' size='11'>{s.inv_no}</font></b>", "small"),
    ]
    story = [
        plain([[logo, seller_block]], [24 * mm, width - 24 * mm], align="MIDDLE"),
        Spacer(1, 2 * mm),
        plain([[""]], [width], extra=[("LINEABOVE", (0, 0), (-1, 0), 0.8, ACCENT)]),
        plain([["", title_block, serial_block]], [width * 0.2, width * 0.56, width * 0.24], align="MIDDLE"),
        Spacer(1, 3 * mm),
        para(f"Họ tên người mua hàng <i>(Buyer)</i>: {s.people['buyer_contact']}"),
        para(f"Tên đơn vị <i>(Company)</i>: <b>{BUYER[0]}</b>"),
        para(f"Mã số thuế <i>(Tax code)</i>: {BUYER[1]}"),
        para(f"Địa chỉ <i>(Address)</i>: {BUYER_ADDRESS}"),
        para("Hình thức thanh toán <i>(Payment method)</i>: TM/CK &nbsp;&nbsp;&nbsp; Đồng tiền <i>(Currency)</i>: VND"),
        Spacer(1, 3 * mm),
    ]
    head = [para(f"{vi}<br/><i>({en})</i>", "head") for vi, en in (
        ("STT", "No."), ("Tên hàng hóa, dịch vụ", "Description"), ("Đơn vị tính", "Unit"),
        ("Số lượng", "Quantity"), ("Đơn giá", "Unit price"), ("Thành tiền", "Amount"),
    )]  # fmt: skip
    rows = [head, [para(x, "head_i") for x in ("1", "2", "3", "4", "5", "6 = 4 x 5")]]
    rows += [
        [para(str(n), "cell_c"), para(escape(i.name), "cell"), para(i.unit, "cell_c"), para(vnd(i.qty), "cell_r"),
         para(vnd(i.price), "cell_r"), para(vnd(amount), "cell_r")]
        for n, (i, amount) in enumerate(lines, 1)
    ]  # fmt: skip
    rows += [[""] * 6 for _ in range(max(0, 6 - len(s.inv_items)))]  # dòng trống như mẫu in sẵn
    n = len(rows)
    rows += [
        [para("Cộng tiền hàng <i>(Sub total)</i>:", "cell_rb"), "", "", "", "", para(vnd(subtotal), "cell_rb")],
        [para(f"Thuế suất GTGT <i>(VAT rate)</i>: <b>{s.vat_inv}%</b>", "cell"), "",
         para("Tiền thuế GTGT <i>(VAT amount)</i>:", "cell_rb"), "", "", para(vnd(tax), "cell_rb")],
        [para("Tổng cộng tiền thanh toán <i>(Total amount)</i>:", "cell_rb"), "", "", "", "", para(vnd(total), "cell_rb")],
        [para(f"Số tiền viết bằng chữ <i>(Amount in words)</i>: <b><i>{amount_in_words(total)}</i></b>", "cell"),
         "", "", "", "", ""],
    ]  # fmt: skip
    extra = [
        ("SPAN", (0, n), (4, n)), ("SPAN", (0, n + 1), (1, n + 1)), ("SPAN", (2, n + 1), (4, n + 1)),
        ("SPAN", (0, n + 2), (4, n + 2)), ("SPAN", (0, n + 3), (5, n + 3)),
        ("BACKGROUND", (0, 1), (-1, 1), colors.white), ("ROWBACKGROUNDS", (0, 2), (-1, n - 1), [colors.white]),
    ]  # fmt: skip
    for r in range(len(s.inv_items) + 2, n):
        extra.append(("LINEBELOW", (0, r), (-1, r), 0.2, colors.HexColor("#d1d5db")))
    signed = Table(
        [[para("Signature Valid", "sign_red")], [para(f"Ký bởi: {s.supplier[0]}", "sign_red")], [para(f"Ký ngày: {dmy(s.dates[2])}", "sign_red")]],
        colWidths=[width * 0.4],
    )  # fmt: skip
    signed.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.8, SIGN_RED), ("TOPPADDING", (0, 0), (-1, -1), 1)]))
    sign_rows = [
        [
            para("<b>Người mua hàng</b> <i>(Buyer)</i>", "center"),
            para("<b>Người bán hàng</b> <i>(Seller)</i>", "center"),
        ],
        [para("<i>(Ký, ghi rõ họ tên)</i>", "center_i"), para("<i>(Ký, đóng dấu, ghi rõ họ tên)</i>", "center_i")],
        [Spacer(1, 4 * mm), ""],
        ["", signed],
    ]
    story += [
        grid(rows, [width * w for w in (0.07, 0.43, 0.1, 0.11, 0.13, 0.16)], header_rows=1, extra=extra),
        Spacer(1, 6 * mm),
        KeepTogether(plain(sign_rows, [width / 2, width / 2], extra=[("ALIGN", (1, 3), (1, 3), "CENTER")])),
    ]
    page = lambda c, d: invoice_page(c, d, lookup)  # noqa: E731
    doc.build(story, onFirstPage=page, onLaterPages=page)


RENDERERS = [("01_purchase_order", render_po), ("02_goods_receipt", render_grn), ("03_invoice", render_invoice)]


def pdf_to_photo(pdf_path: Path, jpg_path: Path, rng: random.Random) -> None:
    """Chụp trang 1 thành JPG: giấy hơi ngả màu, hơi nghiêng, hơi mờ và nén mạnh, giống ảnh chụp bằng điện thoại."""
    with pymupdf.open(pdf_path) as pdf:
        pix = pdf[0].get_pixmap(dpi=140)
    image = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
    paper = Image.new("RGB", image.size, (246, 242, 232))
    image = Image.blend(image, paper, 0.12)
    image = image.rotate(rng.uniform(-1.2, 1.2), expand=True, fillcolor=(214, 210, 200), resample=Image.BICUBIC)
    image = image.filter(ImageFilter.GaussianBlur(rng.uniform(0.4, 0.7)))
    image.save(jpg_path, "JPEG", quality=rng.randint(68, 80))


def pick_scenarios(scenarios: list[Scenario]):
    used: set[str] = set()
    chosen = []
    for category, kind, fmt in PICKS:
        fits = [s for s in scenarios if s.batch_id not in used and s.kind == kind]
        if fmt == "image":
            fits = [s for s in fits if s.line_count <= IMAGE_MAX_LINES]
        # Đúng nhóm trước; ảnh mà nhóm đó không có bộ đủ ngắn thì lấy bộ cùng loại lỗi ở nhóm khác.
        fits.sort(key=lambda s: s.category != category)
        if fits:
            used.add(fits[0].batch_id)
            chosen.append((fits[0], fmt))
    return chosen


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--seed", type=int, default=20261024)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--font-dir", type=Path, default=Path("C:/Windows/Fonts"))
    args = parser.parse_args()

    register_fonts(args.font_dir)
    if args.out.exists():
        shutil.rmtree(args.out)
    args.out.mkdir(parents=True)
    rng = random.Random(args.seed)
    manifest = []
    for s, fmt in pick_scenarios(build_scenarios(60, args.seed)):
        folder = args.out / s.batch_id
        folder.mkdir()
        for stem, render in RENDERERS:
            if fmt == "pdf":
                render(s, folder / f"{stem}.pdf")
            else:
                temp = folder / f"{stem}.tmp.pdf"
                render(s, temp)
                pdf_to_photo(temp, folder / f"{stem}.jpg", rng)
                temp.unlink()
        truth = ground_truth(s)
        truth["format"] = fmt
        (folder / "ground_truth.json").write_text(json.dumps(truth, ensure_ascii=False, indent=2), encoding="utf-8")
        keys = ("batch_id", "format", "category", "kind", "line_count", "expected_status")
        manifest.append({k: truth[k] for k in keys})
    (args.out / "manifest.json").write_text(
        json.dumps({"seed": args.seed, "count": len(manifest), "batches": manifest}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    pdfs = sum(1 for m in manifest if m["format"] == "pdf")
    print(f"Đã sinh {len(manifest)} bộ vào {args.out}: {pdfs} PDF, {len(manifest) - pdfs} ảnh")
    for m in manifest:
        print(f"  {m['batch_id']:<48} {m['format']:<5} {m['line_count']:>4} dòng  {m['expected_status']}")


if __name__ == "__main__":
    main()
