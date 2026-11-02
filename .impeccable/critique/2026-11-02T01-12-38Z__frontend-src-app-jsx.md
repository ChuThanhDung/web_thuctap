---
target: toàn bộ app (App.jsx)
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:E:\\Group 7\\P-007\\frontend\\src\\App.jsx"
target_fingerprint: "sha256:8ca48a0db6630d039cfaec214885809f511d0f50bd7af25fdc811eeb80846ece"
target_path: "E:\\Group 7\\P-007\\frontend\\src\\App.jsx"
timestamp: 2026-11-02T01-12-38Z
slug: frontend-src-app-jsx
---
Method: dual-agent (A: design review sub-agent · B: detector/browser sub-agent)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Tab đếm "0" giả khi đang tải ở Bộ đối soát (KTT); "Đang tải dữ liệu batch..." lẫn tiếng Anh |
| 2 | Match System / Real World | 3 | Dải chữ ký, ba liên rất đúng nghề; nhưng "83% khớp" trên bộ đã khớp và lưu trữ; "Deactive" |
| 3 | User Control and Freedom | 3 | Đổi tab lọc mà chi tiết vẫn giữ bộ không còn trong danh sách |
| 4 | Consistency and Standards | 2 | Hai bản Bộ đối soát (KTV/KTT) khác nhau; hai kiểu Tổng quan; "Tỉ lệ"/"Tỷ lệ" |
| 5 | Error Prevention | 3 | Hộp xác nhận duyệt cuối tốt; /settings nói số lượng "khớp tuyệt đối" nhưng lại cho chỉnh ngưỡng số lượng |
| 6 | Recognition Rather Than Recall | 3 | Ba thẻ PO/HĐ/GRN ở /upload có hover như bấm được nhưng không bấm được |
| 7 | Flexibility and Efficiency | 2 | ↑/↓ chỉ chạy khi đã focus dòng; không phím tắt Duyệt/Từ chối, không duyệt hàng loạt, không tự sang bộ kế |
| 8 | Aesthetic and Minimalist Design | 3 | Phía KTT gọn; Tổng quan KTV biểu đồ lấn số liệu cần làm; badge "Đang áp dụng" thừa |
| 9 | Error Recovery | 2 | Ô tải lên không báo định dạng/dung lượng trước khi lỗi |
| 10 | Help and Documentation | 2 | Upload không có hướng dẫn tại chỗ; "1 thiếu" không giải thích |
| **Total** | | **26/40** | **Acceptable** |

## Design Specificity Verdict

LLM: Phía kế toán trưởng và trang đăng nhập mang đúng thế giới "Ba liên hóa đơn" (dải chữ ký, ba thẻ liên, bảng ba dòng con, chip PO/HĐ/GRN, kẻ đầu bảng 2px). Tổng quan kế toán viên là dashboard chung chung (chip tỉ lệ trôi nổi, thẻ ngày, 5 số, donut + cột, không H1, không hàng việc). Hai bản Bộ đối soát là hai "phương ngữ" của một bề mặt.

Detector: CLI regex-only sạch (exit 0, 42 file). Quét HTML dựng lại có CSS: /login, tổng quan KTT, /settings, chi tiết bộ đều sạch; /users 1 cramped-padding ở UserManagement.jsx:345 (nhiều khả năng dương tính giả). Overlay không chạy được vì CSP script-src 'self' (frontend/nginx.conf). Không quét được /upload và Tổng quan KTV.

## Priority Issues

1. [P1] Tổng quan kế toán viên là dashboard chung, không có hàng việc (AccountantOverview.jsx). Fix: H1 "Tổng quan", bỏ chip tỉ lệ, dải 4 số với "Cần bạn xử lý" đứng đầu, danh sách "Cần xử lý ngay", biểu đồ xuống dưới hoặc bỏ donut, dùng ô chọn kỳ gọn như KTT. Command: layout, distill.
2. [P1] Hai bề mặt Bộ đối soát lệch nhau (AuditTrail.jsx vs ChiefAccountantBatches.jsx). Fix: tách BatchListItem, header chi tiết, thanh tab dùng chung; dòng meta KTV có MST, VAT, kết quả; hàng có tổng tiền; một kiểu đánh dấu bộ đang chọn. Command: polish, clarify.
3. [P1] Số liệu và trạng thái mâu thuẫn: 83% vs "—"; "83% khớp" trên bộ khớp hết; "1 thiếu" vs tab "Thiếu dữ liệu 0"; số 0 giả khi tải; bộ bị lọc vẫn mở. Fix: một nguồn tính, tách "độ phủ trường" khỏi "% khớp", "1 trường thiếu", skeleton khi tải, đổi lọc thì chọn dòng đầu. Command: harden.
4. [P2] Tải chứng từ: thẻ loại giả bấm được, ô thả file không hướng dẫn, nút không tên truy cập (UploadQueue.jsx). Fix: bỏ hover hoặc biến thẻ thành vùng thả theo loại; ghi rõ "Kéo thả hoặc chọn file · XML, PDF, JPG, PNG · tự nhận loại"; aria-label. Command: clarify, harden.
5. [P2] Luồng bàn phím cho khối lượng lớn: roving tabindex, focus danh sách khi vào trang, phím A/R mở hộp xác nhận, tự chọn bộ kế + toast sau khi quyết định. Command: optimize, delight.

## Persona Red Flags

Alex: không duyệt hàng loạt, không phím tắt, không tự sang bộ kế; danh sách và chi tiết cuộn chung nên dòng đang chọn trôi mất.
Sam: vùng thả và hàng bộ ở /upload là nút không tên; chọn trong danh sách KTT chỉ là viền 1px; icon X cho "Deactive" giống xóa; nút vô hiệu không lý do; Tổng quan không H1; ô lọc ở /users không nhãn.
Kế toán viên hằng ngày: trang chủ không nói việc gì cần làm; bộ thiếu chứng từ ở /upload, bộ sẵn sàng ở /audit-trail, không có "hàng việc của tôi"; "83% khớp" khiến kiểm lại việc đã xong; không biết định dạng nào được chấp nhận.

## Minor Observations

CCCD hiện đầy đủ ở /users; chữ viết tắt avatar lấy từ hậu tố vai trò; "Deactive" thay vì "Ngừng hoạt động"; placeholder mật khẩu "********" trông như đã điền; chú thích "Cần xem" màu xanh thay vì hổ phách; câu "(bộ cũ chưa được đối soát lại không được tính)" là ngôn ngữ dev; /notifications gọi ~5 lần mỗi trang, /uploads/batches 2–3 lần; WebSocket đóng trước khi kết nối.

## Questions to Consider

- Nếu luận điểm là "chỉ ra chỗ ba liên không trùng khít", sao trang chủ kế toán viên lại mở bằng donut thay vì danh sách bộ lệch/thiếu?
- "% khớp" có nên tồn tại? Kế toán nghĩ theo khớp / lệch nhỏ / lệch lớn / thiếu.
- Khoảnh khắc duyệt cuối có nên kết thúc bằng con dấu đồng "niêm phong" tại chỗ và bộ kế tiếp đã được chọn sẵn?
