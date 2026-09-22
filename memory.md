# DocuSyncAI — Project Memory & Session History

> **Mục đích:** File lưu trữ ngắn gọn toàn bộ ngữ cảnh quan trọng về dự án và lịch sử công việc đã thực hiện. Khi bắt đầu phiên làm việc mới, AI chỉ cần đọc file này để nắm bắt toàn bộ hiện trạng.

---

## 1. Tổng quan dự án (Project Overview)
* **Tên dự án:** DocuSyncAI (Quản lý chứng từ & Đối soát 3 bên thông minh).
* **Bài toán nghiệp vụ:** Đối soát chéo giữa 3 loại chứng từ kế toán:
  * **PO (Purchase Order):** Đơn đặt hàng.
  * **GRN (Goods Receipt Note):** Phiếu nhập kho.
  * **Invoice:** Hóa đơn tài chính.
* **Cơ chế AI:** 
  * Tự động nhận diện và bóc tách thông tin từ file `.pdf`, `.png`, `.jpg`, `.xml` (dùng OpenAI GPT-4o-mini hoặc Google Gemini 1.5 Flash).
  * Phát hiện sai lệch số tiền, số lượng, thuế suất VAT, thiếu/thừa hàng hóa.
  * Hỗ trợ chế độ **Offline Fallback** (nhận diện qua regex & local parser) khi không có API key hoặc API lỗi.
* **Tech Stack:**
  * **Frontend:** React 18, Vite 5, Tailwind CSS, Recharts, Lucide Icons (`frontend/`).
  * **Backend:** Python 3.11+, FastAPI, Uvicorn, SQLAlchemy, Pydantic (`src/`).
  * **Database:** PostgreSQL 16 (chạy cổng `5433` qua Docker Compose).
  * **Storage:** Hỗ trợ lưu trữ Local (`storage/upload`) hoặc Cloud S3/Cloudflare R2/GCS.

---

## 2. Thông tin môi trường & Tài khoản (Environment & Accounts)
* **GitHub Repository hiện tại:** [https://github.com/chuthanhdung5-source/BaoCaoThucTap.git](https://github.com/chuthanhdung5-source/BaoCaoThucTap.git)
* **Cổng dịch vụ Local (Docker Compose):**
  * Frontend: `http://localhost:3000`
  * Backend API: `http://localhost:8001` (Docs: `http://localhost:8001/docs`, Health: `http://localhost:8001/health`)
  * PostgreSQL: `localhost:5433` (Database: `docusyncai`, User: `admin`, Pass: `Admin@123`)
* **Tài khoản kiểm thử mặc định:**
  * **Kế toán viên:** `quyhslc11@gmail.com` | Mật khẩu: `123456`
  * **Kế toán trưởng:** `skyticket.work@gmail.com` | Mật khẩu: `123456`

---

## 3. Luồng nghiệp vụ phê duyệt 2 cấp (Crucial Business Logic)
1. **Kế toán viên (Accountant):**
   * Upload đủ cả 3 chứng từ: **PO + GRN + Invoice**.
   * Hệ thống AI tự động đối soát -> Batch chuyển sang trạng thái sẵn sàng.
   * Kế toán viên phải bấm **"Duyệt batch"** (`status = approved`) để chuyển tiếp hồ sơ lên cấp trên.
2. **Kế toán trưởng (Chief Accountant):**
   * Trang "Batch đối soát" của Kế toán trưởng **chỉ lọc hiển thị** các batch đã có trạng thái `approved`, `final_approved`, hoặc `rejected`.
   * Kế toán trưởng xem xét và đưa ra quyết định: **"Duyệt cuối" (Final Approve)** hoặc **"Từ chối" (Reject kèm lý do)**.

---

## 4. Các công việc đã xử lý trong phiên làm việc này
1. **Chuyển Git Remote sang repo mới:**
   * Trỏ `origin` sang `https://github.com/chuthanhdung5-source/BaoCaoThucTap.git` và xóa liên kết với repo cũ.
2. **Dọn dẹp mã nguồn:**
   * Xóa sạch hệ thống log prompt học viên cũ: `.ai-log/`, `.claude/`, `.codex/`, `.cursor/`, `.gemini/`, `.agents/`, các file log script trong `scripts/`, và hook `.git/hooks/pre-push`.
   * Xóa các thư mục/file rác & boilerplate: `scratch/`, `fix_encoding.py`, `fix_upload_encoding.js`, `JOURNAL.md`, `WORKLOG.md`, `README_boilerplate.md`.
   * Làm sạch `.gitignore`.
3. **Khắc phục lỗi đẩy code lên GitHub:**
   * Xóa thư mục `.github/` cũ (do chứa cấu hình VPS `self-hosted` gây lỗi phân quyền OAuth App `workflow scope`).
   * Hướng dẫn thiết lập lại CI/CD chuẩn bằng GitHub Actions (`runs-on: ubuntu-latest`).
4. **Sửa lỗi xung đột cổng Backend:**
   * Đổi `BACKEND_PORT=8001` trong `.env` để tránh xung đột với dự án khác đang chiếm cổng `8000`.
5. **Khắc phục lỗi upload file trong Docker (`[Errno 13] Permission denied: '/app/storage/upload'`):**
   * Cập nhật [docker-compose.yml](file:///e:/Group%207/P-007/docker-compose.yml): Mount trọn bộ `./storage:/app/storage` và `./invoice:/app/invoice`.
   * Cập nhật [Dockerfile](file:///e:/Group%207/P-007/Dockerfile): Tạo trước các thư mục lưu trữ và cấp quyền cho `appuser`.
6. **Kiểm tra chất lượng code & Push:**
   * Chạy `ruff check src/ tests/`: **All checks passed** (0 lỗi).
   * Commit và push toàn bộ mã nguồn sạch lên nhánh `main`.
7. **Tư vấn kiến trúc Cloud & Giữ server thức:**
   * Thiết lập mô hình: **Vercel** (Frontend) + **Render** (Backend Docker) + **GCP** (Cloud SQL & GCS).
   * Cấu hình UptimeRobot / Cron-job.org định kỳ ping endpoint `/health` (mỗi 5-10 phút) để chống ngủ cho Render Free.
8. **Khắc phục lỗi upload GCP Cloud Storage (`SignatureDoesNotMatch: Invalid argument`):**
   * Nguyên nhân: `boto3` v1.36+ tự động gửi các header checksum mới (`x-amz-checksum-*`) không tương thích với tầng S3 của Google Cloud Storage.
   * Đã khắc phục: Cấu hình `request_checksum_calculation="when_required"` và `s3={"checksum_algorithm": "when_required"}` trong `src/services/s3_service.py`, đã push lên GitHub để Render tự cập nhật.
