import os
import re
import xml.etree.ElementTree as ET
from typing import Any

from src.services.vision_parser import parse_vision_document


def remove_namespaces(xml_content: bytes) -> str:
    """Loại bỏ namespace để dễ dàng query bằng ElementTree không cần namespace dictionary."""
    xml_str = xml_content.decode("utf-8", errors="ignore")
    # Remove default namespace
    xml_str = re.sub(r'\sxmlns="[^"]+"', "", xml_str)
    # Remove prefix namespaces
    xml_str = re.sub(r'\sxmlns:\w+="[^"]+"', "", xml_str)
    # Remove schema locations
    xml_str = re.sub(r'\sxsi:schemaLocation="[^"]+"', "", xml_str)
    xml_str = re.sub(r'\sxsi:type="[^"]+"', "", xml_str)
    xml_str = re.sub(r'\sxmlns:xsi="[^"]+"', "", xml_str)

    # Remove prefix from tags (e.g. <cac:OrderLine> to <OrderLine>)
    xml_str = re.sub(r"<(/?)[a-zA-Z0-9_-]+:([a-zA-Z0-9_-]+)", r"<\1\2", xml_str)
    return xml_str


def parse_xml_to_dict(xml_content: bytes) -> ET.Element:
    """Parse XML và chuyển sang dict hoặc ElementTree đã được xóa namespace."""
    cleaned_xml = remove_namespaces(xml_content)
    return ET.fromstring(cleaned_xml)


def first_element(node: ET.Element, *paths: str) -> ET.Element | None:
    """Trả về phần tử đầu tiên tồn tại theo thứ tự ưu tiên của `paths`.

    Không dùng `a or b` với ET.Element: phần tử không có con luôn bị coi là False.
    """
    for path in paths:
        element = node.find(path)
        if element is not None:
            return element
    return None


def text_of(node: ET.Element, *paths: str) -> str:
    """Text đã strip của phần tử đầu tiên khớp `paths`; chuỗi rỗng nếu không có."""
    element = first_element(node, *paths)
    return element.text.strip() if element is not None and element.text else ""


def number_of(node: ET.Element, *paths: str) -> float:
    raw = text_of(node, *paths).replace(",", "")
    try:
        return float(raw) if raw else 0.0
    except ValueError:
        return 0.0


def parse_percent(value: str) -> int | None:
    try:
        return int(float(value.replace("%", "").strip())) if value.strip() else None
    except ValueError:
        return None


def detect_document_type(root: ET.Element) -> str:
    """Nhận diện loại tài liệu dựa trên tag root."""
    tag_lower = root.tag.lower()
    if tag_lower == "dondathang":
        return "po"
    if tag_lower == "phieunhapkho":
        return "grn"
    if "hdon" in tag_lower or "invoice" in tag_lower:
        return "invoice"
    elif "order" in tag_lower or "po" in tag_lower:
        return "po"
    elif "receiptadvice" in tag_lower or "grn" in tag_lower or "receipt" in tag_lower:
        return "grn"
    raise ValueError(f"Không nhận diện được loại tài liệu XML với root tag: {root.tag}")


def parse_invoice(root: ET.Element) -> dict[str, Any]:
    """Phân tích hóa đơn điện tử (GDT Việt Nam & UBL Standard & Mock XML)."""
    shdon = first_element(root, ".//InvoiceNumber", ".//SHDon", ".//ID", "ID", "InvoiceNumber")
    invoice_number = shdon.text.strip() if shdon is not None and shdon.text else ""

    nlap = first_element(root, ".//NLap", ".//IssueDate", "IssueDate", ".//Date")
    invoice_date = nlap.text.strip() if nlap is not None and nlap.text else ""

    supplier_name_el = first_element(
        root,
        ".//Vendor/Name",
        ".//NBan/Ten",
        ".//AccountingSupplierParty//PartyName/Name",
        ".//SellerSupplierParty//PartyName/Name",
    )
    supplier_name = supplier_name_el.text.strip() if supplier_name_el is not None and supplier_name_el.text else ""

    supplier_tax_id_el = first_element(
        root,
        ".//Vendor/TaxCode",
        ".//NBan/MST",
        ".//AccountingSupplierParty//PartyIdentification/ID",
        ".//SellerSupplierParty//PartyIdentification/ID",
    )
    supplier_tax_id = (
        supplier_tax_id_el.text.strip() if supplier_tax_id_el is not None and supplier_tax_id_el.text else ""
    )

    buyer_name_el = first_element(
        root,
        ".//Customer/Name",
        ".//NMua/Ten",
        ".//AccountingCustomerParty//PartyName/Name",
        ".//BuyerCustomerParty//PartyName/Name",
    )
    buyer_name = buyer_name_el.text.strip() if buyer_name_el is not None and buyer_name_el.text else ""

    thtien_el = first_element(
        root,
        ".//TotalAmount",
        ".//TToan/THTien",
        ".//LegalMonetaryTotal/TaxExclusiveAmount",
        ".//MonetaryTotal/PayableAmount",
    )
    total_amount_ex_vat = float(thtien_el.text) if thtien_el is not None and thtien_el.text else 0.0

    tgtttb_el = first_element(
        root, ".//TToan/TgTTTBSo", ".//LegalMonetaryTotal/PayableAmount", ".//MonetaryTotal/PayableAmount"
    )
    total_amount = float(tgtttb_el.text) if tgtttb_el is not None and tgtttb_el.text else total_amount_ex_vat

    # Parse line items
    line_items = []
    nodes = root.findall(".//DSHHDVu/HHDVu") or root.findall(".//InvoiceLine")
    for idx, item_node in enumerate(nodes, 1):
        name_el = first_element(item_node, "Ten", "THHDVu", ".//Item/Name")
        item_name = name_el.text.strip() if name_el is not None and name_el.text else ""

        unit_el = first_element(item_node, "DVT", "DVTinh", ".//InvoicedQuantity", ".//Quantity")
        unit = unit_el.text.strip() if unit_el is not None and unit_el.text else "PCE"
        if unit_el is not None and unit_el.get("unitCode"):
            unit = unit_el.get("unitCode")

        qty_el = first_element(item_node, "SLuong", ".//InvoicedQuantity", ".//Quantity")
        qty = float(qty_el.text) if qty_el is not None and qty_el.text else 0.0

        price_el = first_element(item_node, "DGia", ".//Price/PriceAmount")
        price = float(price_el.text) if price_el is not None and price_el.text else 0.0

        vat_el = item_node.find("TSuat")
        vat_str = vat_el.text.strip() if vat_el is not None and vat_el.text else ""
        try:
            vat_rate = int(vat_str.replace("%", "").strip()) if vat_str else None
        except ValueError:
            vat_rate = None

        line_items.append(
            {
                "row_index": idx,
                "item_name": item_name,
                "sku": text_of(item_node, "MHHDVu", ".//Item/SellersItemIdentification/ID"),
                "unit": unit,
                "qty": qty,
                "price": price,
                "vat_rate_pct": vat_rate,
            }
        )

    return {
        "type": "invoice",
        "invoice_number": invoice_number,
        "invoice_date": invoice_date,
        "supplier_name": supplier_name,
        "supplier_tax_id": supplier_tax_id,
        "buyer_name": buyer_name,
        "total_amount": total_amount,
        "line_items": line_items,
    }


def parse_po(root: ET.Element) -> dict[str, Any]:
    """Phân tích đơn đặt hàng: UBL Order hoặc lược đồ tiếng Việt `DonDatHang`."""
    vat_rate = parse_percent(text_of(root, "ThueSuatGTGT"))

    line_items = []
    nodes = root.findall(".//OrderLine/LineItem") or root.findall(".//ChiTietDonHang/DongHang")
    for idx, node in enumerate(nodes, 1):
        qty_el = first_element(node, "Quantity", "SoLuong")
        unit = (qty_el.get("unitCode") if qty_el is not None else None) or text_of(node, "DonViTinh") or "PCE"
        item = {
            "row_index": idx,
            "item_name": text_of(node, ".//Item/Name", "TenHang"),
            "sku": text_of(node, ".//Item/SellersItemIdentification/ID", "MaHang"),
            "unit": unit,
            "qty": number_of(node, "Quantity", "SoLuong"),
            "price": number_of(node, ".//Price/PriceAmount", "DonGia"),
        }
        if vat_rate is not None:
            item["vat_rate_pct"] = vat_rate
        line_items.append(item)

    return {
        "type": "po",
        "po_number": text_of(root, "ID", "SoDon"),
        "po_date": text_of(root, "IssueDate", "NgayLap"),
        "supplier_name": text_of(root, ".//SellerSupplierParty//PartyName/Name", ".//BenBan/Ten"),
        "supplier_tax_id": text_of(root, ".//SellerSupplierParty//PartyIdentification/ID", ".//BenBan/MST"),
        "buyer_name": text_of(root, ".//BuyerCustomerParty//PartyName/Name", ".//BenMua/Ten"),
        "total_amount": number_of(root, ".//AnticipatedMonetaryTotal/PayableAmount", "TongTienThanhToan"),
        "line_items": line_items,
    }


PO_NUMBER_PATTERN = re.compile(r"\bPO[-\w]*\d[-\w]*", re.IGNORECASE)


def parse_grn(root: ET.Element) -> dict[str, Any]:
    """Phân tích phiếu nhập kho: UBL ReceiptAdvice hoặc lược đồ tiếng Việt `PhieuNhapKho`."""
    po_number = text_of(root, ".//OrderReference/ID")
    if not po_number:
        match = PO_NUMBER_PATTERN.search(text_of(root, "CanCu", "SoChungTuGocKemTheo"))
        po_number = match.group(0) if match else ""

    supplier_name = text_of(root, ".//DespatchSupplierParty//PartyName/Name")
    if not supplier_name:
        # "Nguyễn Văn A - CÔNG TY ..." -> lấy phần tên công ty sau dấu gạch.
        supplier_name = text_of(root, "NguoiGiaoHang").split(" - ", 1)[-1].strip()

    line_items = []
    nodes = root.findall(".//ReceiptLine") or root.findall(".//ChiTiet/DongHang")
    for idx, node in enumerate(nodes, 1):
        qty_el = first_element(node, "DeliveredQuantity", "SoLuongThucNhap")
        unit = (qty_el.get("unitCode") if qty_el is not None else None) or text_of(node, "DonViTinh") or "PCE"
        item = {
            "row_index": idx,
            "item_name": text_of(node, ".//Item/Name", "TenHang"),
            "sku": text_of(node, ".//Item/SellersItemIdentification/ID", "MaHang"),
            "unit": unit,
            "qty": number_of(node, "DeliveredQuantity", "SoLuongThucNhap"),
        }
        price = number_of(node, "DonGia")
        if price:
            item["price"] = price
        line_items.append(item)

    return {
        "type": "grn",
        "grn_number": text_of(root, "ID", "SoPhieu"),
        "grn_date": text_of(root, "IssueDate", "NgayLap"),
        "po_number": po_number,
        "supplier_name": supplier_name,
        "supplier_tax_id": text_of(root, ".//DespatchSupplierParty//PartyIdentification/ID"),
        "line_items": line_items,
    }


def detect_and_parse_document(
    file_content: bytes, filename: str = "document.xml", doc_type_hint: str = "invoice"
) -> dict[str, Any]:
    """Tự động nhận diện định dạng tệp (.xml, .pdf, .png, .jpg) và parse nội dung tương ứng."""
    ext = os.path.splitext(filename)[1].lower() if filename else ".xml"

    if ext in [".pdf", ".png", ".jpg", ".jpeg"]:
        return parse_vision_document(file_content, filename, doc_type_hint)

    try:
        root = parse_xml_to_dict(file_content)
        doc_type = detect_document_type(root)
        if doc_type == "invoice":
            return parse_invoice(root)
        elif doc_type == "po":
            return parse_po(root)
        elif doc_type == "grn":
            return parse_grn(root)
        return parse_invoice(root)
    except Exception as e:
        # Nếu XML parse lỗi nhưng là PDF hoặc ảnh, thử gọi vision parser
        if ext in [".pdf", ".png", ".jpg", ".jpeg"]:
            return parse_vision_document(file_content, filename, doc_type_hint)
        raise ValueError(f"Không thể parse tệp {filename}: {e!s}")
