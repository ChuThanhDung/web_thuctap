# Evaluation Report

> Số liệu đo ngày 2026-10-11 trên máy phát triển (Windows 11, Docker Compose, PostgreSQL 16, dữ liệu dev nhỏ).
> Mọi con số có lệnh tái lập ở cuối mỗi mục. Những gì **chưa đo được** được ghi rõ là "Chưa đo", không ước lượng.

## 1. Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Độ chính xác phán quyết khớp/lệch (XML) | >80% | 100% (4/4 bộ chứng từ) | Đạt, mẫu nhỏ |
| Độ chính xác số chứng từ và tổng tiền (XML có ground truth) | >80% | 100% (2/2 bộ) | Đạt, mẫu nhỏ |
| Độ chính xác trên PDF và ảnh | >80% | Chưa đo | Cần Vision API key và bộ kiểm chứng riêng |
| Độ trễ API đọc (p95) | <3s | 58,5 ms (cao nhất trong 8 endpoint) | Đạt |
| Độ trễ đăng nhập (p95) | <3s | 276 ms (băm bcrypt, có chủ đích) | Đạt |
| Độ trễ bóc tách XML và đối soát 1 bộ (p50) | <3s | 6,0 ms (tối đa 95,2 ms) | Đạt |
| Mức hài lòng người dùng | >4/5 | Chưa thu thập | Cần buổi demo với người dùng thật |
| Độ phủ test backend | >60% | 78% (3.517 câu lệnh) | Đạt |

## 2. Test Results

### Unit và integration tests

| Phạm vi | Số test | Kết quả |
|---|---|---|
| Backend (`pytest tests/`) | 106 | Tất cả pass, chạy trên database `*_test` riêng |
| Frontend (`npm test`, Vitest) | 30 | Tất cả pass |
| Lint (`ruff check`) | | Sạch |

Backend chạy trên PostgreSQL thật qua đường migration Alembic (không dùng `create_all` riêng). Các vùng được bổ sung test trong đợt này: lưu trữ và khóa bộ chứng từ đã duyệt hai cấp (kể cả trigger database), phân quyền và vòng đời người dùng, chính sách mật khẩu, giới hạn đăng nhập sai, giới hạn dung lượng upload, audit log theo vai trò, CRUD ngưỡng sai số, readiness và request ID, migration (idempotent, một head), parser XML trên dataset thật.

Độ phủ theo module quan trọng: `api/audit_logs` 100%, `services/document_parser` 91%, `api/thresholds` 89%, `api/auth` 76%, `services/auth` 56%, `api/reconciliations` 49%.

```
pytest tests/ -v --cov=src --cov-report=term-missing
cd frontend && npm test
```

### Đánh giá pipeline trên dataset XML

Phạm vi: `dataset/xml` (4 bộ gồm 2 khớp, 2 lệch), gọi trực tiếp parser và engine đối soát, không dùng LLM.

| Bộ | Nhãn đúng | Kết quả hệ thống | Dòng bị gắn cờ |
|---|---|---|---|
| batch_01_match | Khớp | Khớp | 0 |
| batch_02_match | Khớp | Khớp | 0 |
| batch_03_mismatch | Lệch | Lệch (major_diff) | 2 |
| batch_04_mismatch | Lệch | Lệch (major_diff) | 2 |

- Số PO, số phiếu nhập, số hóa đơn và tổng tiền khớp ground truth ở cả 2 bộ có `ground_truth.json`.
- XML hỏng (`dataset/edge_cases/batch_01_corrupt_xml`, 3 file): 2 file được khôi phục và đọc đúng dữ liệu, 1 file bị từ chối với lỗi có kiểm soát, 0 file gây crash.
- Lưu ý quan trọng: trước đợt này parser XML **không đọc được** lược đồ tiếng Việt của dataset này (PO `DonDatHang`, phiếu nhập `PhieuNhapKho`, tên hàng `THHDVu`), nên kết quả trên là sau khi bổ sung hỗ trợ. Một lỗi logic (`a.find() or b.find()` bỏ qua phần tử lá) cũng đã được sửa và có test hồi quy.
- Hạn chế: 4 bộ là mẫu rất nhỏ; 100% ở đây chưa chứng minh độ chính xác trên chứng từ thực tế đa dạng.

```
python eval/run_eval.py --min-verdict-accuracy 1.0
```

### Độ trễ API

Đo trên stack Docker dev (backend `localhost:8001`, 30 lượt mỗi endpoint sau 1 lượt khởi động, đăng nhập 5 lượt). Dữ liệu dev nhỏ nên con số phản ánh chi phí xử lý của ứng dụng, chưa phản ánh tải lớn hay mạng thật.

| Endpoint | p50 (ms) | p95 (ms) |
|---|---|---|
| POST /auth/login | 228,7 | 275,9 |
| GET /health | 15,6 | 26,1 |
| GET /health/ready | 14,3 | 29,0 |
| GET /auth/me | 7,5 | 30,9 |
| GET /thresholds | 9,8 | 31,9 |
| GET /reconciliations | 29,3 | 36,2 |
| GET /reconciliations/stats | 19,2 | 36,8 |
| GET /uploads/batches | 32,2 | 58,5 |
| GET /audit-logs | 15,6 | 34,0 |

```
EVAL_PASSWORD=... python eval/measure_api_latency.py --base-url http://localhost:8001 --email <email>
```

Chưa đo: độ trễ upload kèm bóc tách bằng LLM (phụ thuộc nhà cung cấp AI), kiểm thử chịu tải đồng thời.

## 3. User Feedback

Chưa thu thập. Cần ít nhất một buổi demo với kế toán viên và kế toán trưởng thật, sau đó điền bảng dưới đây.

| User | Feedback | Rating |
|------|----------|--------|
| (chưa có) | | |

## 4. Demo Results

Chưa có buổi demo nào được ghi nhận trong repo. Điền ngày, số người tham gia, feedback chung và các vấn đề phát hiện sau buổi demo đầu tiên.

## 5. Action Items

- [ ] Xây bộ kiểm chứng cho PDF và ảnh (có nhãn đúng) rồi đo độ chính xác bóc tách bằng Vision API.
- [ ] Mở rộng bộ XML kiểm chứng vượt 4 bộ, gồm nhiều nhà cung cấp, thuế suất và định dạng hóa đơn.
- [ ] Tổ chức demo với người dùng thật và thu thập đánh giá hài lòng.
- [ ] Nâng độ phủ `api/reconciliations` (49%) và `services/auth` (56%), nhất là luồng OTP đổi mật khẩu.
- [ ] Thêm kiểm thử chịu tải trước khi nhận đối tác có khối lượng lớn.
