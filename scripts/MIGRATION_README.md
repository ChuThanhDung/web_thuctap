# Database Migration: Add Approved By to Document Batch

## Mục đích
Migration này thêm trường `approved_by_id` vào bảng `document_batches` để lưu thông tin kế toán viên nào đã duyệt batch.

## Thay đổi

### Database
- Thêm cột `approved_by_id` (INTEGER, nullable) vào bảng `document_batches`
- Thêm foreign key constraint tới bảng `users`
- Thêm index cho hiệu suất truy vấn

### Backend
- Cập nhật model `DocumentBatch` với relationship `approved_by`
- Cập nhật schema `DocumentBatchOut` với trường `approved_by_name`
- Cập nhật endpoint `/batches/{batch_id}/approve` để lưu người duyệt
- Cập nhật hàm `to_document_batch_out()` để trả về tên người duyệt

### Frontend
- Cập nhật `mapApiBatchToAuditBatch` để lưu thông tin người duyệt
- Cập nhật component `StatusBadge` để hiển thị "Được duyệt bởi [Tên]"
- Thêm logic lọc: Kế toán trưởng chỉ thấy batch đã duyệt
- Cập nhật tất cả nơi sử dụng `StatusBadge` để truyền prop `approvedBy`

## Cách chạy Migration

### Phương pháp 1: Sử dụng Python script (Khuyến nghị)
```bash
# Từ thư mục gốc của project
python scripts/run_migration_add_approved_by.py
```

### Phương pháp 2: Chạy SQL trực tiếp
```bash
# Kết nối tới PostgreSQL và chạy file SQL
psql -U postgres -d docusync -f scripts/add_approved_by_to_document_batch.sql
```

### Phương pháp 3: Sử dụng pgAdmin hoặc database client
1. Mở file `scripts/add_approved_by_to_document_batch.sql`
2. Copy nội dung
3. Paste vào query editor trong pgAdmin/DBeaver
4. Execute query

## Kiểm tra sau khi migration

### 1. Kiểm tra cấu trúc bảng
```sql
-- Kiểm tra column mới đã được tạo
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'document_batches'
  AND column_name = 'approved_by_id';

-- Kiểm tra foreign key constraint
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'document_batches'
  AND constraint_name = 'fk_document_batches_approved_by';

-- Kiểm tra index
SELECT indexname
FROM pg_indexes
WHERE tablename = 'document_batches'
  AND indexname = 'idx_document_batches_approved_by_id';
```

### 2. Test chức năng
1. Login với tài khoản **kế toán viên**
2. Vào menu "Batch đối soát"
3. Duyệt một batch có status "Khớp hoàn toàn"
4. Logout và login với tài khoản **kế toán trưởng**
5. Vào menu "Batch đối soát"
6. Kiểm tra:
   - Chỉ thấy batch đã duyệt
   - Badge hiển thị "Được duyệt bởi [Tên kế toán viên]"

### 3. Kiểm tra dữ liệu
```sql
-- Xem batch đã duyệt với thông tin người duyệt
SELECT 
    b.id,
    b.batch_number,
    b.status,
    b.created_by_id,
    creator.full_name as created_by_name,
    b.approved_by_id,
    approver.full_name as approved_by_name,
    b.updated_at
FROM document_batches b
LEFT JOIN users creator ON b.created_by_id = creator.public_id
LEFT JOIN users approver ON b.approved_by_id = approver.public_id
WHERE b.status = 'approved';
```

## Rollback (nếu cần)

Nếu cần rollback migration:

```sql
-- Xóa index
DROP INDEX IF EXISTS idx_document_batches_approved_by_id;

-- Xóa foreign key constraint
ALTER TABLE document_batches
DROP CONSTRAINT IF EXISTS fk_document_batches_approved_by;

-- Xóa column
ALTER TABLE document_batches
DROP COLUMN IF EXISTS approved_by_id;
```

## Ghi chú
- Migration này **an toàn** để chạy trên production vì:
  - Column mới là nullable (không yêu cầu giá trị mặc định)
  - Không ảnh hưởng đến dữ liệu hiện có
  - Batch cũ sẽ có `approved_by_id = NULL`
- Chỉ những batch được duyệt **sau khi** chạy migration mới có thông tin người duyệt
- Batch đã duyệt trước đó sẽ có `approved_by_name = NULL` và hiển thị label mặc định "Đã duyệt"
