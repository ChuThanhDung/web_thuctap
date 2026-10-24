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

## Bộ dữ liệu vàng (golden dataset), 60 bộ XML

Đo ngày 2026-10-24. Dataset sinh bằng `scripts/generate_golden_dataset.py` (xác định, seed 20261024) vào `dataset/golden/`:
60 bộ PO + Phiếu nhập kho + Hóa đơn, từ 1 đến 994 dòng hàng, 30 bộ khớp, 26 bộ lệch nặng và 4 bộ lệch nhẹ.
Đáp án (`ground_truth.json`) do kịch bản sinh dữ liệu quyết định, không lấy từ engine. 13 loại sai lệch: đơn giá hóa đơn
tăng, đơn giá lệch 100 đ, số lượng hóa đơn vượt, giao thiếu, kho thiếu đúng 1 đơn vị, sai mã số thuế, sai thuế suất, thiếu
hàng trên phiếu nhập kho, hàng thừa trên hóa đơn, tổng tiền bị sửa, tiền thuế lệch quá 1.000 đ (lệch nặng), tiền thuế
và thành tiền lệch do làm tròn dưới 1.000 đ (lệch nhẹ).

Ngưỡng dùng là mặc định của engine, không phụ thuộc cấu hình trong DB: mã số thuế, thuế suất, đơn giá và số lượng phải
khớp tuyệt đối; tiền (thành tiền, thuế, tổng) chỉ được lệch tối đa 1.000 đ do làm tròn. Ngưỡng % bằng 0 nghĩa là không
xét theo %. Hàng hóa lấy từ danh mục theo ngành (điện, văn phòng phẩm, vật liệu xây dựng, bảo hộ lao động, bao bì, tin
học, vệ sinh) với giá và số lượng theo quy cách; mỗi nhà cung cấp có MST và địa chỉ cố định, đơn trên 25 dòng mua của
nhà phân phối tổng hợp.

| Nhóm theo số dòng | Số bộ | Đúng trạng thái | Thời gian xử lý tối đa |
|---|---|---|---|
| small (1 đến 3) | 20 | 100% | 26 ms |
| medium (5 đến 15) | 20 | 100% | 15 ms |
| large (30 đến 80) | 12 | 100% | 32 ms |
| xlarge (150 đến 300) | 6 | 100% | 61 ms |
| stress (800 đến 1000) | 2 | 100% | 347 ms |

Lần đo đầu (trước khi sửa) chỉ đạt 90% khi dùng ngưỡng mặc định. Nguyên nhân là lỗi ghép dòng hàng trong
`reconciliation_engine.py`: tên chứa nhau ("gói 10" và "gói 100") bị ghép nhầm, và tổng phiếu nhập kho tính bằng tên mà
bỏ qua mã SKU, nên bộ khớp có nhiều dòng bị báo lệch tới hàng tỷ đồng. Đã sửa, kèm test hồi quy.

Bản PDF và ảnh: `scripts/generate_golden_documents.py` dựng 18 bộ (11 PDF, có bộ 285 dòng nhiều trang; 7 ảnh JPG giả
ảnh chụp) vào `dataset/golden_docs/`, cùng số liệu và đáp án với bản XML. Bố cục theo mẫu đơn đặt hàng, phiếu nhập kho
01-VT và bản thể hiện hóa đơn GTGT điện tử. Chưa đo độ chính xác khi AI đọc các file này (mỗi bộ tốn 3 lần gọi API).

```
python scripts/generate_golden_dataset.py
python scripts/generate_golden_documents.py   # cần reportlab, Pillow, PyMuPDF
python eval/run_eval.py --dataset dataset/golden --json eval/results/golden_metrics.json
pytest tests/test_golden_dataset.py
```
