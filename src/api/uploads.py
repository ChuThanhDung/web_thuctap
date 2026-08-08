import os
import re
import uuid
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.api.auth import get_current_user
from src.database import get_db
from src.models.reconciliation import (
    GoodsReceiptNote,
    GoodsReceiptNoteItem,
    LineItem,
    PurchaseOrder,
    PurchaseOrderItem,
    ReconciliationCase,
    UploadedFile,
)
from src.models.schemas import UploadedFileListResponse, UploadedFileOut
from src.models.user import User
from src.services.auth import write_audit_log
from src.services.parser_strategies import ParserContext
from src.services.reconciliation_engine import (
    convert_grn_db_to_dict,
    convert_po_db_to_dict,
    reconcile_documents,
)

router = APIRouter(prefix="/uploads", tags=["uploads"])
parser_context = ParserContext()


def extract_number(filename: str) -> str:
    """Trích xuất chuỗi số từ tên file để làm mã đối chiếu."""
    match = re.search(r"\d+", filename)
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
        grn_path if os.path.exists(grn_path) else None,
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
            created_at=up.created_at,
        )
        for up in uploads
    ]
    return UploadedFileListResponse(items=items, total=len(items))


@router.post("", response_model=UploadedFileOut)
async def upload_document(
    file: UploadFile = File(...),
    doc_type: str | None = Form(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
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

    db_upload = UploadedFile(id=uuid.uuid4(), filename=filename, size=size_str, status="queued", progress=0)
    db.add(db_upload)
    db.commit()
    db.refresh(db_upload)

    try:
        # 2. Cập nhật trạng thái sang processing
        db_upload.status = "processing"
        db_upload.progress = 30
        db.commit()

        # 3. Phân tích nội dung file vừa upload bằng Strategy Pattern / Vision Parser
        parsed_doc = parser_context.parse_document(content, filename, doc_type)
        detected_type = parsed_doc.get("type", doc_type or "invoice")

        # 4. Kiểm tra Trùng lặp (Deduplication Check)
        if detected_type == "po":
            po_num = parsed_doc.get("po_number")
            if po_num:
                existing_po = db.scalars(select(PurchaseOrder).where(PurchaseOrder.po_number == po_num)).first()
                if existing_po:
                    raise ValueError(f"Dữ liệu trùng lặp: Đơn đặt hàng PO '{po_num}' đã tồn tại trong hệ thống.")
        elif detected_type == "grn":
            grn_num = parsed_doc.get("grn_number")
            if grn_num:
                existing_grn = db.scalars(
                    select(GoodsReceiptNote).where(GoodsReceiptNote.grn_number == grn_num)
                ).first()
                if existing_grn:
                    raise ValueError(f"Dữ liệu trùng lặp: Phiếu nhập kho GRN '{grn_num}' đã tồn tại trong hệ thống.")
        elif detected_type == "invoice":
            inv_num = parsed_doc.get("invoice_number")
            tax_id = parsed_doc.get("supplier_tax_id")
            if inv_num and tax_id:
                existing_case = db.scalars(
                    select(ReconciliationCase).where(
                        ReconciliationCase.invoice_number == inv_num, ReconciliationCase.partner_tax_id == tax_id
                    )
                ).first()
                if existing_case:
                    raise ValueError(
                        f"Dữ liệu trùng lặp: Hóa đơn '{inv_num}' của nhà cung cấp MST '{tax_id}' đã tồn tại trong hệ thống."
                    )

        # Lấy số hiệu của tài liệu để làm khóa tìm kiếm PO tương ứng
        if detected_type == "invoice":
            doc_number = extract_number(parsed_doc.get("invoice_number", "")) or extract_number(filename)
        elif detected_type == "po":
            doc_number = extract_number(parsed_doc.get("po_number", "")) or extract_number(filename)
        else:  # grn
            doc_number = extract_number(parsed_doc.get("grn_number", "")) or extract_number(filename)

        if not doc_number:
            # Nếu tên tệp không chứa số (vd: images.jpg, mona.jpg), tự động sinh mã định danh số từ hash thời gian
            hash_val = abs(hash(filename + str(datetime.now().timestamp()))) % 900000 + 100000
            doc_number = str(hash_val)

        clean_num = str(int(doc_number))
        po_number_target = parsed_doc.get("po_number") or f"PO-2026-{clean_num.zfill(6)}"

        # 5. Lưu chứng từ PO hoặc GRN vào DB nếu chưa có
        if detected_type == "po":
            new_po = PurchaseOrder(
                id=uuid.uuid4(),
                po_number=parsed_doc.get("po_number") or po_number_target,
                supplier_name=parsed_doc.get("supplier_name"),
                supplier_tax_id=parsed_doc.get("supplier_tax_id"),
                buyer_name=parsed_doc.get("buyer_name"),
                total_amount=parsed_doc.get("total_amount"),
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
                    unit_price=item.get("price"),
                )
                db.add(po_item)
            db.commit()

        elif detected_type == "grn":
            new_grn = GoodsReceiptNote(
                id=uuid.uuid4(),
                grn_number=parsed_doc.get("grn_number") or f"GRN-2026-{clean_num.zfill(6)}",
                po_number=parsed_doc.get("po_number") or po_number_target,
                supplier_name=parsed_doc.get("supplier_name"),
                supplier_tax_id=parsed_doc.get("supplier_tax_id"),
            )
            db.add(new_grn)
            for item in parsed_doc.get("line_items", []):
                grn_item = GoodsReceiptNoteItem(
                    id=uuid.uuid4(),
                    grn_id=new_grn.id,
                    item_sku=item.get("sku"),
                    item_name=item.get("item_name"),
                    unit=item.get("unit"),
                    qty=item.get("qty"),
                )
                db.add(grn_item)
            db.commit()

        # 6. Kiểm tra sự sẵn sàng của Bộ 3 chứng từ (Invoice + PO + GRN) trong DB
        po_db = db.scalars(select(PurchaseOrder).where(PurchaseOrder.po_number == po_number_target)).first()
        grn_db = db.scalars(select(GoodsReceiptNote).where(GoodsReceiptNote.po_number == po_number_target)).first()

        # Nếu thiếu PO hoặc GRN trong DB, thử fallback đọc từ raw_data nếu có sẵn file mẫu
        if not po_db:
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
                    total_amount=po_parsed.get("total_amount"),
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
                        unit_price=item.get("price"),
                    )
                    db.add(po_item)
                db.flush()

        if not grn_db:
            _, _, grn_path_fb = find_associated_files(detected_type, doc_number)
            if grn_path_fb and os.path.exists(grn_path_fb):
                with open(grn_path_fb, "rb") as f:
                    grn_parsed = parser_context.parse_document(f.read(), os.path.basename(grn_path_fb), "grn")
                grn_db = GoodsReceiptNote(
                    id=uuid.uuid4(),
                    grn_number=grn_parsed.get("grn_number"),
                    po_number=grn_parsed.get("po_number"),
                    supplier_name=grn_parsed.get("supplier_name"),
                    supplier_tax_id=grn_parsed.get("supplier_tax_id"),
                )
                db.add(grn_db)
                for item in grn_parsed.get("line_items", []):
                    grn_item = GoodsReceiptNoteItem(
                        id=uuid.uuid4(),
                        grn_id=grn_db.id,
                        item_sku=item.get("sku"),
                        item_name=item.get("item_name"),
                        unit=item.get("unit"),
                        qty=item.get("qty"),
                    )
                    db.add(grn_item)
                db.flush()

        # Kiểm tra nếu chứng từ upload là PO hoặc GRN (chưa phải Hóa đơn)
        if detected_type in ("po", "grn"):
            # Kiểm tra xem có Hóa đơn nào đang chờ PO/GRN này không
            existing_case = db.scalars(
                select(ReconciliationCase).where(ReconciliationCase.po_number == po_number_target)
            ).first()
            if not existing_case or not po_db or not grn_db:
                db_upload.status = "completed"
                db_upload.progress = 100
                db.commit()

                write_audit_log(
                    db=db,
                    action="DOCUMENT_UPLOADED",
                    user=current_user,
                    target_type="UPLOAD",
                    target_id=str(db_upload.id),
                    details={
                        "uploaded_filename": filename,
                        "detected_type": detected_type,
                        "doc_number": doc_number,
                        "note": "Đã lưu chứng từ vào DB. Đang chờ bổ sung đủ 3 loại tệp để tự động đối soát.",
                    },
                    ip_address=None,
                    user_agent=None,
                )
                return UploadedFileOut(
                    id=str(db_upload.id),
                    filename=db_upload.filename,
                    size=db_upload.size,
                    status=db_upload.status,
                    progress=db_upload.progress,
                    error_message=db_upload.error_message,
                    case_id=None,
                    created_at=db_upload.created_at,
                )

        # Trường hợp là Hóa đơn (Invoice): Nếu thiếu PO hoặc GRN thì LUÔN lưu Hóa đơn vào DB dưới dạng ReconciliationCase ở trạng thái chờ
        if not po_db or not grn_db:
            cases_count = db.query(func.count(ReconciliationCase.id)).scalar() or 0
            new_case_number = f"DOC-{cases_count + 1:04d}"

            missing_list = []
            if not po_db:
                missing_list.append("Đơn đặt hàng (PO)")
            if not grn_db:
                missing_list.append("Phiếu nhập kho (GRN)")

            new_case = ReconciliationCase(
                id=uuid.uuid4(),
                case_number=new_case_number,
                invoice_number=parsed_doc.get("invoice_number"),
                po_number=po_number_target,
                partner_name=parsed_doc.get("supplier_name"),
                partner_tax_id=parsed_doc.get("supplier_tax_id"),
                case_date=datetime.now().date(),
                total_amount=parsed_doc.get("total_amount"),
                status="major_diff",
                risk_level="medium",
                confidence=Decimal("0.70"),
                ai_note=f"Đã lưu Hóa đơn {parsed_doc.get('invoice_number')} vào DB. Đang chờ bổ sung {', '.join(missing_list)} để hoàn tất đối soát 3 bên.",
                ai_summary="Chưa đủ bộ 3 chứng từ trong DB để thực hiện đối soát.",
                ai_recommendation=f"Cần nạp bổ sung {', '.join(missing_list)}.",
            )
            db.add(new_case)

            for idx, r_item in enumerate(parsed_doc.get("line_items", []), 1):
                line_item = LineItem(
                    id=uuid.uuid4(),
                    case_id=new_case.id,
                    row_index=r_item.get("row_index", idx),
                    item_sku=r_item.get("sku"),
                    item_name=r_item.get("item_name"),
                    unit=r_item.get("unit"),
                    inv_qty=r_item.get("qty"),
                    inv_unit_price=r_item.get("price"),
                    vat_rate_pct=r_item.get("vat_rate_pct", 10),
                    diff_type="QTY_DIFF",
                    diff_note="Chưa có dữ liệu PO/GRN đối ứng",
                )
                db.add(line_item)

            db_upload.status = "completed"
            db_upload.progress = 100
            db_upload.case_id = new_case.id
            db.commit()

            write_audit_log(
                db=db,
                action="INVOICE_UPLOADED_WAITING_DOCS",
                user=current_user,
                target_type="RECONCILIATION_CASE",
                target_id=str(new_case.id),
                details={
                    "uploaded_filename": filename,
                    "case_number": new_case_number,
                    "invoice_number": parsed_doc.get("invoice_number"),
                    "note": "Đã lưu Hóa đơn vào DB. Đang chờ bổ sung PO/GRN.",
                },
                ip_address=None,
                user_agent=None,
            )

            return UploadedFileOut(
                id=str(db_upload.id),
                filename=db_upload.filename,
                size=db_upload.size,
                status=db_upload.status,
                progress=db_upload.progress,
                error_message=db_upload.error_message,
                case_id=str(new_case.id),
                created_at=db_upload.created_at,
            )

        db_upload.progress = 60
        db.commit()

        # 7. Đã đủ bộ 3 chứng từ -> Chạy Agent đối soát 3 bên tự động
        invoice_data = parsed_doc
        po_data = convert_po_db_to_dict(po_db)
        grn_data = convert_grn_db_to_dict(grn_db)

        reconciled_result = reconcile_documents(invoice_data, po_data, grn_data, db)

        db_upload.progress = 80
        db.commit()

        # 8. Kiểm tra xem đã có Case đang chờ PO/GRN hay chưa, nếu có thì cập nhật, nếu chưa thì tạo mới
        existing_case = db.scalars(
            select(ReconciliationCase).where(ReconciliationCase.po_number == po_number_target)
        ).first()
        if existing_case:
            new_case = existing_case
            new_case.invoice_number = reconciled_result.get("invoice_number")
            new_case.grn_number = reconciled_result.get("grn_number")
            new_case.partner_name = reconciled_result.get("partner_name")
            new_case.partner_tax_id = reconciled_result.get("partner_tax_id")
            new_case.total_amount = reconciled_result.get("total_amount")
            new_case.status = reconciled_result.get("status")
            new_case.risk_level = reconciled_result.get("risk_level")
            new_case.confidence = reconciled_result.get("confidence")
            new_case.diff_amount = reconciled_result.get("diff_amount")
            new_case.diff_type = reconciled_result.get("diff_type")
            new_case.ai_note = reconciled_result.get("ai_note")
            new_case.ai_summary = reconciled_result.get("ai_summary")
            new_case.ai_recommendation = reconciled_result.get("ai_recommendation")

            # Xóa cũ và thêm mới line items
            db.query(LineItem).filter(LineItem.case_id == new_case.id).delete()
            new_case_number = new_case.case_number
        else:
            cases_count = db.query(func.count(ReconciliationCase.id)).scalar() or 0
            new_case_number = f"DOC-{cases_count + 1:04d}"

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

        # 10. Hoàn thành upload và gắn case_id
        db_upload.status = "completed"
        db_upload.progress = 100
        db_upload.case_id = new_case.id

        db.commit()

        # 11. Ghi log hoạt động hệ thống
        write_audit_log(
            db=db,
            action="DOCUMENT_UPLOAD_AND_RECONCILE",
            user=current_user,
            target_type="RECONCILIATION_CASE",
            target_id=str(new_case.id),
            details={
                "uploaded_filename": filename,
                "detected_type": detected_type,
                "case_number": new_case_number,
                "status": reconciled_result.get("status"),
                "diff_amount": str(reconciled_result.get("diff_amount")),
            },
            ip_address=None,
            user_agent=None,
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
        created_at=db_upload.created_at,
    )
