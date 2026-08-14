# Quy tắc responsive cho frontend

Áp dụng cho mọi thay đổi giao diện trong `frontend/`. Luôn đọc cùng `frontend/DESIGN.md` trước khi chỉnh UI.

## Breakpoint và cách tiếp cận

- Mobile-first: style mặc định dành cho màn hình dưới `640px`.
- Tablet: dùng prefix Tailwind `sm:` từ `640px` đến dưới `1024px`.
- Desktop: dùng prefix `lg:` từ `1024px` trở lên.
- Kiểm tra tối thiểu tại chiều rộng `375px`, `768px` và `1440px`.

## Layout

- Không đặt `width` cố định cho page, form hoặc vùng nội dung chính. Ưu tiên `w-full`, `min-w-0`, `max-w-*` và `clamp()`.
- Grid chứa card nội dung dài hoặc form phải mặc định `grid-cols-1`, sau đó tăng cột bằng `sm:`/`lg:`.
- Nhóm có từ 3 ô KPI/summary nhỏ, cùng cấu trúc và ít nội dung phải dùng lưới `grid-cols-2` ngay trên mobile để tránh mỗi ô chiếm nguyên một hàng; tăng lên `lg:grid-cols-4` trên desktop. Giảm padding/font/icon ở mobile và luôn thêm `min-w-0`, `break-words` để nội dung không tràn.
- Không ép card nhiều nội dung (form, mô tả dài, bảng con, upload area) thành 2 cột trên mobile; các card này vẫn dùng `grid-cols-1`.
- Flex chứa nội dung dài phải có `min-w-0`, cho phép `flex-wrap` hoặc chuyển sang `flex-col` trên mobile.
- Padding trang mặc định `px-4 py-4`; chỉ tăng bằng breakpoint.
- Sidebar phải là drawer/hamburger trên mobile, rail gọn trên tablet và sidebar đầy đủ trên desktop.

## Thành phần

- Button, input, select và vùng bấm quan trọng phải có chiều cao tối thiểu `44px` (`min-h-11`).
- Ảnh/media phải có `max-width: 100%` và `height: auto`; ảnh cần crop phải dùng `object-cover` trong container có kích thước rõ ràng.
- Tiêu đề lớn dùng `rem`, utility responsive hoặc `clamp()`; tránh font-size px lớn cố định trên mobile.
- Table rộng phải nằm trong `overflow-x-auto overscroll-x-contain` và có `min-w-*` phù hợp để giữ khả năng đọc.
- Modal phải có giới hạn theo `100dvh`, body cuộn được, padding nhỏ trên mobile và action xếp dọc khi thiếu chỗ.
- Modal mở từ sidebar, drawer hoặc phần tử có `transform` phải render bằng React portal trực tiếp vào `document.body`; không để `position: fixed` bị giới hạn theo chiều rộng của sidebar/ancestor.
- Thanh action fixed phải không che nội dung; page tương ứng cần bottom padding đủ lớn.

## Kiểm tra trước khi hoàn tất

- Không có horizontal overflow ở cấp `html`, `body` hoặc page shell.
- Nội dung không bị sidebar, mobile header hoặc fixed action bar che.
- Không thay đổi logic nghiệp vụ khi yêu cầu chỉ liên quan CSS/layout.
- Chạy `npm run build` (hoặc build frontend Docker) và kiểm tra các route chính ở 375/768/1440px.
