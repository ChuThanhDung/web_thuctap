# BÁO CÁO TIẾN ĐỘ TUẦN 3

## Dự án DocuSyncAI – AI hỗ trợ đối soát hóa đơn và chứng từ kế toán

| Thông tin | Nội dung |
| --- | --- |
| Nhóm | P-007 |
| Thời gian báo cáo | 09/08/2026 – 15/08/2026 |
| Trưởng nhóm | Chu Thành Dũng |
| Thành viên | Nguyễn Trung Đức, Nguyễn Văn Quý, Trần Lương Hoàng Anh |
| Mentor | Cao Quảng Bình |
| GitHub | <https://github.com/AI20K-Build-Phase-Cohort-3/P-007> |

## 1. Tiến độ hiện tại

Team đã tập trung hoàn thiện MVP, cải thiện việc upload chứng từ, chỉnh sửa giao diện người dùng, tìm kiếm dữ liệu kiểm thử và tối ưu CI/CD. 
Hệ thống hiện sử dụng frontend React, backend FastAPI, PostgreSQL. 
Hệ thống đã có các màn hình nghiệp vụ chính cho hai vai trò kế toán viên và kế toán trưởng.

## 2. Những công việc đã hoàn thành

- Hoàn thiện đăng nhập, phân quyền cho `accountant` và `chief_accountant`.
- Hoàn thiện giao diện tổng quan cho kế toán viên và kế toán trưởng; cải thiện responsive UI, sidebar.
- Bổ sung chức năng xem, cập nhật hồ sơ cá nhân.
- Hoàn thiện luồng tạo batch và upload ba loại chứng từ PO, GRN, Invoice.
- Hỗ trợ nhiều định dạng dữ liệu như XML, PDF; bổ sung AI để nhận diện, đọc và trích xuất thông tin chứng từ.
- Theo dõi các chứng từ đã có/còn thiếu trong từng batch và chuyển batch sang trạng thái sẵn sàng khi đủ bộ ba chứng từ.
- Xây dựng logic đối soát 3 chiều theo số lượng, đơn giá và ngưỡng sai lệch.
- Hoàn thiện luồng HITL: kế toán trưởng có quyền phê duyệt, từ chối và các hành động được lưu vào Audit Trail.
- Bổ sung bộ dữ liệu mẫu gồm PO, GRN và Invoice ở nhiều định dạng để phục vụ demo và kiểm thử.

## 3. Kết quả hiện tại

MVP hiện đã thể hiện được luồng nghiệp vụ chính: người dùng đăng nhập, tạo batch, tải lên bộ chứng từ, xem trạng thái xử lý, theo dõi hồ sơ đối soát và thực hiện quyết định.

Demo: <https://docusyncai-frontend.vercel.app/login>
- Kế toán viên: `accountant@docusync.ai`
- Kế toán trưởng: `chief.accountant@docusync.ai`
- Mật khẩu: `123456`


