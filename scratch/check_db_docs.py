import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.database import SessionLocal
from src.models.reconciliation import PurchaseOrder, GoodsReceiptNote, ReconciliationCase, UploadedFile

def inspect_db_documents():
    db = SessionLocal()
    try:
        print("=== 1. DANH SÁCH ĐƠN ĐẶT HÀNG (PO) ===")
        pos = db.query(PurchaseOrder).all()
        print(f"Tổng số PO trong DB: {len(pos)}")
        for po in pos:
            print(f" - PO Number: {po.po_number} | Partner: {po.supplier_name} | Total: {po.total_amount} | Created: {po.created_at}")

        print("\n=== 2. DANH SÁCH PHIẾU NHẬP KHO (GRN) ===")
        grns = db.query(GoodsReceiptNote).all()
        print(f"Tổng số GRN trong DB: {len(grns)}")
        for grn in grns:
            print(f" - GRN Number: {grn.grn_number} | PO Ref: {grn.po_number} | Partner: {grn.supplier_name} | Created: {grn.created_at}")

        print("\n=== 3. DANH SÁCH HỒ SƠ ĐỐI SOÁT / HÓA ĐƠN (RECONCILIATION CASES) ===")
        cases = db.query(ReconciliationCase).all()
        print(f"Tổng số Cases trong DB: {len(cases)}")
        for c in cases:
            print(f" - Case Number: {c.case_number} | Invoice: {c.invoice_number} | PO: {c.po_number} | GRN: {c.grn_number} | Status: {c.status} | Total: {c.total_amount}")

        print("\n=== 4. HÀNG ĐỢI FILE TẢI LÊN (UPLOADED FILES) ===")
        files = db.query(UploadedFile).order_by(UploadedFile.created_at.desc()).limit(10).all()
        print(f"Tổng số UploadedFiles: {db.query(UploadedFile).count()}")
        for f in files:
            print(f" - Filename: {f.filename} | Status: {f.status} | Case ID: {f.case_id} | Created: {f.created_at}")

    except Exception as e:
        print(f"Lỗi truy vấn DB: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    inspect_db_documents()
