# BÁO CÁO TIẾN ĐỘ TUẦN 2

## Dự án AI Agent Đối soát Hóa đơn & Chứng từ Kế toán (DocuSyncAI)

| Thông tin | Nội dung |
| --- | --- |
| Nhóm | P-007 |
| Thời gian báo cáo | 03/08/2026 - 08/08/2026 |
| Trưởng nhóm | Chu Thành Dũng |
| Thành viên | Nguyễn Trung Đức, Nguyễn Văn Quý, Trần Lương Hoàng Anh |
| Mentor | Cao Quảng Bình |
| GitHub | <https://github.com/AI20K-Build-Phase-Cohort-3/P-007> |

---

## 1. Mục tiêu tuần 2

Trong tuần 2, nhóm tập trung chuyển từ giai đoạn xác định bài toán sang xây dựng nền tảng MVP. Các mục tiêu chính gồm:

- Hoàn thiện Project Brief, PRD, user stories và wireframe cho Gate 1.
- Dựng frontend cho luồng làm việc của kế toán viên và kế toán trưởng.
- Xây dựng backend FastAPI, kết nối PostgreSQL và frontend.
- Triển khai xác thực người dùng, xem/cập nhật hồ sơ và phân quyền cơ bản.
- Xây dựng luồng tải chứng từ, đọc dữ liệu và tạo kết quả đối soát ban đầu.
- Chuẩn bị Docker, CI/CD và cấu hình triển khai frontend/backend.

## 2. Công việc đã thực hiện

### 2.1. Phân tích sản phẩm và thiết kế

- Hoàn thiện **Project Brief** mô tả bài toán, người dùng mục tiêu, phạm vi MVP, ràng buộc và chỉ số thành công.
- Hoàn thiện **PRD**, bổ sung hai nhóm người dùng chính là kế toán viên và kế toán trưởng.
- Bổ sung user stories cho các luồng: tải chứng từ, xem kết quả đối soát, duyệt/từ chối, duyệt hàng loạt, audit trail và cấu hình ngưỡng.
- Xây dựng wireframe/UI flow cho các màn hình chính và cập nhật tài liệu Gate 1.

### 2.2. Frontend

Frontend được xây dựng bằng **React 18, Vite và Tailwind CSS**, gồm các màn hình/chức năng:

- Đăng nhập và quản lý phiên người dùng.
- Dashboard tổng quan tình trạng đối soát.
- Danh sách hồ sơ đối soát và bộ lọc trạng thái.
- Chi tiết từng case, hiển thị dòng hàng, mức chênh lệch và độ tin cậy.
- Hàng đợi tải chứng từ.
- Duyệt hàng loạt các hồ sơ đủ điều kiện.
- Nhật ký thao tác (Audit Trail).
- Cấu hình ngưỡng chênh lệch.
- Xem và cập nhật hồ sơ người dùng.


### 2.3. Backend và cơ sở dữ liệu

Backend sử dụng **FastAPI**, **SQLAlchemy** và **PostgreSQL**. Các nhóm API chính đã được xây dựng:

- Xác thực: đăng nhập, lấy/cập nhật hồ sơ, yêu cầu và xác minh OTP, đổi mật khẩu.
- Tải lên và liệt kê chứng từ.
- Danh sách, thống kê, chi tiết và quyết định duyệt/từ chối case đối soát.
- Danh sách nhật ký thao tác.
- Xem và cập nhật ngưỡng chênh lệch dành cho kế toán trưởng.

Các model dữ liệu chính gồm người dùng, vai trò, phiên đăng nhập, hóa đơn/PO/GRN, dòng hàng, case đối soát, file tải lên, ngưỡng và audit log.

### 2.4. Xử lý chứng từ và đối soát

- Xây dựng parser cho chứng từ XML, nhận diện ba loại dữ liệu: hóa đơn, đơn đặt hàng (PO) và phiếu nhập hàng (GRN).
- Bổ sung chiến lược xử lý PDF/PNG thông qua Gemini, OpenAI Vision hoặc OCR cục bộ tùy cấu hình.
- Xây dựng reconciliation engine để đối chiếu dữ liệu hóa đơn với PO và GRN.
- Áp dụng ngưỡng theo giá trị tuyệt đối và tỷ lệ phần trăm cho từng mặt hàng.
- Bước đầu lưu kết quả đối soát và trạng thái xử lý vào cơ sở dữ liệu.

Phần upload PDF/PNG và liên kết dữ liệu giữa database, backend, frontend đã được triển khai nhưng vẫn cần kiểm thử thêm với nhiều mẫu chứng từ thực tế.

### 2.5. DevOps và triển khai

- Hoàn thiện Dockerfile cho backend và Docker Compose cho frontend, backend, PostgreSQL.
- Thêm dữ liệu khởi tạo tài khoản mẫu cho hai vai trò kế toán viên và kế toán trưởng.

## 3. Kết quả đạt được

| Hạng mục | Trạng thái | Kết quả |
| --- | --- | --- |
| Project Brief, PRD, user stories | Hoàn thành | Đã có tài liệu trong `Report/gate1/` |
| Wireframe và UI flow | Hoàn thành bản đầu | Đã mô tả các màn hình và luồng nghiệp vụ chính |
| Frontend MVP | Đã triển khai bản đầu | Có dashboard, upload, danh sách/chi tiết đối soát, audit log, threshold và hồ sơ |
| Đăng nhập và hồ sơ người dùng | Đã triển khai | Backend API và frontend đã được kết nối |
| Cơ sở dữ liệu | Đã triển khai nền tảng | Có model nghiệp vụ và cấu hình PostgreSQL |
| Upload và đọc chứng từ | Đang hoàn thiện | Có XML parser và các chiến lược PDF/PNG/OCR/Vision |
| Đối soát 3 chiều | Đã có logic ban đầu | So sánh hóa đơn với PO/GRN theo dòng hàng và ngưỡng |
| HITL duyệt/từ chối | Đã triển khai bản đầu | Có API quyết định case và lưu audit log |
| CI/CD và Docker | Đã cấu hình | Có workflow CI, Render, Vercel và Docker Compose |
| Kiểm thử toàn hệ thống | Chưa hoàn tất | Source có test API nhưng cần cài đủ dependency và chạy lại trên môi trường chuẩn |

## 4. Khó khăn

- Luồng đọc PDF/PNG chưa ổn định với mọi mẫu hóa đơn; kết quả còn phụ thuộc chất lượng file.
- Dữ liệu liên kết hóa đơn - PO - GRN cần thêm bộ mẫu chuẩn để kiểm tra các trường hợp thiếu chứng từ, sai số lượng, sai đơn giá và trùng hóa đơn.

