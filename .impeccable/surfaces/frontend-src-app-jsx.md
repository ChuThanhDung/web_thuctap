---
version: 1
slug: "frontend-src-app-jsx"
primary_target: "frontend/src/App.jsx"
related_targets: ["frontend/src/pages/ChiefAccountantBatches.jsx","frontend/src/pages/AuditTrail.jsx"]
---

# Surface brief: DocuSync AI app (toàn bộ ứng dụng)

Scope: thay thế thế giới thị giác cho mọi trang của app (khung, Tổng quan, Hàng đợi, Bộ đối soát hai vai trò, Ngưỡng sai số, Tài khoản, Đăng nhập). Visitor mode: Operate.

Audience/job: kế toán viên (tải chứng từ, duyệt cấp 1) và kế toán trưởng (duyệt cuối, từ chối), desktop văn phòng, dùng hằng ngày. Ràng buộc người dùng chốt: giữ Inter; xanh dương + trắng chủ đạo; mọi thứ khác đổi được. Mục tiêu: hết cảm giác "template AI", ra sản phẩm chuyên nghiệp.

Quyết định mở đã chốt mặc định: Tổng quan giữ dạng tổng hợp riêng (không ba cột); ba dòng con chỉ cho bảng hàng hóa, bảng đối chiếu thông tin giữ ba cột PO · HĐ · GRN.

## Direction contract

THESIS: PO, hóa đơn và GRN là ba liên của một giao dịch; giao diện cho thấy chỗ ba liên không trùng khít. Từ chối bảng quản trị SaaS mặc định: lưới thẻ số liệu cùng cỡ, badge viên thuốc khắp nơi, modal cho mọi chi tiết.

OWN-WORLD: nền trắng, chữ navy #0e1b33, xanh mẫu biểu #1f4fa3 cho thanh điều hướng, nút chính, nhãn liên và đường kẻ đầu bảng 2px; xanh nhạt #e8effa cho vùng chọn và nhãn liên; hổ phách chỉ cho lệch nhỏ, đỏ chỉ cho lệch lớn. Inter, số tabular căn phải. Bo góc nhỏ (6px), viền 1px, gần như không bóng. Nhãn liên PO / HĐ / GRN là con chip vuông nhỏ chữ đậm.

STORY: người dùng chọn một bộ, thấy ngay ba liên chồng lên nhau theo từng mặt hàng, dòng nào lệch bị đẩy ra và tô màu, cột Kết quả nói lý do bằng lời; rồi duyệt hoặc từ chối với khối chữ ký Người lập / Duyệt cấp 1 / Duyệt cuối ở đầu chi tiết.

FIRST VIEWPORT: (Bộ đối soát) thanh icon xanh 64px bên trái; cột danh sách 340px nền xanh rất nhạt với ô tìm kiếm, tab trạng thái và thẻ bộ (mã, nhà cung cấp, tổng tiền, nhãn kết quả), bộ đang chọn có nền xanh nhạt và chữ đậm (không dùng vạch màu bên cạnh); vùng chi tiết bên phải: mã bộ 24px, dòng meta (nhà cung cấp, MST, VAT, số trường lệch), nút Từ chối (viền) cách xa nút Duyệt (đặc) ở góc phải, ba thẻ liên chứng từ cùng cỡ, rồi bảng hàng hóa ba dòng con. Signature interaction: chọn bộ bằng chuột hoặc ↑/↓ cập nhật chi tiết tại chỗ, không modal.

FORM: Ba liên hóa đơn, ứng viên #1 trong danh sách bảy (IMPECCABLE'S PICK, người dùng chọn). seed:132a7b6e1e36c603

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
