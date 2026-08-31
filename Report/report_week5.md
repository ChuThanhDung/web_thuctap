# BÁO CÁO TIẾN ĐỘ TUẦN 5

## Dự án DocuSyncAI – AI hỗ trợ đối soát hóa đơn và chứng từ kế toán

| Thông tin | Nội dung |
| --- | --- |
| Nhóm | P-007 |
| Thời gian báo cáo | 23/08/2026 – 29/08/2026 |
| Trưởng nhóm | Chu Thành Dũng |
| Thành viên | Nguyễn Trung Đức, Nguyễn Văn Quý, Trần Lương Hoàng Anh |
| Mentor | Cao Quảng Bình |
| GitHub | <https://github.com/AI20K-Build-Phase-Cohort-3/P-007> |

## 1. Mục tiêu tuần 5

- Mở rộng hệ thống để xử lý nhiều chứng từ cùng loại trong một batch đối soát.
- Hoàn thiện luồng tải lên, theo dõi batch và phối hợp giữa kế toán viên với kế toán trưởng.
- Cải thiện thông báo thời gian thực.
- Thêm dữ liệu kiểm thử.

## 2. Kết quả thực hiện

- Cập nhật API và giao diện upload để hỗ trợ nhiều PO, phiếu nhập kho (GRN) hoặc hóa đơn trong cùng một batch.
- Cải tiến màn hình danh sách batch, Audit Trail và Dashboard, giúp trạng thái xử lý và thông tin chứng từ rõ ràng hơn.
- Bổ sung các bộ dữ liệu kiểm thử multi-document: một PO – nhiều GRN, nhiều PO – một GRN, trường hợp thừa/thiếu sản phẩm.
- Bổ sung dữ liệu edge case cho XML/PDF lỗi và ảnh mờ hoặc hỏng nhằm kiểm tra khả năng xử lý đầu vào bất thường.


## 3. Demo

Demo: <https://c3-app-007.docusyncai.asia/>

- Kế toán viên: `quyhslc11@gmail.com`
- Kế toán trưởng: `skyticket.work@gmail.com`
- Mật khẩu chung: `123456`
