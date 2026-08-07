import os
import re
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from src.api.auth import get_current_user
from src.database import get_db
from src.models.reconciliation import (
    ReconciliationCase,
    LineItem,
    UploadedFile,
    PurchaseOrder,
    PurchaseOrderItem,
    GoodsReceiptNote,
    GoodsReceiptNoteItem
)
from src.models.schemas import UploadedFileOut, UploadedFileListResponse
from src.models.user import User
from src.services.parser_strategies import ParserContext
from src.services.reconciliation_engine import (
    reconcile_documents,
    convert_po_db_to_dict,
    convert_grn_db_to_dict
)
from src.services.auth import write_audit_log

router = APIRouter(prefix="/uploads", tags=["uploads"])
parser_context = ParserContext()

def extract_number(filename: str) -> str:
    """Trích xuất chuỗi số từ tên file để làm mã đối chiếu."""
    match = re.search(r'\d+', filename)
    if match:
        return match.group(0)
    return ""

def find_associated_files(doc_type: str, doc_number: str) -> tuple[str | None, str | None, str | None]:
    """
    Tìm các file đối chiếu tương ứng trong thư mục raw_data (dùng làm phương án fallback).
    """
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "raw_data"))
    
    try:
        clean_num = str(int(doc_number))
    except ValueError:
        return None, None, None
        
    inv_name = f"INV_{clean_num.zfill(7)}.xml"
    po_name = f"PO-2026-{clean_num.zfill(6)}.xml"
    grn_name = f"GRN-2026-{clean_num.zfill(6)}.xml"
    
    inv_path = os.path.join(base_dir, "invoice", inv_name)
    po_path = os.path.join(base_dir, "po", po_name)
    grn_path = os.path.join(base_dir, "receipt", grn_name)
    
    return (
        inv_path if os.path.exists(inv_path) else None,
        po_path if os.path.exists(po_path) else None,
        grn_path if os.path.exists(grn_path) else None
    )

@router.get("", response_model=UploadedFileListResponse)
async def list_uploads(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UploadedFileListResponse:
    """Lấy danh sách tệp đã tải lên trong hàng đợi (sắp xếp theo thời gian mới nhất)."""
    stmt = select(UploadedFile).order_by(UploadedFile.created_at.desc())
    uploads = db.scalars(stmt).all()
    
    items = [
        UploadedFileOut(
            id=str(up.id),
            filename=up.filename,
            size=up.size,
            status=up.status,
            progress=up.progress,
            error_message=up.error_message,
            case_id=str(up.case_id) if up.case_id else None,
            created_at=up.created_at
        )
        for up in uploads
    ]
    return UploadedFileListResponse(items=items, total=len(items))

@router.post("", response_model=UploadedFileOut)
async def upload_document(
    file: UploadFile = File(...),
    doc_type: str | None = Form(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> UploadedFileOut:
    """
    Tải lên hóa đơn/chứng từ đa định dạng (XML, PDF, PNG), tự động nhận diện và đối soát 3 bên dựa trên dữ liệu trong DB.
    """
    filename = file.filename or "unknown_file.xml"
    
    # Tính kích thước file thân thiện
    content = await file.read()
    file_size_bytes = len(content)
    if file_size_bytes >= 1024 * 1024:
        size_str = f"{file_size_bytes / (1024 * 1024):.1f} MB"
    else:
        size_str = f"{file_size_bytes / 1024:.1f} KB"
        
    db_upload = UploadedFile(
        id=uuid.uuid4(),
        filename=filename,
        size=size_str,
        status="queued",
        progress=0
    )
    db.add(db_upload)
    db.commit()
    db.refresh(db_upload)

    try:
        # 2. Cập nhật trạng thái sang processing
        db_upload.status = "processing"
        db_upload.progress = 30
        db.commit()

        # 3. Phân tích nội dung file vừa upload bằng Strategy Pattern
        parsed_doc = parser_context.parse_document(content, filename, doc_type)
        detected_type = parsed_doc.get("type")
        
        # Lấy số hiệu của tài liệu để làm khóa tìm kiếm
        if detected_type == "invoice":
            doc_number = extract_number(parsed_doc.get("invoice_number", "")) or extract_number(filename)
        elif detected_type == "po":
            doc_number = extract_number(parsed_doc.get("po_number", "")) or extract_number(filename)
        else: # grn
            doc_number = extract_number(parsed_doc.get("grn_number", "")) or extract_number(filename)
            
        if not doc_number:
            raise ValueError("Không thể tìm thấy số hiệu chứng từ (invoice_number, po_number, grn_number) trong tệp tải lên.")

        clean_num = str(int(doc_number))
        po_number_target = f"PO-2026-{clean_num.zfill(6)}"

        # Nếu user upload PO hoặc GRN trực tiếp, ta lưu thông tin đó vào DB
        if detected_type == "po":
            existing_po = db.scalars(select(PurchaseOrder).where(PurchaseOrder.po_number == parsed_doc.get("po_number"))).first()
            if not existing_po:
                new_po = PurchaseOrder(
                    id=uuid.uuid4(),
                    po_number=parsed_doc.get("po_number"),
                    supplier_name=parsed_doc.get("supplier_name"),
                    supplier_tax_id=parsed_doc.get("supplier_tax_id"),
                    buyer_name=parsed_doc.get("buyer_name"),
                    total_amount=parsed_doc.get("total_amount")
                )
                db.add(new_po)
                for item in parsed_doc.get("line_items", []):
                    po_item = PurchaseOrderItem(
                        id=uuid.uuid4(),
                        po_id=new_po.id,
                        item_sku=item.get("sku"),
                        item_name=item.get("item_name"),
                        unit=item.get("unit"),
                        qty=item.get("qty"),
                        unit_price=item.get("price")
                    )
                    db.add(po_item)
                db.commit()
            db_upload.status = "completed"
            db_upload.progress = 100
            db.commit()
            return db_upload

        elif detected_type == "grn":
            existing_grn = db.scalars(select(GoodsReceiptNote).where(GoodsReceiptNote.grn_number == parsed_doc.get("grn_number"))).first()
            if not existing_grn:
                new_grn = GoodsReceiptNote(
                    id=uuid.uuid4(),
                    grn_number=parsed_doc.get("grn_number"),
                    po_number=parsed_doc.get("po_number"),
                    supplier_name=parsed_doc.get("supplier_name"),
                    supplier_tax_id=parsed_doc.get("supplier_tax_id")
                )
                db.add(new_grn)
                for item in parsed_doc.get("line_items", []):
                    grn_item = GoodsReceiptNoteItem(
                        id=uuid.uuid4(),
                        grn_id=new_grn.id,
                        item_sku=item.get("sku"),
                        item_name=item.get("item_name"),
                        unit=item.get("unit"),
                        qty=item.get("qty")
                    )
                    db.add(grn_item)
                db.commit()
            db_upload.status = "completed"
            db_upload.progress = 100
            db.commit()
            return db_upload

        # 4. Trường hợp là Hóa đơn (Invoice): Tìm kiếm PO & GRN đối ứng trong Database (hoặc fallback)
        # Tìm kiếm PO
        po_db = db.scalars(select(PurchaseOrder).where(PurchaseOrder.po_number == po_number_target)).first()
        if not po_db:
            # Fallback: Tự động nạp từ file XML có sẵn trong raw_data
            _, po_path_fb, _ = find_associated_files(detected_type, doc_number)
            if po_path_fb and os.path.exists(po_path_fb):
                with open(po_path_fb, "rb") as f:
                    po_parsed = parser_context.parse_document(f.read(), os.path.basename(po_path_fb), "po")
                po_db = PurchaseOrder(
                    id=uuid.uuid4(),
                    po_number=po_parsed.get("po_number"),
                    supplier_name=po_parsed.get("supplier_name"),
                    supplier_tax_id=po_parsed.get("supplier_tax_id"),
                    buyer_name=po_parsed.get("buyer_name"),
                    total_amount=po_parsed.get("total_amount")
                )
                db.add(po_db)
                for item in po_parsed.get("line_items", []):
                    po_item = PurchaseOrderItem(
                        id=uuid.uuid4(),
                        po_id=po_db.id,
                        item_sku=item.get("sku"),
                        item_name=item.get("item_name"),
                        unit=item.get("unit"),
                        qty=item.get("qty"),
                        unit_price=item.get("price")
                    )
                    db.add(po_item)
                db.flush()

        # Tìm kiếm GRN
        grn_db = db.scalars(select(GoodsReceiptNote).where(GoodsReceiptNote.po_number == po_number_target)).first()
        if not grn_db:
            # Fallback: Tự động nạp từ file XML có sẵn trong raw_data
            _, _, grn_path_fb = find_associated_files(detected_type, doc_number)
            if grn_path_fb and os.path.exists(grn_path_fb):
                with open(grn_path_fb, "rb") as f:
                    grn_parsed = parser_context.parse_document(f.read(), os.path.basename(grn_path_fb), "grn")
                grn_db = GoodsReceiptNote(
                    id=uuid.uuid4(),
                    grn_number=grn_parsed.get("grn_number"),
                    po_number=grn_parsed.get("po_number"),
                    supplier_name=grn_parsed.get("supplier_name"),
                    supplier_tax_id=grn_parsed.get("supplier_tax_id")
                )
                db.add(grn_db)
                for item in grn_parsed.get("line_items", []):
                    grn_item = GoodsReceiptNoteItem(
                        id=uuid.uuid4(),
                        grn_id=grn_db.id,
                        item_sku=item.get("sku"),
                        item_name=item.get("item_name"),
                        unit=item.get("unit"),
                        qty=item.get("qty")
                    )
                    db.add(grn_item)
                db.flush()

        if not po_db or not grn_db:
            missing = []
            if not po_db: missing.append("Đơn đặt hàng (PO)")
            if not grn_db: missing.append("Phiếu nhập kho (GRN)")
            raise ValueError(f"Không tìm thấy tài liệu đối chiếu tương ứng trong DB: {', '.join(missing)}")

        db_upload.progress = 60
        db.commit()

        # 5. Chuyển đổi dữ liệu DB thành cấu trúc đối soát và thực thi
        invoice_data = parsed_doc
        po_data = convert_po_db_to_dict(po_db)
        grn_data = convert_grn_db_to_dict(grn_db)

        # 6. Chạy đối soát 3 bên
        reconciled_result = reconcile_documents(invoice_data, po_data, grn_data, db)
        
        db_upload.progress = 80
        db.commit()

        # 7. Sinh case_number tự động không trùng lặp
        cases_count = db.query(func.count(ReconciliationCase.id)).scalar() or 0
        new_case_number = f"DOC-{cases_count + 1:04d}"

        # 8. Lưu kết quả đối soát vào cơ sở dữ liệu
        new_case = ReconciliationCase(
            id=uuid.uuid4(),
            case_number=new_case_number,
            invoice_number=reconciled_result.get("invoice_number"),
            po_number=reconciled_result.get("po_number"),
            grn_number=reconciled_result.get("grn_number"),
            partner_name=reconciled_result.get("partner_name"),
            partner_tax_id=reconciled_result.get("partner_tax_id"),
            case_date=datetime.now().date(),
            total_amount=reconciled_result.get("total_amount"),
            status=reconciled_result.get("status"),
            risk_level=reconciled_result.get("risk_level"),
            confidence=reconciled_result.get("confidence"),
            diff_amount=reconciled_result.get("diff_amount"),
            diff_type=reconciled_result.get("diff_type"),
            ai_note=reconciled_result.get("ai_note"),
            ai_summary=reconciled_result.get("ai_summary"),
            ai_recommendation=reconciled_result.get("ai_recommendation"),
        )
        db.add(new_case)
        
        # Lưu các line items
        for r_item in reconciled_result.get("line_items", []):
            line_item = LineItem(
                id=uuid.uuid4(),
                case_id=new_case.id,
                row_index=r_item.get("row_index", 1),
                item_sku=r_item.get("item_sku"),
                item_name=r_item.get("item_name"),
                unit=r_item.get("unit"),
                inv_qty=r_item.get("inv_qty"),
                po_qty=r_item.get("po_qty"),
                grn_qty=r_item.get("grn_qty"),
                inv_unit_price=r_item.get("inv_unit_price"),
                po_unit_price=r_item.get("po_unit_price"),
                vat_rate_pct=r_item.get("vat_rate_pct"),
                diff_type=r_item.get("diff_type"),
                diff_note=r_item.get("diff_note"),
            )
            db.add(line_item)

        db.flush()

        # 9. Hoàn thành upload
        db_upload.status = "completed"
        db_upload.progress = 100
        db_upload.case_id = new_case.id
        
        db.commit()

        # 10. Ghi log hoạt động hệ thống
        write_audit_log(
            db=db,
            action="DOCUMENT_UPLOAD_AND_RECONCILE",
            user=current_user,
            details={
                "uploaded_filename": filename,
                "detected_type": detected_type,
                "case_number": new_case_number,
                "status": reconciled_result.get("status"),
                "diff_amount": str(reconciled_result.get("diff_amount"))
            },
            ip_address=None,
            user_agent=None
        )

    except Exception as e:
        db.rollback()
        # Cập nhật hàng đợi với trạng thái lỗi
        db_upload.status = "error"
        db_upload.progress = 0
        db_upload.error_message = str(e)
        db.commit()

    db.refresh(db_upload)
    return UploadedFileOut(
        id=str(db_upload.id),
        filename=db_upload.filename,
        size=db_upload.size,
        status=db_upload.status,
        progress=db_upload.progress,
        error_message=db_upload.error_message,
        case_id=str(db_upload.case_id) if db_upload.case_id else None,
        created_at=db_upload.created_at
    )
