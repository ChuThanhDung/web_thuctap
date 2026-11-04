# Checklist bảo mật (OWASP Top 10 2021)

Rà soát ngày 04/11/2026, áp dụng cho bản có nhiều công ty, gói dịch vụ và 2FA. Cập nhật lại khi thêm chức năng có
dữ liệu khách hàng, thanh toán hoặc phân quyền mới.

Cách đọc: **Đã có** là biện pháp đang chạy kèm nơi kiểm chứng (test, file); **Còn lại** là việc chưa làm hoặc rủi ro
chấp nhận.

## A01 Kiểm soát truy cập sai

**Đã có**
- Cách ly công ty bằng Row-Level Security của Postgres (migration `0003`), app chạy bằng role không phải superuser.
  Test: `tests/test_api/test_tenant_isolation.py` (đọc, sửa, xóa, xem file chéo công ty đều 404; DB chặn cả khi code
  quên lọc).
- Phân quyền theo vai trò ở từng endpoint (`accountant`, `chief_accountant`, `platform_admin`); admin nền tảng bị chặn
  khỏi API nghiệp vụ (`PLATFORM_ADMIN_PATHS`). Test: `tests/test_api/test_signup_and_admin.py`.
- Bộ đã duyệt cuối không sửa/xóa được, có cả trigger DB (migration `0002`).
- Đơn thanh toán, lời mời, mức dùng cũng cách ly theo công ty (test `test_billing_and_limits.py`).

**Còn lại**
- File đính kèm phục vụ qua backend có kiểm tra quyền; nếu bật lưu trữ S3 thì URL ký sẵn phải ngắn hạn.

## A02 Lỗi mật mã

**Đã có**
- HTTPS bắt buộc qua Caddy (Let's Encrypt), header HSTS, CSP (`deploy/Caddyfile`).
- Mật khẩu bcrypt; phiên đăng nhập là token ngẫu nhiên chỉ lưu SHA-256; mã OTP, mã mời, mã 2FA tạm cũng chỉ lưu hash.
- CCCD, địa chỉ, khóa TOTP mã hóa khi lưu (Fernet, `src/services/crypto.py`); tìm trùng CCCD bằng HMAC. Khóa
  `DATA_ENCRYPTION_KEY` chỉ nằm ở `.env` trên máy chủ, deploy tự sinh nếu thiếu (`deploy/gcp/ensure-secrets.sh`).
  Test: `test_citizen_id_is_encrypted_masked_and_revealed_only_to_chief`.
- Giao diện chỉ hiện CCCD đã che (`0012****5678`); xem đủ số chỉ kế toán trưởng, mỗi lần xem ghi nhật ký
  `CITIZEN_ID_VIEWED`.

**Còn lại**
- Mất `.env` = mất CCCD/địa chỉ đã mã hóa: sao lưu khóa vào trình quản lý mật khẩu (không đưa vào bản sao lưu DB).
- Bản sao lưu DB trên Cloud Storage chưa mã hóa phía ứng dụng (GCS mã hóa sẵn khi lưu; quyền bucket phải riêng tư).

## A03 Injection

**Đã có**
- Truy vấn qua SQLAlchemy có tham số; SQL thô trong migration không nhận dữ liệu người dùng.
- XML khách tải lên đọc bằng `defusedxml`, cấm DTD (chặn XML bomb, entity ngoài). Test:
  `test_xml_with_entity_expansion_is_refused`. Phát hiện nhờ bandit (B314), đã sửa.
- React tự escape nội dung; email HTML escape mọi giá trị người dùng nhập (`src/services/email.py`).

## A04 Thiết kế không an toàn

**Đã có**
- Hạn mức theo gói kiểm tra trước khi gọi AI (không tốn tiền khi bị chặn), bộ đếm không giảm khi xóa.
- Webhook thanh toán xác thực khóa, xử lý mỗi giao dịch một lần, bỏ qua giao dịch chuyển thiếu/không có mã.
- Không bịa dữ liệu khi AI lỗi; chứng từ thiếu tổng tiền không được coi là khớp.

## A05 Cấu hình sai

**Đã có**
- Production từ chối khởi động khi dùng mật khẩu DB mặc định, mật khẩu seed yếu, khóa mã hóa sai định dạng
  (`src/config.py`). Tài liệu API (`/docs`) tắt ở production.
- Header bảo mật: CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy (`deploy/Caddyfile`).
- Postgres chỉ nghe trong mạng Docker; backend không mở cổng ra ngoài.

**Còn lại**
- Quét thụ động OWASP ZAP mỗi tuần (`.github/workflows/zap.yml`), xem báo cáo trong tab Actions.

## A06 Thành phần có lỗ hổng

**Đã có**
- CI chạy `pip-audit` (thư viện Python production), `npm audit --omit=dev --audit-level=high`, `bandit -ll`.
  Lần rà này đã nâng Pillow 11 → 13, LangChain/LangGraph 0.x → 1.x để hết lỗ hổng đã công bố.

**Còn lại**
- `npm audit` còn lỗ hổng ở công cụ dev (vitest/tinypool), không nằm trong bản build. Nâng khi vitest có bản ổn định.
- Lỗ hổng chấp nhận tạm (nếu có) ghi ở đây kèm ID và lý do, rồi thêm `--ignore-vuln <ID>` vào CI.

## A07 Lỗi xác thực

**Đã có**
- Mật khẩu tối thiểu 10 ký tự, có chữ và số, chặn danh sách mật khẩu phổ biến, không dùng lại 3 mật khẩu gần nhất.
  Đổi mật khẩu cần OTP email và đăng xuất các phiên khác.
- Xác thực hai lớp TOTP, bắt buộc với kế toán trưởng và admin nền tảng; mã 6 số không dùng lại được; 10 mã khôi phục
  dùng một lần; bước hai khóa sau 5 lần sai. Test: `tests/test_api/test_account_security.py`.
- Giới hạn đăng nhập sai theo email, IP và cặp email + IP (đếm từ `audit_logs`); giới hạn đăng ký theo IP/email.
- Phiên hết hạn sau 12 giờ; công ty bị khóa thì mọi phiên bị chặn ngay.

**Còn lại**
- Chưa giới hạn tốc độ chung cho mọi API (chỉ đăng nhập, đăng ký, OTP). Nếu cần, thêm ở Caddy (`rate_limit`).

## A08 Toàn vẹn phần mềm và dữ liệu

**Đã có**
- Image build trên GitHub Actions từ commit đã qua CI, máy chủ chỉ pull đúng tag commit.
- Bộ đã duyệt cuối bất biến (trigger DB), có lịch sử phiên bản bộ.

## A09 Ghi nhật ký và giám sát

**Đã có**
- `audit_logs` ghi đăng nhập (thành công, sai, bị khóa, bước 2FA), đổi mật khẩu, bật/tắt/đặt lại 2FA, dùng mã khôi
  phục, tạo/sửa/khóa người dùng, mời người dùng, xem CCCD, tạo đơn và nhận thanh toán, admin đổi gói/khóa công ty.
- Sentry (khi đặt DSN), Uptime Check `/health`, cảnh báo RAM/đĩa (`deploy/gcp/check-resources.sh`).

## A10 SSRF

**Đã có**
- Backend không tải URL do người dùng nhập. Gọi ra ngoài chỉ tới OpenAI/Gemini, SMTP, SePay (cấu hình cố định).

## Kiểm tra thủ công đã làm

| Hạng mục | Kết quả |
|---|---|
| Tải file độc: XML bomb, file hỏng | XML bomb và file không đọc được bị từ chối (422); giới hạn dung lượng mỗi file |
| XSS trong ghi chú bộ, lý do từ chối, tên công ty | React escape khi hiển thị; email escape HTML |
| CSRF | API dùng token Bearer trong header (không dùng cookie) nên không bị CSRF |
| Đoán ID của công ty khác (bộ, file, lời mời, đơn) | 404 (test cách ly) |
| Dùng lại mã 2FA / mã khôi phục | Bị từ chối (test) |
