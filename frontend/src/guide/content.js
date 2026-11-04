// Nội dung trang Hướng dẫn sử dụng (/huong-dan). Mỗi mục có id để liên kết thẳng: /huong-dan#tai-chung-tu.
// Viết theo đúng hành vi hiện tại của phần mềm; sửa quy tắc đối soát hay luồng duyệt thì sửa cả ở đây.

export const GUIDE_SECTIONS = [
  {
    id: 'bat-dau',
    title: 'Bắt đầu',
    blocks: [
      { type: 'p', text: 'Một bộ đối soát gồm ba chứng từ của cùng một giao dịch: đơn đặt hàng (PO), hóa đơn (HĐ) và phiếu nhập kho (GRN). Hệ thống so ba liên theo từng dòng hàng và chỉ ra chỗ lệch kèm lý do.' },
      { type: 'steps', items: [
        'Kế toán trưởng đăng ký công ty, bật xác thực hai lớp, rồi mời kế toán viên ở trang Quản lý tài khoản.',
        'Kế toán viên tạo bộ và tải đủ ba chứng từ ở trang Tải chứng từ.',
        'Kế toán viên xem kết quả, duyệt bộ khớp hoặc lệch nhỏ (duyệt cấp 1).',
        'Kế toán trưởng duyệt cuối hoặc từ chối kèm lý do; bộ đã duyệt cuối được khóa thành hồ sơ.',
      ] },
    ],
  },
  {
    id: 'tai-chung-tu',
    title: 'Tải chứng từ',
    blocks: [
      { type: 'p', text: 'Nhận XML hóa đơn điện tử (Tổng cục Thuế, UBL), XML đơn đặt hàng và phiếu nhập kho, PDF và ảnh chụp (JPG, PNG). Kéo thả từng file vào đúng ô PO, HĐ, GRN, hoặc kéo cả ba để hệ thống tự nhận diện.' },
      { type: 'list', items: [
        'XML được đọc ngay trên máy chủ, chính xác và không tốn lượt AI. Nên dùng XML khi có.',
        'PDF và ảnh được đọc bằng dịch vụ AI, mất từ vài giây đến vài chục giây. Ảnh mờ, nghiêng hoặc thiếu góc có thể bị đánh dấu "chất lượng thấp": kiểm tra lại số liệu trước khi duyệt.',
        'Một file đã có trong bộ thì không tải trùng được.',
        'Từ khi bộ được duyệt cấp 1, không thêm hay xóa chứng từ được nữa. Bộ bị từ chối thì tải bổ sung được, hệ thống lưu phiên bản cũ.',
      ] },
    ],
  },
  {
    id: 'doc-ket-qua',
    title: 'Đọc kết quả đối soát',
    blocks: [
      { type: 'p', text: 'Bảng chi tiết hàng hóa xếp ba liên theo thứ tự cố định PO · HĐ · GRN cho từng mặt hàng. Cột Kết quả nói bằng chữ chỗ nào khác, ví dụ "Đơn giá HĐ cao hơn PO 3.000 đ". Hệ thống không biết liên nào đúng, chỉ chỉ ra liên nào khác.' },
      { type: 'table', head: ['Kết quả', 'Ý nghĩa'], rows: [
        ['Khớp', 'Ba liên trùng nhau ở mọi quy tắc.'],
        ['Lệch nhỏ', 'Chỉ số tiền lệch trong ngưỡng làm tròn (mặc định tối đa 1.000 đ).'],
        ['Lệch lớn', 'Có đơn giá, số lượng, MST, thuế suất khác nhau, hoặc tiền lệch vượt ngưỡng.'],
        ['Thiếu chứng từ', 'Bộ chưa đủ ba liên, hoặc hóa đơn / PO không ghi tổng tiền.'],
      ] },
    ],
  },
  {
    id: 'quy-tac',
    title: 'Quy tắc và ngưỡng sai số',
    blocks: [
      { type: 'list', items: [
        'Mã số thuế, thuế suất VAT, đơn giá và số lượng phải khớp tuyệt đối.',
        'Thành tiền, tiền thuế, tổng thanh toán được lệch tối đa theo ngưỡng (mặc định 1.000 đ) do làm tròn.',
        'Dòng hàng được ghép theo mã hàng (SKU), rồi theo tên trùng khớp, rồi theo tên gần nhất.',
        'Phiếu nhập kho không ghi tổng tiền vẫn đối soát được; hóa đơn hoặc PO không ghi tổng thì không được coi là khớp.',
      ] },
      { type: 'p', text: 'Kế toán trưởng chỉnh ngưỡng ở trang Ngưỡng sai số. Ngưỡng phần trăm bằng 0 nghĩa là không xét theo phần trăm.' },
    ],
  },
  {
    id: 'duyet',
    title: 'Duyệt hai cấp',
    blocks: [
      { type: 'list', items: [
        'Kế toán viên duyệt cấp 1 các bộ đã đủ chứng từ và có kết quả Khớp hoặc Lệch nhỏ. Bộ lệch lớn không duyệt được: tải chứng từ đúng thay thế, hoặc xóa bộ nếu nhập nhầm.',
        'Kế toán trưởng duyệt cuối hoặc từ chối. Lý do từ chối được gửi email cho kế toán viên.',
        'Bộ đã duyệt cuối thành hồ sơ lưu trữ: không sửa, không xóa được, kể cả từ cơ sở dữ liệu.',
      ] },
    ],
  },
  {
    id: 'goi-dich-vu',
    title: 'Gói dịch vụ và hạn mức',
    blocks: [
      { type: 'p', text: 'Mỗi gói có hạn mức người dùng, số bộ và số file đọc bằng AI mỗi tháng, dung lượng lưu trữ. Mức dùng xem ở trang Gói & thanh toán. Hết hạn mức thì thao tác đó bị chặn kèm thông báo; file XML vẫn tải được khi hết lượt AI.' },
      { type: 'list', items: [
        'Thanh toán bằng chuyển khoản: quét mã QR, giữ đúng nội dung chuyển khoản, gói tự kích hoạt khi tiền về.',
        'Xóa bộ không trả lại lượt đã dùng trong tháng.',
        'Hết hạn gói thì công ty về gói Free, dữ liệu giữ nguyên.',
      ] },
    ],
  },
  {
    id: 'bao-mat',
    title: 'Tài khoản và bảo mật',
    blocks: [
      { type: 'list', items: [
        'Kế toán trưởng bắt buộc dùng xác thực hai lớp (Google Authenticator hoặc Microsoft Authenticator). Cất kỹ 10 mã khôi phục.',
        'Mất điện thoại: dùng một mã khôi phục, hoặc nhờ kế toán trưởng khác đặt lại 2FA.',
        'Mật khẩu tối thiểu 10 ký tự, có chữ và số, không dùng lại 3 mật khẩu gần nhất.',
        'Kế toán trưởng có thể tắt đọc bằng AI, tải toàn bộ dữ liệu hoặc yêu cầu xóa công ty ở trang Dữ liệu & quyền riêng tư.',
      ] },
    ],
  },
  {
    id: 'cau-hoi',
    title: 'Câu hỏi thường gặp',
    blocks: [
      { type: 'faq', items: [
        ['Hệ thống có tự sửa số liệu không?', 'Không. Số liệu trên chứng từ được giữ nguyên. Khi AI đọc thành tiền khác số lượng × đơn giá quá 1.000 đ, hệ thống ghi nhận và dùng số lượng × đơn giá cho dòng đó, còn tổng tiền vẫn đọc riêng để chỗ lệch thật vẫn hiện ra.'],
        ['Hóa đơn XML có bị gửi ra ngoài không?', 'Không. XML luôn được đọc trên máy chủ. Chỉ PDF và ảnh mới được gửi tới dịch vụ AI, và kế toán trưởng có thể tắt việc này.'],
        ['AI đọc sai thì sao?', 'Kết quả đọc PDF/ảnh có độ tin cậy và cờ "chất lượng thấp". Hãy so với chứng từ gốc (mở xem ngay trong bộ) trước khi duyệt; nếu có bản XML thì tải XML thay thế.'],
        ['Bộ đã duyệt cuối bị nhầm thì làm thế nào?', 'Bộ đã duyệt cuối không sửa được để giữ tính toàn vẹn hồ sơ. Tạo bộ mới cho giao dịch điều chỉnh và ghi chú liên hệ đến bộ cũ.'],
      ] },
    ],
  },
];
