---
version: 1
slug: "frontend-src-pages-landing-jsx"
primary_target: "frontend/src/pages/Landing.jsx"
related_targets: ["frontend/src/pages/Pricing.jsx"]
---

# Trang giới thiệu và bảng giá (public)

Scope: `/` (khi chưa đăng nhập) và `/bang-gia`. Mode: Persuade. Code-led (không có công cụ tạo ảnh).

Audience: kế toán trưởng / chủ doanh nghiệp SME Việt Nam đang đối chiếu PO · HĐ · GRN bằng tay hoặc Excel.
Action: Liên hệ tư vấn (mailto email liên hệ từ GET /legal); phụ: Dùng thử 14 ngày (/dang-ky), Đăng nhập.
Proof: minh họa giao diện thật với dữ liệu minh họa có nhãn; quy tắc minh bạch; không khách hàng, không số liệu bịa.
Constraints: hệ DESIGN.md giữ nguyên (Inter, form blue, rail navy, seal brass, 4/6/8px, rules not shadows, PO · HĐ · GRN cố định).

## Direction contract

THESIS: Trang là hành trình của một bộ chứng từ qua sáu trạm (Tải ba liên → Đọc → So từng dòng → Duyệt cấp 1 → Duyệt cuối → Khóa hồ sơ); từ chối bố cục hero + hàng thẻ tính năng của SaaS.

OWN-WORLD: nền canvas xanh giấy, cột hành trình gradient rail navy → form blue với sáu trạm đánh số tròn, tờ PO · HĐ · GRN giấy trắng có tab chip, ô lệch tô đỏ đẩy lệch 8px như bản than, con dấu brass "Đã đối soát" ở trạm cuối, vạch xanh 2px dưới tiêu đề bảng.

STORY: khách hiểu ba liên được so từng dòng và lý do lệch hiện bằng chữ, tin vì thấy đúng bảng của ứng dụng và quy tắc công khai, rồi bấm Liên hệ tư vấn hoặc dùng thử.

FIRST VIEWPORT: trái 300px cột hành trình (logo, sáu trạm, trạm 1 sáng, nút Liên hệ tư vấn ở chân); phải: nav nhỏ (Bảng giá, Hướng dẫn, Đăng nhập, Dùng thử), H1 lớn, đoạn dẫn, xấp ba tờ PO · HĐ · GRN (HĐ nằm trên) với hai ô lệch và ghi chú lý do, ngay dưới đoạn dẫn. Nút chính trong cột trái và lặp ở trên đầu khi màn hẹp.

FORM: Hành trình một bộ chứng từ, vị trí 3 trong danh sách xếp hạng; seed:1ad807ac47eccb3a. Tương tác đặc trưng: cuộn qua từng trạm thì trạm đó sáng trong cột trái (scroll-spy); khi trang mở, xấp ba liên đang lệch tự xếp thẳng hàng rồi ô lệch bật ra 8px (bỏ qua chuyển động khi người dùng chọn giảm chuyển động).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
