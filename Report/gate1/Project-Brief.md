# Project Brief: AI Agent Đối soát Hóa đơn & Chứng từ Kế toán
### (Invoice Reconciliation Agent)

**Nhóm:** *007* — 4 thành viên
**Mentor:** *Cao Quảng Bình*
---

## 1. Tóm tắt (Executive Summary)

AI Agent hỗ trợ bộ phận kế toán của công ty dịch vụ gọi xe tự động hóa việc đối soát hóa đơn với đơn đặt hàng (PO) và phiếu nhập hàng (3-way matching). Agent đọc hóa đơn, đối chiếu dữ liệu, phát hiện chênh lệch và đề xuất phương án xử lý — con người vẫn là người duyệt cuối cùng trước khi hạch toán hoặc thanh toán.

## 2. Vấn đề (Problem Statement)

Hiện tại, kế toán thực hiện đối soát hóa đơn hoàn toàn thủ công, đặc biệt dồn khối lượng lớn vào cuối tháng. Việc đối chiếu 3 nguồn dữ liệu (hóa đơn – PO – phiếu nhập hàng) bằng tay dễ dẫn đến:
- Sai lệch số liệu không được phát hiện kịp thời
- Chậm thanh toán cho đối tác/tài xế
- Quá tải nhân sự kế toán vào cuối kỳ

## 3. Đối tượng người dùng (Target Users)

| Vai trò | Mô tả |
|---|---|
| Kế toán viên (người dùng chính) | Xử lý đối soát hàng ngày/cuối tháng, duyệt các đề xuất của Agent |
| Kế toán trưởng | Duyệt các trường hợp bất thường hoặc giá trị lớn |
| Tài xế / đối tác (gián tiếp) | Được hưởng lợi từ việc thanh toán nhanh và chính xác hơn |

## 4. Mục tiêu & Giá trị mang lại (Goals & Value Proposition)

- Rút ngắn thời gian đối soát hóa đơn, đặc biệt vào giai đoạn cao điểm cuối tháng
- Giảm tỷ lệ sai lệch số liệu bị bỏ sót so với quy trình thủ công
- Giảm tải công việc lặp lại cho kế toán viên, để họ tập trung vào các trường hợp cần phán đoán
- Duy trì con người là người ra quyết định cuối cùng (không tự động hóa hoàn toàn việc hạch toán/thanh toán)

## 5. Phạm vi (Scope)

**Trong phạm vi (MVP / Checkpoint 1 hướng tới):**
- Đọc và trích xuất thông tin từ hóa đơn (ít nhất 1 định dạng, ví dụ XML hóa đơn điện tử hoặc PDF)
- Đối chiếu tự động với PO và phiếu nhập hàng theo các trường cơ bản (số tiền, số lượng)
- Phát hiện và liệt kê các dòng chênh lệch
- Luồng để kế toán xem và duyệt kết quả (HITL tối thiểu)

**Ngoài phạm vi (chưa làm ở giai đoạn đầu):**
- Tự động hạch toán/thanh toán mà không qua duyệt
- Phát hiện gian lận nâng cao (đối chiếu với dữ liệu cơ quan thuế)
- Hỗ trợ đa dạng mọi định dạng hóa đơn scan/ảnh chất lượng thấp

## 6. Ràng buộc chính (Key Constraints)

- **HITL bắt buộc** trước khi hạch toán/thanh toán
- **Bảo mật dữ liệu tài chính** (MST, số tiền, thông tin đối tác)
- **Độ chính xác số liệu tuyệt đối** — phép tính số học phải rule-based, không giao cho LLM
- **Cảnh báo khi độ tin cậy trích xuất (OCR) thấp**
- **Tối ưu chi phí xử lý** khi khối lượng hóa đơn lớn

## 7. Success Metrics

- Tỷ lệ tự động hóa: % hóa đơn xử lý được mà không cần người can thiệp
- Precision/Recall của việc so khớp (matching)
- Thời gian xử lý trung bình, so sánh trước/sau khi có Agent
- Human override rate: % đề xuất của Agent bị kế toán sửa lại

## 8. Giả định & Rủi ro (Assumptions & Risks)

| Loại | Nội dung | Ghi chú |
|---|---|---|
| Giả định | *(điền: ví dụ — có sẵn dữ liệu mẫu hóa đơn/PO để test)* | |
| Giả định | *(điền: ví dụ — công ty đã có hóa đơn điện tử chuẩn XML)* | |
| Rủi ro | *(điền: ví dụ — chất lượng OCR thấp với hóa đơn scan mờ)* | Cần phương án dự phòng (gắn cờ thủ công) |
| Rủi ro | *(điền: ví dụ — thiếu dữ liệu PO/phiếu nhập thực tế để huấn luyện/test)* | |


