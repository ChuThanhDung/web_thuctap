"""Sinh bộ dữ liệu vàng (golden dataset) gồm các bộ PO + Phiếu nhập kho + Hóa đơn XML kèm đáp án chuẩn.

Chạy:  python scripts/generate_golden_dataset.py [--count 60] [--seed 20261024] [--out dataset/golden]

Đặc điểm:
- Xác định (deterministic): cùng `--seed` luôn sinh ra đúng cùng byte, nên có thể commit và so sánh qua các lần chạy.
- Danh mục hàng theo ngành, giá và số lượng theo quy cách; nhà cung cấp có MST, địa chỉ cố định.
- Số dòng hàng thay đổi từ 1 đến 1000 (nhóm small / medium / large / xlarge / stress).
- Một nửa số bộ khớp, một nửa lệch; các loại lệch được rải đều (xem MISMATCH_KINDS).
- Mỗi bộ có `ground_truth.json` ghi kết quả đúng (`expected_status`) và danh sách sai lệch đã cài vào. Đáp án do kịch bản
  sinh dữ liệu quyết định, KHÔNG lấy từ chính engine đối soát, để có thể đo engine đúng hay sai.

Ngưỡng mặc định (giống engine khi bảng thresholds trống): mã số thuế, thuế suất, đơn giá và số lượng phải khớp tuyệt
đối; tiền (thành tiền, thuế, tổng) chỉ được lệch tối đa 1.000 đ do làm tròn. "Lệch nhẹ" (minor_diff) vì vậy chỉ còn
là lệch làm tròn.
"""

import argparse
import json
import random
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "dataset" / "golden"

# ── Danh mục hàng hóa theo ngành ──
# Mỗi mặt hàng: (tên, ĐVT, tiền tố mã, (giá thấp, giá cao) hoặc một giá, (SL thấp, SL cao), quy cách).
# Giá tăng dần theo quy cách (quy cách sau đắt hơn; một giá khi quy cách chỉ khác màu/cỡ), cộng thêm chênh lệch nhỏ theo thương hiệu,
# nên một bộ chứng từ đọc lên thấy hợp lý: máy in vài triệu/cái, bu lông vài nghìn/con...
# fmt: off
CATALOG = {
    "electrical": [
        ("Dây điện đơn", "Cuộn", "DDN", (420_000, 2_350_000), (5, 80), ["1x1.5mm2 100m", "1x2.5mm2 100m", "1x4mm2 100m", "1x6mm2 100m"]),
        ("Cáp điện 2 lõi", "Mét", "CAP", (9_500, 46_000), (50, 1000), ["2x1.5mm2", "2x2.5mm2", "2x4mm2", "2x6mm2"]),
        ("Công tắc", "Cái", "CTC", (24_000, 92_000), (10, 300), ["1 chiều", "2 chiều", "đôi 1 chiều", "ba 1 chiều"]),
        ("Ổ cắm", "Cái", "OCM", (36_000, 185_000), (10, 300), ["đơn 3 chấu", "đôi 2 chấu", "đôi 3 chấu", "đôi có USB"]),
        ("Băng keo điện đen", "Cuộn", "BKD", (4_500, 8_500), (50, 1000), ["10m", "20m"]),
        ("Đèn LED âm trần", "Bộ", "DAT", (68_000, 235_000), (10, 400), ["7W", "9W", "12W", "18W"]),
        ("Bóng đèn LED bulb", "Bóng", "BLB", (26_000, 125_000), (20, 500), ["9W", "12W", "15W", "20W", "30W"]),
        ("Aptomat 1 pha", "Cái", "APT", (88_000, 265_000), (5, 100), ["10A", "16A", "20A", "32A", "40A"]),
        ("Ống luồn dây điện", "Cây", "OLD", (12_500, 31_000), (20, 500), ["phi 16", "phi 20", "phi 25", "phi 32"]),
    ],
    "office": [
        ("Giấy in A4", "Ram", "GA4", (68_000, 96_000), (10, 300), ["70gsm", "80gsm"]),
        ("Giấy in A3", "Ram", "GA3", (142_000, 192_000), (5, 50), ["70gsm", "80gsm"]),
        ("Bút bi (hộp 20 cây)", "Hộp", "BBI", 68_000, (5, 100), ["xanh 0.5mm", "đỏ 0.5mm", "đen 0.5mm", "xanh 0.7mm"]),
        ("Bút dạ quang (hộp 10 cây)", "Hộp", "BDQ", 86_000, (2, 40), ["vàng", "xanh lá", "hồng", "cam"]),
        ("File hồ sơ", "Cái", "FHS", (8_500, 66_000), (10, 300), ["lá A4", "nhựa 20 lá", "còng 5cm", "còng 7cm"]),
        ("Hộp mực in laser", "Hộp", "MUC", (290_000, 1_450_000), (1, 30), ["mã 12A", "mã 05A", "mã 26A", "mã 85A"]),
        ("Kẹp giấy", "Hộp", "KEP", (4_000, 26_000), (10, 200), ["số 1", "số 2", "bướm 19mm", "bướm 25mm", "bướm 32mm"]),
        ("Sổ ghi chép", "Quyển", "SGC", (18_000, 66_000), (10, 200), ["A5 120 trang", "B5 160 trang", "A4 200 trang"]),
        ("Ghế văn phòng", "Chiếc", "GVP", (850_000, 3_600_000), (1, 20), ["lưới lưng trung", "lưới lưng cao", "xoay bọc da"]),
        ("Tủ hồ sơ sắt", "Cái", "TUS", (2_250_000, 6_600_000), (1, 8), ["2 cánh kính", "3 khoang", "4 ngăn kéo"]),
        ("Máy in laser", "Cái", "MIN", (3_250_000, 18_500_000), (1, 5), ["A4 đơn năng", "A4 đa năng", "A3 đơn năng"]),
    ],
    "construction": [
        ("Xi măng", "Bao", "XMG", (79_000, 112_000), (50, 800), ["PCB30 50kg", "PCB40 50kg", "PCB50 50kg"]),
        ("Thép cây", "Cây", "THP", (96_000, 525_000), (20, 400), ["phi 10", "phi 12", "phi 14", "phi 16", "phi 18", "phi 20"]),
        ("Gạch ốp lát", "Thùng", "GOL", (165_000, 485_000), (10, 300), ["30x30 chống trơn", "30x60 men bóng", "60x60 men mờ", "80x80 bóng kính"]),
        ("Sơn nước nội thất", "Thùng", "SON", (460_000, 2_850_000), (2, 60), ["5L trắng", "5L xanh ngọc", "18L kem", "18L trắng"]),
        ("Ống nhựa PVC 4m", "Cây", "PVC", (18_500, 182_000), (10, 300), ["phi 21", "phi 27", "phi 34", "phi 42", "phi 60", "phi 90"]),
        ("Bu lông inox", "Con", "BUL", (1_500, 18_500), (100, 2000), ["M6x30", "M8x40", "M10x50", "M12x60", "M16x80"]),
        ("Vít bắn tôn (hộp 100 con)", "Hộp", "VIT", (36_000, 122_000), (5, 100), ["4x25", "5x35", "6x50"]),
        ("Keo dán gạch 25kg", "Bao", "KDG", (165_000, 325_000), (10, 200), ["loại C1", "loại C2", "loại C2TE"]),
        ("Đá xây dựng", "Khối", "DAX", (295_000, 455_000), (5, 60), ["4x6", "1x2", "0x4"]),
    ],
    "safety": [
        ("Găng tay bảo hộ", "Đôi", "GTB", (8_500, 86_000), (50, 1000), ["len", "sợi phủ PU", "cao su chống hóa chất", "da hàn"]),
        ("Mũ bảo hộ", "Chiếc", "MBH", 68_000, (10, 300), ["trắng", "vàng", "xanh", "đỏ"]),
        ("Giày bảo hộ", "Đôi", "GBH", 465_000, (5, 100), ["size 39", "size 40", "size 41", "size 42", "size 43"]),
        ("Áo phản quang", "Chiếc", "APQ", 52_000, (20, 300), ["cam size L", "vàng size L", "cam size XL", "vàng size XL"]),
        ("Áo thun đồng phục", "Chiếc", "ATD", 118_000, (20, 400), ["size S", "size M", "size L", "size XL", "size XXL"]),
        ("Khẩu trang y tế", "Hộp", "KTY", (36_000, 285_000), (10, 300), ["3 lớp (50 cái)", "4 lớp (50 cái)", "N95 (20 cái)"]),
        ("Kính bảo hộ", "Chiếc", "KBH", (26_000, 122_000), (10, 200), ["trong suốt", "chống bụi", "chống tia UV"]),
        ("Dây đai an toàn", "Bộ", "DDA", (355_000, 1_250_000), (2, 40), ["bán thân", "toàn thân 1 móc", "toàn thân 2 móc"]),
    ],
    "packaging": [
        ("Thùng carton 3 lớp", "Cái", "TC3", (5_200, 22_500), (100, 3000), ["30x20x20cm", "40x30x30cm", "50x40x40cm", "60x40x40cm"]),
        ("Thùng carton 5 lớp", "Cái", "TC5", (9_500, 36_000), (100, 2000), ["30x20x20cm", "40x30x30cm", "50x40x40cm", "60x40x40cm"]),
        ("Màng PE quấn pallet", "Cuộn", "MPE", (86_000, 162_000), (10, 300), ["50cm x 2.5kg", "50cm x 3kg", "50cm x 4kg"]),
        ("Băng keo đóng hàng", "Cuộn", "BKH", (14_500, 32_500), (50, 1000), ["trong 100 yard", "trong 200 yard"]),
        ("Túi nilon PE", "Kg", "TPE", (38_500, 56_000), (20, 500), ["30x40cm", "40x60cm", "60x90cm"]),
        ("Xốp hơi chống sốc", "Cuộn", "XOP", (185_000, 425_000), (2, 50), ["0.5m x 100m", "1m x 100m", "1.2m x 100m"]),
        ("Pallet nhựa", "Cái", "PLN", (385_000, 960_000), (5, 100), ["800x1200mm", "1000x1200mm", "1100x1100mm"]),
        ("Dây đai nhựa PP", "Cuộn", "DPP", (182_000, 285_000), (5, 80), ["12mm", "15mm"]),
    ],
    "it": [
        ("Ổ cứng SSD", "Cái", "SSD", (660_000, 2_650_000), (1, 50), ["256GB SATA", "512GB SATA", "512GB NVMe", "1TB NVMe"]),
        ("RAM laptop", "Thanh", "RAM", (460_000, 1_650_000), (1, 40), ["DDR4 8GB", "DDR4 16GB", "DDR5 16GB"]),
        ("Chuột máy tính", "Cái", "CHU", (86_000, 660_000), (5, 100), ["có dây", "không dây", "không dây công thái học"]),
        ("Bàn phím", "Cái", "BPH", (152_000, 1_550_000), (5, 100), ["có dây", "không dây", "cơ"]),
        ("Màn hình", "Cái", "MAN", (2_150_000, 6_600_000), (1, 20), ["22 inch FHD", "24 inch FHD", "27 inch 2K"]),
        ("Cáp mạng thùng 305m", "Thùng", "CMG", (1_250_000, 3_250_000), (1, 20), ["Cat5e UTP", "Cat6 UTP", "Cat6 FTP"]),
        ("Hạt mạng RJ45 (hộp 100 cái)", "Hộp", "RJ4", (82_000, 265_000), (1, 30), ["Cat5e", "Cat6"]),
        ("Bộ phát wifi", "Cái", "WIF", (660_000, 2_850_000), (1, 20), ["AC1200", "AX1800", "AX3000"]),
        ("Switch mạng", "Cái", "SWI", (355_000, 3_550_000), (1, 15), ["8 cổng", "16 cổng", "24 cổng"]),
        ("USB", "Cái", "USB", (92_000, 325_000), (5, 100), ["32GB", "64GB", "128GB"]),
    ],
    "cleaning": [
        ("Nước lau sàn", "Can", "NLS", 128_000, (5, 100), ["5L hương chanh", "5L hương sả", "5L hương lavender"]),
        ("Nước rửa tay", "Chai", "NRT", (32_000, 82_000), (10, 200), ["500ml", "1L"]),
        ("Khăn giấy lau tay", "Thùng", "KGL", (285_000, 525_000), (1, 30), ["1 lớp 40 gói", "2 lớp 20 gói"]),
        ("Giấy vệ sinh cuộn lớn", "Thùng", "GVS", (325_000, 585_000), (1, 30), ["2 lớp 12 cuộn", "3 lớp 10 cuộn"]),
        ("Túi rác", "Kg", "TRC", 42_000, (10, 200), ["màu 55x65", "đen 64x78", "đen 90x110"]),
        ("Cây lau nhà", "Cái", "CLN", (122_000, 385_000), (2, 40), ["bản dẹt", "xoay 360"]),
        ("Nước rửa chén", "Can", "NRC", (86_000, 152_000), (5, 100), ["3.6kg", "5kg"]),
    ],
}
BRANDS = ["Hưng Long", "Đại Phát", "Tân Á", "Kim Sơn", "Phú Gia"]  # thương hiệu giả định

# Nhà cung cấp gắn với ngành hàng; bộ nhiều dòng (trên LARGE_ORDER_LINES) mua của nhà phân phối tổng hợp.
SUPPLIERS = [
    ("CÔNG TY TNHH ĐIỆN MÁY MINH KHANG", "electrical", "MK", "Số 45 Lý Thường Kiệt, Phường 7, Quận Tân Bình, TP. Hồ Chí Minh"),
    ("CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN NAM VIỆT", "electrical", "NV", "Lô B2, KCN Quang Minh, Huyện Mê Linh, Hà Nội"),
    ("CÔNG TY CỔ PHẦN THIẾT BỊ VĂN PHÒNG TÂN ĐÔ", "office", "TD", "Số 88 Láng Hạ, Phường Láng Hạ, Quận Đống Đa, Hà Nội"),
    ("CÔNG TY CỔ PHẦN XÂY DỰNG PHÚC LỘC", "construction", "PL", "Số 120 Quốc lộ 1A, Phường Linh Trung, TP. Thủ Đức, TP. Hồ Chí Minh"),
    ("CÔNG TY TNHH VẬT LIỆU XÂY DỰNG HÒA BÌNH", "construction", "HB", "Số 9 Nguyễn Văn Linh, Quận Long Biên, Hà Nội"),
    ("CÔNG TY TNHH BẢO HỘ LAO ĐỘNG THIÊN PHÚ", "safety", "TP", "Số 27 Cộng Hòa, Phường 4, Quận Tân Bình, TP. Hồ Chí Minh"),
    ("CÔNG TY TNHH BAO BÌ SÀI GÒN", "packaging", "SG", "Lô C4, KCN Tân Bình, Phường Tây Thạnh, Quận Tân Phú, TP. Hồ Chí Minh"),
    ("CÔNG TY CỔ PHẦN CÔNG NGHỆ TIN HỌC ĐẠI VIỆT", "it", "DV", "Số 15 Duy Tân, Phường Dịch Vọng Hậu, Quận Cầu Giấy, Hà Nội"),
    ("CÔNG TY TNHH VỆ SINH CÔNG NGHIỆP BÌNH AN", "cleaning", "BA", "Số 61 Phan Đăng Lưu, Phường 3, Quận Bình Thạnh, TP. Hồ Chí Minh"),
]
GENERAL_SUPPLIERS = [
    ("CÔNG TY CỔ PHẦN PHÂN PHỐI VẬT TƯ AN PHÚ", "all", "AP", "Số 230 Trường Chinh, Phường Tân Thới Nhất, Quận 12, TP. Hồ Chí Minh"),
    ("CÔNG TY TNHH THƯƠNG MẠI TỔNG HỢP HƯNG THỊNH", "all", "HT", "Số 5 Phạm Văn Đồng, Quận Bắc Từ Liêm, Hà Nội"),
]
# fmt: on
SUPPLIER_INFO = {
    name: {"industry": ind, "code": code, "address": addr} for name, ind, code, addr in SUPPLIERS + GENERAL_SUPPLIERS
}
LARGE_ORDER_LINES = 25

PEOPLE = [
    "Nguyễn Văn An",
    "Trần Thị Bích",
    "Lê Minh Châu",
    "Phạm Quốc Dũng",
    "Hoàng Thu Hà",
    "Vũ Đức Hải",
    "Đặng Thị Hồng",
    "Bùi Văn Khoa",
    "Đỗ Thị Lan",
    "Ngô Thanh Long",
    "Dương Thị Mai",
    "Lý Quang Nam",
    "Phan Thị Ngọc",
    "Trịnh Văn Phúc",
    "Đinh Thị Quỳnh",
    "Mai Văn Sơn",
    "Tạ Thị Thảo",
    "Hồ Minh Tuấn",
    "Lương Thị Uyên",
    "Cao Văn Vinh",
]
BUYER = ("CÔNG TY CỔ PHẦN CÔNG NGHỆ GONOW VIỆT NAM", "0316784251")

# Nhóm theo số dòng hàng: (tên, khoảng số dòng, số bộ khớp, số bộ lệch). Tổng khi --count 60 là 60.
BUCKETS = [
    ("small", (1, 3), 10, 10),
    ("medium", (5, 15), 10, 10),
    ("large", (30, 80), 6, 6),
    ("xlarge", (150, 300), 3, 3),
    ("stress", (800, 1000), 1, 1),
]

# Loại lệch -> kết quả đúng. Thứ tự được xoay vòng để mọi loại đều xuất hiện ở nhiều nhóm kích thước.
MISMATCH_KINDS = [
    ("price_up_invoice", "major_diff"),
    ("qty_over_invoice", "major_diff"),
    ("short_delivery", "major_diff"),
    ("tax_id_mismatch", "major_diff"),
    ("vat_rate_mismatch", "major_diff"),
    ("product_missing_on_grn", "major_diff"),
    ("extra_product_on_invoice", "major_diff"),
    ("total_tampered", "major_diff"),
    ("short_by_one", "major_diff"),
    ("price_off_small", "major_diff"),
    ("rounding_vat", "minor_diff"),
    ("tax_over_limit", "major_diff"),
    ("rounding_line", "minor_diff"),
]


@dataclass
class Item:
    name: str
    sku: str
    unit: str
    qty: int
    price: int


@dataclass
class Scenario:
    batch_id: str
    category: str
    kind: str  # "match" hoặc một loại trong MISMATCH_KINDS
    expected_status: str
    line_count: int
    supplier: tuple[str, str]
    po_no: str
    grn_no: str
    inv_serial: str
    inv_no: str
    vat_po: int
    vat_inv: int
    dates: tuple[str, str, str]
    po_items: list[Item] = field(default_factory=list)
    grn_items: list[tuple[Item, int]] = field(default_factory=list)  # (dòng hàng, số lượng thực nhập)
    inv_items: list[Item] = field(default_factory=list)
    inv_supplier_tax: str = ""
    inv_total_override: int | None = None
    inv_tax_adjust: int = 0  # đồng lệch thêm vào tiền thuế hóa đơn (làm tròn hoặc sai)
    inv_line_adjust: dict[int, int] = field(default_factory=dict)  # dòng -> đồng lệch thành tiền do làm tròn
    discrepancies: list[dict] = field(default_factory=list)
    people: dict[str, str] = field(default_factory=dict)  # người lập, giao hàng, thủ kho... cho bản in


# ── Số thành chữ tiếng Việt (cho phần "bằng chữ" của chứng từ) ──
_DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"]


def _read_three(number: int, full: bool) -> str:
    hundreds, rest = divmod(number, 100)
    tens, ones = divmod(rest, 10)
    parts = []
    if full or hundreds:
        parts.append(f"{_DIGITS[hundreds]} trăm")
    if tens > 1:
        parts.append(f"{_DIGITS[tens]} mươi")
    elif tens == 1:
        parts.append("mười")
    elif (full or hundreds) and ones:
        parts.append("lẻ")
    if ones:
        if tens > 1 and ones == 1:
            parts.append("mốt")
        elif tens >= 1 and ones == 5:
            parts.append("lăm")
        else:
            parts.append(_DIGITS[ones])
    return " ".join(parts)


def amount_in_words(value: int) -> str:
    if value == 0:
        return "Không đồng."
    units = ["", " nghìn", " triệu", " tỷ", " nghìn tỷ"]
    groups = []
    while value:
        value, group = divmod(value, 1000)
        groups.append(group)
    words = []
    for index in range(len(groups) - 1, -1, -1):
        if groups[index]:
            words.append(_read_three(groups[index], full=index != len(groups) - 1) + units[index])
    text = " ".join(words)
    return text[0].upper() + text[1:] + " đồng chẵn."


# ── Sinh dữ liệu ──
BRAND_CODES = ["HL", "DP", "TA", "KS", "PG"]
BRAND_PRICE_FACTOR = [0.95, 0.98, 1.0, 1.03, 1.06]


def round_price(value: float) -> int:
    for limit, step in ((10_000, 100), (200_000, 500), (2_000_000, 1_000)):
        if value < limit:
            return max(step, int(round(value / step)) * step)
    return int(round(value / 10_000)) * 10_000


def round_qty(value: float) -> int:
    step = 10 if value > 200 else 5 if value > 50 else 1
    return max(1, int(round(value / step)) * step)


def catalog_for(industry: str) -> list[tuple]:
    if industry == "all":
        return [entry for entries in CATALOG.values() for entry in entries]
    return CATALOG[industry]


def make_items(rng: random.Random, count: int, industry: str, exclude: frozenset[str] = frozenset()) -> list[Item]:
    """Chọn `count` mặt hàng không trùng của ngành, giá và số lượng theo quy cách từng mặt hàng."""
    entries = catalog_for(industry)
    pairs = [(e, s) for e in range(len(entries)) for s in range(len(entries[e][5]))]
    if count <= len(pairs):
        # Bộ nhỏ: mỗi quy cách chỉ một thương hiệu, như một đơn hàng thật.
        rng.shuffle(pairs)
        combos = [(e, s, rng.randrange(len(BRANDS))) for e, s in pairs]
    else:
        combos = [(e, s, b) for e, s in pairs for b in range(len(BRANDS))]
        rng.shuffle(combos)
    items = []
    for e, s, b in combos:
        name, unit, prefix, price_range, (qty_lo, qty_hi), specs = entries[e]
        sku = f"{prefix}{s + 1:02d}-{BRAND_CODES[b]}"
        if sku in exclude:
            continue
        if isinstance(price_range, int):
            list_price = price_range  # quy cách chỉ khác màu/cỡ: cùng giá
        else:
            step = s / (len(specs) - 1) if len(specs) > 1 else 0
            list_price = price_range[0] + (price_range[1] - price_range[0]) * step
        price = round_price(list_price * BRAND_PRICE_FACTOR[b] * rng.uniform(0.97, 1.03))
        qty = round_qty(qty_lo * (qty_hi / qty_lo) ** rng.random())  # phân bố log: đơn nhỏ nhiều hơn đơn lớn
        main, _, pack = name.partition(" (")
        full_name = f"{main} {specs[s]} {BRANDS[b]}" + (f" ({pack}" if pack else "")
        items.append(Item(full_name, sku, unit, qty, price))
        if len(items) == count:
            break
    if len(items) < count:
        raise ValueError(f"Danh mục ngành {industry} không đủ {count} mặt hàng")
    # Xếp theo danh mục rồi quy cách, giống thứ tự dòng trên đơn hàng thật.
    return sorted(items, key=lambda item: item.sku)


def tax_id(rng: random.Random) -> str:
    return "0" + "".join(str(rng.randint(0, 9)) for _ in range(9))


def supplier_tax_id(name: str) -> str:
    # Mỗi nhà cung cấp một MST cố định ở mọi bộ (random.Random với chuỗi là xác định qua các lần chạy).
    return tax_id(random.Random(name))


def mutate(rng: random.Random, scenario: Scenario, base: list[Item]) -> None:
    """Dựng ba danh sách dòng hàng từ danh sách gốc và cài sai lệch theo `scenario.kind`."""
    scenario.po_items = [Item(**vars(i)) for i in base]
    scenario.grn_items = [(Item(**vars(i)), i.qty) for i in base]
    scenario.inv_items = [Item(**vars(i)) for i in base]
    scenario.inv_supplier_tax = scenario.supplier[1]

    kind = scenario.kind
    count = len(base)
    # Số dòng bị sửa tăng theo kích thước bộ nhưng không quá vài dòng, như lỗi thật.
    n_touched = min(count, max(1, count // 25 + 1))
    touched = rng.sample(range(count), n_touched)

    def pick(predicate) -> list[int]:
        """Ưu tiên dòng hợp với loại lỗi (vd. giao thiếu ở dòng số lượng lớn), thiếu thì lấy dòng bất kỳ."""
        good = [i for i in range(count) if predicate(base[i])]
        return rng.sample(good, min(len(good), n_touched)) if good else touched

    def note(kind_name: str, document: str, description: str, index: int | None = None):
        entry = {"type": kind_name, "document": document, "description": description}
        if index is not None:
            entry["sku"] = base[index].sku
        scenario.discrepancies.append(entry)

    if kind == "price_up_invoice":
        for i in touched:
            old = scenario.inv_items[i].price
            scenario.inv_items[i].price = max(round_price(old * rng.uniform(1.08, 1.25)), old + 100)
            note("price", "invoice", f"Đơn giá hóa đơn {scenario.inv_items[i].price:,} đ, PO/GRN {old:,} đ", i)
    elif kind == "qty_over_invoice":
        for i in pick(lambda it: it.qty >= 20):
            old = scenario.inv_items[i].qty
            scenario.inv_items[i].qty = old + max(6, int(old * rng.uniform(0.1, 0.3)))
            note("qty", "invoice", f"Hóa đơn ghi số lượng {scenario.inv_items[i].qty}, PO đặt và kho nhập {old}", i)
    elif kind == "short_delivery":
        for i in pick(lambda it: it.qty >= 20):
            item, actual = scenario.grn_items[i]
            short = max(6, int(item.qty * rng.uniform(0.15, 0.4)))
            scenario.grn_items[i] = (item, max(0, item.qty - short))
            note("short_delivery", "grn", f"Kho chỉ nhập {item.qty - short} trên {item.qty} đặt", i)
    elif kind == "tax_id_mismatch":
        scenario.inv_supplier_tax = tax_id(rng)
        note("tax_id", "invoice", f"MST hóa đơn {scenario.inv_supplier_tax} khác PO/GRN {scenario.supplier[1]}")
    elif kind == "vat_rate_mismatch":
        scenario.vat_inv = 10 if scenario.vat_po == 8 else 8
        note("vat_rate", "invoice", f"Thuế suất hóa đơn {scenario.vat_inv}% khác PO {scenario.vat_po}%")
    elif kind == "product_missing_on_grn":
        index = touched[0]
        item = scenario.grn_items.pop(index)[0]
        note("missing_product", "grn", f"Phiếu nhập kho không có mặt hàng {item.name}", index)
    elif kind == "extra_product_on_invoice":
        # Nhà cung cấp xuất thêm một mặt hàng cùng ngành mà bên mua không đặt và kho không nhận.
        industry = SUPPLIER_INFO[scenario.supplier[0]]["industry"]
        extra = make_items(rng, 1, industry, exclude=frozenset(i.sku for i in base))[0]
        scenario.inv_items.append(extra)
        note("extra_product", "invoice", f"Hóa đơn có mặt hàng {extra.name} không có trong PO và GRN")
    elif kind == "total_tampered":
        subtotal = sum(i.qty * i.price for i in scenario.inv_items)
        bump = round_price(max(500_000, subtotal // 20))
        scenario.inv_total_override = subtotal + subtotal * scenario.vat_inv // 100 + bump
        note("total", "invoice", "Tổng thanh toán trên hóa đơn lớn hơn tổng các dòng hàng")
    elif kind == "short_by_one":
        # Ngưỡng số lượng là 0: kho nhập thiếu dù chỉ 1 đơn vị vẫn là lệch nặng.
        i = pick(lambda it: it.qty >= 20)[0]
        item, _ = scenario.grn_items[i]
        scenario.grn_items[i] = (item, item.qty - 1)
        note("qty", "grn", f"Kho nhập {item.qty - 1} trên {item.qty}, thiếu 1 đơn vị", i)
    elif kind == "price_off_small":
        # Đơn giá phải khớp tuyệt đối: hóa đơn cao hơn PO 100 đ/đơn vị vẫn là lệch nặng.
        i = pick(lambda it: it.price >= 50_000)[0]
        scenario.inv_items[i].price += 100
        note("price", "invoice", f"Đơn giá hóa đơn {scenario.inv_items[i].price:,} đ, PO {base[i].price:,} đ", i)
    elif kind == "rounding_vat":
        # Tiền thuế làm tròn khác PO vài trăm đồng (dưới ngưỡng 1.000 đ): lệch nhẹ.
        scenario.inv_tax_adjust = rng.choice([-1, 1]) * rng.randint(1, 999)
        note("rounding", "invoice", f"Tiền thuế GTGT trên hóa đơn lệch {scenario.inv_tax_adjust:+,} đ do làm tròn")
    elif kind == "rounding_line":
        # Thành tiền một dòng làm tròn khác đơn giá x số lượng vài trăm đồng (cả thuế vẫn dưới 1.000 đ): lệch nhẹ.
        i = touched[0]
        scenario.inv_line_adjust = {i: rng.choice([-1, 1]) * rng.randint(1, 800)}
        note("rounding", "invoice", f"Thành tiền dòng lệch {scenario.inv_line_adjust[i]:+,} đ do làm tròn", i)
    elif kind == "tax_over_limit":
        # Tiền thuế lệch vượt ngưỡng làm tròn 1.000 đ: lệch nặng, kiểm tra biên ngưỡng.
        scenario.inv_tax_adjust = rng.randint(1_001, 5_000)
        note(
            "total", "invoice", f"Tiền thuế GTGT trên hóa đơn lệch {scenario.inv_tax_adjust:+,} đ, vượt ngưỡng 1.000 đ"
        )


def invoice_amounts(s: Scenario) -> tuple[list[tuple[Item, int]], int, int, int]:
    """Các dòng hóa đơn kèm thành tiền, cộng tiền hàng, tiền thuế, tổng thanh toán (đã tính các chỗ làm tròn/sửa)."""
    lines = [(item, item.qty * item.price + s.inv_line_adjust.get(n, 0)) for n, item in enumerate(s.inv_items)]
    subtotal = sum(amount for _, amount in lines)
    tax = subtotal * s.vat_inv // 100 + s.inv_tax_adjust
    total = s.inv_total_override if s.inv_total_override is not None else subtotal + tax
    return lines, subtotal, tax, total


def build_scenarios(count: int, seed: int) -> list[Scenario]:
    rng = random.Random(seed)
    total_plan = sum(m + x for _, _, m, x in BUCKETS)
    plan: list[tuple[str, tuple[int, int], str]] = []
    for name, lines, matched, mismatched in BUCKETS:
        plan += [(name, lines, "match")] * matched
        plan += [(name, lines, "mismatch")] * mismatched
    if count != total_plan:
        # Thu nhỏ/phóng to theo tỷ lệ nhưng giữ đủ cả khớp và lệch ở từng nhóm.
        plan = [plan[index * len(plan) // count] for index in range(count)]

    kinds = [kind for kind, _ in MISMATCH_KINDS]
    statuses = dict(MISMATCH_KINDS)
    kind_cycle = 0
    scenarios = []
    for number, (bucket, (low, high), outcome) in enumerate(plan, start=1):
        line_count = rng.randint(low, high)
        kind = "match"
        if outcome == "mismatch":
            kind = kinds[kind_cycle % len(kinds)]
            kind_cycle += 1
            if kind == "product_missing_on_grn" and line_count < 2:
                line_count = 2  # cần ít nhất 2 dòng để bỏ một dòng mà bộ vẫn còn hàng
        pool = GENERAL_SUPPLIERS if line_count > LARGE_ORDER_LINES else SUPPLIERS
        supplier_name = pool[number % len(pool)][0]
        supplier = (supplier_name, supplier_tax_id(supplier_name))
        month = rng.randint(1, 9)
        day = rng.randint(1, 20)
        scenario = Scenario(
            batch_id=f"golden_{number:03d}_{bucket}_{kind}",
            category=bucket,
            kind=kind,
            expected_status="matched" if kind == "match" else statuses[kind],
            line_count=line_count,
            supplier=supplier,
            po_no=f"PO-2026-{number:04d}",
            grn_no=f"PNK-{number + 100:04d}",
            inv_serial=f"1C26T{SUPPLIER_INFO[supplier_name]['code']}",
            inv_no=f"{number + 5000:08d}",
            vat_po=rng.choice([8, 10]),
            vat_inv=0,
            dates=(f"2026-{month:02d}-{day:02d}", f"2026-{month:02d}-{day + 5:02d}", f"2026-{month:02d}-{day + 7:02d}"),
        )
        scenario.vat_inv = scenario.vat_po
        base = make_items(rng, line_count, SUPPLIER_INFO[supplier_name]["industry"])
        names = random.Random(f"{seed}-{number}").sample(PEOPLE, 6)
        scenario.people = dict(
            zip(("buyer_contact", "seller_rep", "deliverer", "preparer", "storekeeper", "chief_accountant"), names)
        )
        mutate(rng, scenario, base)
        scenarios.append(scenario)
    return scenarios


# ── Dựng XML ──
def money(value: int) -> str:
    return str(int(value))


def po_xml(s: Scenario) -> str:
    subtotal = sum(i.qty * i.price for i in s.po_items)
    tax = subtotal * s.vat_po // 100
    rows = "".join(
        f"""
    <DongHang>
      <STT>{n}</STT>
      <MaHang>{escape(i.sku)}</MaHang>
      <TenHang>{escape(i.name)}</TenHang>
      <DonViTinh>{escape(i.unit)}</DonViTinh>
      <SoLuong>{i.qty}</SoLuong>
      <DonGia>{money(i.price)}</DonGia>
      <ThanhTien>{money(i.qty * i.price)}</ThanhTien>
    </DongHang>"""
        for n, i in enumerate(s.po_items, start=1)
    )
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<DonDatHang>
  <SoDon>{s.po_no}</SoDon>
  <NgayLap>{s.dates[0]}</NgayLap>
  <BenMua>
    <Ten>{escape(BUYER[0])}</Ten>
    <MST>{BUYER[1]}</MST>
    <DiaChi>Tầng 5, Tòa nhà Sông Đà, 18 Phạm Hùng, Phường Mỹ Đình 1, Quận Nam Từ Liêm, Hà Nội</DiaChi>
  </BenMua>
  <BenBan>
    <Ten>{escape(s.supplier[0])}</Ten>
    <MST>{s.supplier[1]}</MST>
    <DiaChi>{escape(SUPPLIER_INFO[s.supplier[0]]["address"])}</DiaChi>
  </BenBan>
  <ChiTietDonHang>{rows}
  </ChiTietDonHang>
  <TongTienHang>{money(subtotal)}</TongTienHang>
  <ThueSuatGTGT>{s.vat_po}%</ThueSuatGTGT>
  <TienThueGTGT>{money(tax)}</TienThueGTGT>
  <TongTienThanhToan>{money(subtotal + tax)}</TongTienThanhToan>
  <BangChu>{amount_in_words(subtotal + tax)}</BangChu>
  <PhuongThucThanhToan>Chuyển khoản</PhuongThucThanhToan>
</DonDatHang>
"""


def grn_xml(s: Scenario) -> str:
    # Phiếu nhập kho không thể hiện thuế: tổng là tiền hàng chưa VAT, tính theo số lượng thực nhập.
    subtotal = sum(actual * item.price for item, actual in s.grn_items)
    rows = "".join(
        f"""
    <DongHang>
      <STT>{n}</STT>
      <MaHang>{escape(item.sku)}</MaHang>
      <TenHang>{escape(item.name)}</TenHang>
      <DonViTinh>{escape(item.unit)}</DonViTinh>
      <SoLuongTheoChungTu>{item.qty}</SoLuongTheoChungTu>
      <SoLuongThucNhap>{actual}</SoLuongThucNhap>
      <DonGia>{money(item.price)}</DonGia>
      <ThanhTien>{money(actual * item.price)}</ThanhTien>
    </DongHang>"""
        for n, (item, actual) in enumerate(s.grn_items, start=1)
    )
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<PhieuNhapKho>
  <MauSo>01-VT</MauSo>
  <SoPhieu>{s.grn_no}</SoPhieu>
  <NgayLap>{s.dates[1]}</NgayLap>
  <CanCu>Đơn đặt hàng số {s.po_no} ngày {s.dates[0]}</CanCu>
  <DonVi>
    <Ten>{escape(BUYER[0])}</Ten>
    <MST>{BUYER[1]}</MST>
    <BoPhan>Kho vận</BoPhan>
  </DonVi>
  <NguoiGiaoHang>{escape(s.people["deliverer"])} - {escape(s.supplier[0])}</NguoiGiaoHang>
  <NhapTaiKho>Kho GoNow, 18 Phạm Hùng, Nam Từ Liêm, Hà Nội</NhapTaiKho>
  <ChiTiet>{rows}
  </ChiTiet>
  <TongTien>{money(subtotal)}</TongTien>
  <BangChu>{amount_in_words(subtotal)}</BangChu>
  <SoChungTuGocKemTheo>01 (Đơn đặt hàng {s.po_no})</SoChungTuGocKemTheo>
</PhieuNhapKho>
"""


def invoice_xml(s: Scenario) -> str:
    lines, subtotal, tax, total = invoice_amounts(s)
    rows = "".join(
        f"""
        <HHDVu>
          <TChat>1</TChat>
          <STT>{n}</STT>
          <MHHDVu>{escape(i.sku)}</MHHDVu>
          <THHDVu>{escape(i.name)}</THHDVu>
          <DVTinh>{escape(i.unit)}</DVTinh>
          <SLuong>{i.qty}</SLuong>
          <DGia>{money(i.price)}</DGia>
          <ThTien>{money(amount)}</ThTien>
          <TSuat>{s.vat_inv}%</TSuat>
        </HHDVu>"""
        for n, (i, amount) in enumerate(lines, start=1)
    )
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<HDon>
  <DLHDon Id="data">
    <TTChung>
      <PBan>2.0.0</PBan>
      <THDon>Hóa đơn giá trị gia tăng</THDon>
      <KHMSHDon>1</KHMSHDon>
      <KHHDon>{s.inv_serial}</KHHDon>
      <SHDon>{s.inv_no}</SHDon>
      <NLap>{s.dates[2]}</NLap>
      <DVTTe>VND</DVTTe>
      <TGia>1</TGia>
      <HTTToan>TM/CK</HTTToan>
    </TTChung>
    <NDHDon>
      <NBan>
        <Ten>{escape(s.supplier[0])}</Ten>
        <MST>{s.inv_supplier_tax}</MST>
        <DChi>{escape(SUPPLIER_INFO[s.supplier[0]]["address"])}</DChi>
      </NBan>
      <NMua>
        <Ten>{escape(BUYER[0])}</Ten>
        <MST>{BUYER[1]}</MST>
        <DChi>Tầng 5, Tòa nhà Sông Đà, 18 Phạm Hùng, Phường Mỹ Đình 1, Quận Nam Từ Liêm, Hà Nội</DChi>
      </NMua>
      <DSHHDVu>{rows}
      </DSHHDVu>
      <TToan>
        <THTTLTSuat>
          <LTSuat>
            <TSuat>{s.vat_inv}%</TSuat>
            <ThTien>{money(subtotal)}</ThTien>
            <TThue>{money(tax)}</TThue>
          </LTSuat>
        </THTTLTSuat>
        <TgTCThue>{money(subtotal)}</TgTCThue>
        <TgTThue>{money(tax)}</TgTThue>
        <TgTTTBSo>{money(total)}</TgTTTBSo>
        <TgTTTBChu>{amount_in_words(total)}</TgTTTBChu>
      </TToan>
    </NDHDon>
  </DLHDon>
</HDon>
"""


def ground_truth(s: Scenario) -> dict:
    po_subtotal = sum(i.qty * i.price for i in s.po_items)
    inv_total = invoice_amounts(s)[3]
    return {
        "batch_id": s.batch_id,
        "format": "xml",
        "category": s.category,
        "kind": s.kind,
        "line_count": s.line_count,
        "expected_result": "MATCH" if s.expected_status == "matched" else "MISMATCH",
        "expected_status": s.expected_status,
        "documents": {
            "purchase_order": s.po_no,
            "goods_receipt": s.grn_no,
            "invoice": f"{s.inv_serial}-{s.inv_no}",
        },
        "buyer": BUYER[0],
        "seller": s.supplier[0],
        "po_total": po_subtotal + po_subtotal * s.vat_po // 100,
        "invoice_total": inv_total,
        "discrepancies": s.discrepancies,
    }


def write_dataset(out: Path, count: int, seed: int) -> list[dict]:
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    manifest = []
    for scenario in build_scenarios(count, seed):
        folder = out / scenario.batch_id
        folder.mkdir()
        (folder / "01_purchase_order.xml").write_text(po_xml(scenario), encoding="utf-8")
        (folder / "02_goods_receipt.xml").write_text(grn_xml(scenario), encoding="utf-8")
        (folder / "03_invoice.xml").write_text(invoice_xml(scenario), encoding="utf-8")
        truth = ground_truth(scenario)
        (folder / "ground_truth.json").write_text(json.dumps(truth, ensure_ascii=False, indent=2), encoding="utf-8")
        manifest.append(
            {k: truth[k] for k in ("batch_id", "category", "kind", "line_count", "expected_result", "expected_status")}
        )
    (out / "manifest.json").write_text(
        json.dumps({"seed": seed, "count": len(manifest), "batches": manifest}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--count", type=int, default=60)
    parser.add_argument("--seed", type=int, default=20261024)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    result = write_dataset(args.out, args.count, args.seed)
    by_status: dict[str, int] = {}
    for row in result:
        by_status[row["expected_status"]] = by_status.get(row["expected_status"], 0) + 1
    print(f"Đã sinh {len(result)} bộ vào {args.out}: {by_status}")
    print("Số dòng hàng:", min(r["line_count"] for r in result), "->", max(r["line_count"] for r in result))
