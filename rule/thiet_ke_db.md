# Thiết kế database docusyncai

Tài liệu này mô tả các bảng phục vụ chức năng đăng nhập, xác thực và phân quyền cho hệ thống AI Đối soát. Database sử dụng PostgreSQL, tên database là `docusyncai`.

## 1. Bảng `roles`

Lưu danh sách vai trò trong hệ thống.

| Trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
| --- | --- | --- | --- |
| `id` | `UUID` | Primary key | Mã định danh duy nhất của vai trò. |
| `code` | `VARCHAR(50)` | Unique, not null | Mã vai trò dùng trong backend/frontend. Giá trị chính: `accountant`, `chief_accountant`. |
| `name` | `VARCHAR(100)` | Not null | Tên hiển thị của vai trò, ví dụ `Kế toán viên`, `Kế toán trưởng`. |
| `description` | `TEXT` | Nullable | Mô tả phạm vi trách nhiệm của vai trò. |
| `is_active` | `BOOLEAN` | Default `TRUE` | Cho biết vai trò còn được sử dụng hay không. |
| `created_at` | `TIMESTAMPTZ` | Default `NOW()` | Thời điểm tạo vai trò. |
| `updated_at` | `TIMESTAMPTZ` | Default `NOW()` | Thời điểm cập nhật vai trò gần nhất. |

## 2. Bảng `permissions`

Lưu danh sách quyền thao tác chi tiết.

| Trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
| --- | --- | --- | --- |
| `id` | `UUID` | Primary key | Mã định danh duy nhất của quyền. |
| `code` | `VARCHAR(100)` | Unique, not null | Mã quyền, ví dụ `reconciliation.view`, `reconciliation.approve`. |
| `name` | `VARCHAR(150)` | Not null | Tên hiển thị của quyền. |
| `description` | `TEXT` | Nullable | Mô tả quyền được phép thực hiện hành động gì. |
| `created_at` | `TIMESTAMPTZ` | Default `NOW()` | Thời điểm tạo quyền. |

## 3. Bảng `role_permissions`

Liên kết nhiều-nhiều giữa vai trò và quyền.

| Trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
| --- | --- | --- | --- |
| `role_id` | `UUID` | Foreign key `roles.id`, primary key | Vai trò được gán quyền. |
| `permission_id` | `UUID` | Foreign key `permissions.id`, primary key | Quyền được gán cho vai trò. |
| `created_at` | `TIMESTAMPTZ` | Default `NOW()` | Thời điểm gán quyền. |

## 4. Bảng `users`

Lưu thông tin tài khoản đăng nhập.

| Trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
| --- | --- | --- | --- |
| `id` | `UUID` | Primary key | Mã định danh duy nhất của người dùng. |
| `email` | `VARCHAR(255)` | Unique, not null | Email dùng để đăng nhập. |
| `password_hash` | `VARCHAR(255)` | Not null | Mật khẩu đã mã hóa bằng BCrypt. Không lưu mật khẩu thô. |
| `full_name` | `VARCHAR(100)` | Not null | Họ tên người dùng. |
| `role_id` | `UUID` | Foreign key `roles.id`, not null | Vai trò chính của người dùng. |
| `department` | `VARCHAR(100)` | Nullable | Phòng ban hoặc bộ phận làm việc. |
| `employee_code` | `VARCHAR(50)` | Unique, nullable | Mã nhân viên nội bộ. |
| `date_of_birth` | `DATE` | Nullable | Ngày sinh của người dùng. |
| `address` | `VARCHAR(255)` | Nullable | Nơi ở hoặc địa chỉ liên hệ của người dùng. |
| `citizen_id` | `VARCHAR(20)` | Unique, nullable | Số căn cước công dân. |
| `phone` | `VARCHAR(20)` | Nullable | Số điện thoại liên hệ. |
| `avatar_url` | `VARCHAR(500)` | Nullable | Đường dẫn ảnh đại diện của người dùng. |
| `status` | `VARCHAR(20)` | Default `ACTIVE` | Trạng thái tài khoản: `ACTIVE`, `INACTIVE`, `LOCKED`. |
| `last_login_at` | `TIMESTAMPTZ` | Nullable | Thời điểm đăng nhập gần nhất. |
| `created_at` | `TIMESTAMPTZ` | Default `NOW()` | Thời điểm tạo tài khoản. |
| `updated_at` | `TIMESTAMPTZ` | Default `NOW()` | Thời điểm cập nhật tài khoản gần nhất. |

## 5. Bảng `user_sessions`

Lưu phiên đăng nhập sau khi xác thực thành công.

| Trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
| --- | --- | --- | --- |
| `id` | `UUID` | Primary key | Mã định danh duy nhất của phiên đăng nhập. |
| `user_id` | `UUID` | Foreign key `users.id`, not null | Người dùng sở hữu phiên đăng nhập. |
| `session_token_hash` | `VARCHAR(128)` | Unique, not null | Token phiên đã băm SHA-256 trước khi lưu. |
| `ip_address` | `VARCHAR(45)` | Nullable | Địa chỉ IP khi đăng nhập. |
| `user_agent` | `TEXT` | Nullable | Thông tin trình duyệt hoặc thiết bị đăng nhập. |
| `expires_at` | `TIMESTAMPTZ` | Not null | Thời điểm phiên đăng nhập hết hạn. |
| `revoked_at` | `TIMESTAMPTZ` | Nullable | Thời điểm phiên bị thu hồi hoặc đăng xuất. |
| `created_at` | `TIMESTAMPTZ` | Default `NOW()` | Thời điểm tạo phiên đăng nhập. |

## 6. Bảng `audit_logs`

Lưu nhật ký thao tác quan trọng, bao gồm đăng nhập và các hành động nghiệp vụ.

| Trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
| --- | --- | --- | --- |
| `id` | `BIGSERIAL` | Primary key | Mã định danh nhật ký. |
| `user_id` | `UUID` | Foreign key `users.id`, nullable | Người dùng thực hiện hành động. Nullable để ghi nhận sự kiện chưa xác thực. |
| `action` | `VARCHAR(80)` | Not null | Hành động, ví dụ `LOGIN_SUCCESS`, `LOGIN_FAILED`, `APPROVE_RECONCILIATION`. |
| `target_type` | `VARCHAR(80)` | Nullable | Loại đối tượng bị tác động, ví dụ `USER`, `INVOICE`, `RECONCILIATION_CASE`. |
| `target_id` | `VARCHAR(255)` | Nullable | ID của đối tượng bị tác động. |
| `details` | `JSONB` | Nullable | Dữ liệu bổ sung cho nhật ký. |
| `ip_address` | `VARCHAR(45)` | Nullable | IP thực hiện thao tác. |
| `user_agent` | `TEXT` | Nullable | Trình duyệt hoặc thiết bị thực hiện thao tác. |
| `created_at` | `TIMESTAMPTZ` | Default `NOW()` | Thời điểm ghi nhật ký. |

## Phân quyền ban đầu

| Vai trò | Quyền chính |
| --- | --- |
| `accountant` | Xem danh sách đối soát, xem chi tiết hồ sơ, tải chứng từ, xem nhật ký liên quan. |
| `chief_accountant` | Xem tổng quan, phê duyệt đối soát, xem nhật ký, cấu hình ngưỡng và quản trị quy trình kế toán. |
