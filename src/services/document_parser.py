import os
import xml.etree.ElementTree as ET
from typing import Any, Dict


def remove_namespaces(xml_content: bytes) -> str:
    """Loại bỏ namespace để dễ dàng query bằng ElementTree không cần namespace dictionary."""
    xml_str = xml_content.decode('utf-8', errors='ignore')
    import re
    # Remove default namespace
    xml_str = re.sub(r'\sxmlns="[^"]+"', '', xml_str)
    # Remove prefix namespaces
    xml_str = re.sub(r'\sxmlns:\w+="[^"]+"', '', xml_str)
    # Remove schema locations
    xml_str = re.sub(r'\sxsi:schemaLocation="[^"]+"', '', xml_str)
    xml_str = re.sub(r'\sxsi:type="[^"]+"', '', xml_str)
    xml_str = re.sub(r'\sxmlns:xsi="[^"]+"', '', xml_str)
    
    # Remove prefix from tags (e.g. <cac:OrderLine> to <OrderLine>)
    xml_str = re.sub(r'<(/?)[a-zA-Z0-9_-]+:([a-zA-Z0-9_-]+)', r'<\1\2', xml_str)
    return xml_str

def parse_xml_to_dict(xml_content: bytes) -> Dict[str, Any]:
    """Parse XML và chuyển sang dict hoặc ElementTree đã được xóa namespace."""
    cleaned_xml = remove_namespaces(xml_content)
    return ET.fromstring(cleaned_xml)

def detect_document_type(root: ET.Element) -> str:
    """Nhận diện loại tài liệu dựa trên tag root."""
    tag = root.tag
    if "HDon" in tag:
        return "invoice"
    elif "Order" in tag:
        return "po"
    elif "ReceiptAdvice" in tag:
        return "grn"
    raise ValueError(f"Không nhận diện được loại tài liệu XML với root tag: {tag}")

def parse_invoice(root: ET.Element) -> dict[str, Any]:
    """Phân tích hóa đơn điện tử (GDT Việt Nam & UBL Standard & Mock XML)."""
    shdon = (
        root.find(".//InvoiceNumber")
        or root.find(".//SHDon")
        or root.find(".//ID")
        or root.find("ID")
        or root.find("InvoiceNumber")
    )
    invoice_number = shdon.text.strip() if shdon is not None and shdon.text else ""

    nlap = root.find(".//NLap") or root.find(".//IssueDate") or root.find("IssueDate") or root.find(".//Date")
    invoice_date = nlap.text.strip() if nlap is not None and nlap.text else ""

    supplier_name_el = (
        root.find(".//Vendor/Name")
        or root.find(".//NBan/Ten")
        or root.find(".//AccountingSupplierParty//PartyName/Name")
        or root.find(".//SellerSupplierParty//PartyName/Name")
    )
    supplier_name = supplier_name_el.text.strip() if supplier_name_el is not None and supplier_name_el.text else ""

    supplier_tax_id_el = (
        root.find(".//Vendor/TaxCode")
        or root.find(".//NBan/MST")
        or root.find(".//AccountingSupplierParty//PartyIdentification/ID")
        or root.find(".//SellerSupplierParty//PartyIdentification/ID")
    )
    supplier_tax_id = (
        supplier_tax_id_el.text.strip() if supplier_tax_id_el is not None and supplier_tax_id_el.text else ""
    )

    buyer_name_el = (
        root.find(".//Customer/Name")
        or root.find(".//NMua/Ten")
        or root.find(".//AccountingCustomerParty//PartyName/Name")
        or root.find(".//BuyerCustomerParty//PartyName/Name")
    )
    buyer_name = buyer_name_el.text.strip() if buyer_name_el is not None and buyer_name_el.text else ""

    thtien_el = (
        root.find(".//TotalAmount")
        or root.find(".//TToan/THTien")
        or root.find(".//LegalMonetaryTotal/TaxExclusiveAmount")
        or root.find(".//MonetaryTotal/PayableAmount")
    )
    total_amount_ex_vat = float(thtien_el.text) if thtien_el is not None and thtien_el.text else 0.0
    
    tgtttb_el = root.find(".//TToan/TgTTTBSo")
    total_amount = float(tgtttb_el.text) if tgtttb_el is not None and tgtttb_el.text else total_amount_ex_vat
    
    # Parse line items
    line_items = []
    for idx, item_node in enumerate(root.findall(".//DSHHDVu/HHDVu"), 1):
        name_el = item_node.find("Ten")
        item_name = name_el.text.strip() if name_el is not None else ""
        
        unit_el = item_node.find("DVT")
        unit = unit_el.text.strip() if unit_el is not None else ""
        
        qty_el = item_node.find("SLuong")
        qty = float(qty_el.text) if qty_el is not None and qty_el.text else 0.0
        
        price_el = item_node.find("DGia")
        price = float(price_el.text) if price_el is not None and price_el.text else 0.0
        
        vat_el = item_node.find("TSuat")
        vat_str = vat_el.text.strip() if vat_el is not None and vat_el.text else "10%"
        try:
            vat_rate = int(vat_str.replace("%", "").strip())
        except ValueError:
            vat_rate = 10
            
        line_items.append({
            "row_index": idx,
            "item_name": item_name,
            "unit": unit,
            "qty": qty,
            "price": price,
            "vat_rate_pct": vat_rate,
        })
        
    return {
        "type": "invoice",
        "invoice_number": invoice_number,
        "invoice_date": invoice_date,
        "supplier_name": supplier_name,
        "supplier_tax_id": supplier_tax_id,
        "buyer_name": buyer_name,
        "total_amount": total_amount,
        "line_items": line_items
    }

def parse_po(root: ET.Element) -> Dict[str, Any]:
    """Phân tích UBL Order (Purchase Order)."""
    id_el = root.find("ID")
    po_number = id_el.text.strip() if id_el is not None else ""
    
    date_el = root.find("IssueDate")
    po_date = date_el.text.strip() if date_el is not None else ""
    
    supplier_name_el = root.find(".//SellerSupplierParty//PartyName/Name")
    supplier_name = supplier_name_el.text.strip() if supplier_name_el is not None else ""
    
    supplier_tax_id_el = root.find(".//SellerSupplierParty//PartyIdentification/ID")
    supplier_tax_id = supplier_tax_id_el.text.strip() if supplier_tax_id_el is not None else ""
    
    buyer_name_el = root.find(".//BuyerCustomerParty//PartyName/Name")
    buyer_name = buyer_name_el.text.strip() if buyer_name_el is not None else ""
    
    total_el = root.find(".//AnticipatedMonetaryTotal/PayableAmount")
    total_amount = float(total_el.text) if total_el is not None and total_el.text else 0.0
    
    line_items = []
    for idx, node in enumerate(root.findall(".//OrderLine/LineItem"), 1):
        name_el = node.find(".//Item/Name")
        item_name = name_el.text.strip() if name_el is not None else ""
        
        sku_el = node.find(".//Item/SellersItemIdentification/ID")
        sku = sku_el.text.strip() if sku_el is not None else ""
        
        qty_el = node.find("Quantity")
        qty = float(qty_el.text) if qty_el is not None and qty_el.text else 0.0
        unit = qty_el.get("unitCode", "PCE") if qty_el is not None else "PCE"
        
        price_el = node.find(".//Price/PriceAmount")
        price = float(price_el.text) if price_el is not None and price_el.text else 0.0
        
        line_items.append({
            "row_index": idx,
            "item_name": item_name,
            "sku": sku,
            "unit": unit,
            "qty": qty,
            "price": price,
        })
        
    return {
        "type": "po",
        "po_number": po_number,
        "po_date": po_date,
        "supplier_name": supplier_name,
        "supplier_tax_id": supplier_tax_id,
        "buyer_name": buyer_name,
        "total_amount": total_amount,
        "line_items": line_items
    }

def parse_grn(root: ET.Element) -> Dict[str, Any]:
    """Phân tích UBL ReceiptAdvice (Goods Receipt Note)."""
    id_el = root.find("ID")
    grn_number = id_el.text.strip() if id_el is not None else ""
    
    date_el = root.find("IssueDate")
    grn_date = date_el.text.strip() if date_el is not None else ""
    
    po_ref_el = root.find(".//OrderReference/ID")
    po_number = po_ref_el.text.strip() if po_ref_el is not None else ""
    
    supplier_name_el = root.find(".//DespatchSupplierParty//PartyName/Name")
    supplier_name = supplier_name_el.text.strip() if supplier_name_el is not None else ""
    
    supplier_tax_id_el = root.find(".//DespatchSupplierParty//PartyIdentification/ID")
    supplier_tax_id = supplier_tax_id_el.text.strip() if supplier_tax_id_el is not None else ""
    
    line_items = []
    for idx, node in enumerate(root.findall(".//ReceiptLine"), 1):
        name_el = node.find(".//Item/Name")
        item_name = name_el.text.strip() if name_el is not None else ""
        
        sku_el = node.find(".//Item/SellersItemIdentification/ID")
        sku = sku_el.text.strip() if sku_el is not None else ""
        
        qty_el = node.find("DeliveredQuantity")
        qty = float(qty_el.text) if qty_el is not None and qty_el.text else 0.0
        unit = qty_el.get("unitCode", "PCE") if qty_el is not None else "PCE"
        
        line_items.append({
            "row_index": idx,
            "item_name": item_name,
            "sku": sku,
            "unit": unit,
            "qty": qty,
        })
        
    return {
        "type": "grn",
        "grn_number": grn_number,
        "grn_date": grn_date,
        "po_number": po_number,
        "supplier_name": supplier_name,
        "supplier_tax_id": supplier_tax_id,
        "line_items": line_items
    }

from src.services.vision_parser import parse_vision_document

def detect_and_parse_document(
    file_content: bytes,
    filename: str = "document.xml",
    doc_type_hint: str = "invoice"
) -> Dict[str, Any]:
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
        raise ValueError(f"Không thể parse tệp {filename}: {str(e)}")

