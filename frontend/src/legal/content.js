// Nội dung Điều khoản sử dụng, Chính sách bảo vệ dữ liệu cá nhân và Thỏa thuận xử lý dữ liệu.
// Sửa nội dung thì đổi TERMS_VERSION ở src/services/privacy.py để người dùng được hỏi đồng ý lại.
// {operator}, {email}, {server}, {ai} được thay bằng thông tin từ GET /api/v1/legal.
// Bản soạn dựa trên quy định hiện hành; cần người có chuyên môn pháp lý rà soát trước khi thu phí.

const LAWS =
  'Luật Bảo vệ dữ liệu cá nhân năm 2025 và văn bản hướng dẫn (trước đó là Nghị định 13/2023/NĐ-CP), Luật Giao dịch điện tử, Luật Kế toán';

export const LEGAL_DOCUMENTS = {
  terms: {
    title: 'Điều khoản sử dụng',
    intro:
      'Điều khoản này áp dụng giữa {operator} (nhà cung cấp) và doanh nghiệp đăng ký sử dụng DocuSync AI (khách hàng), cùng những người dùng do khách hàng tạo hoặc mời.',
    sections: [
      {
        heading: '1. Dịch vụ',
        items: [
          'DocuSync AI đối chiếu đơn đặt hàng, phiếu nhập kho và hóa đơn; chỉ ra chỗ lệch để kế toán viên và kế toán trưởng duyệt.',
          'Kết quả đối soát là công cụ hỗ trợ. Quyết định duyệt, ghi sổ và nghĩa vụ kế toán, thuế thuộc về khách hàng.',
          'Chứng từ PDF/ảnh được đọc bằng dịch vụ AI nên có thể sai; người dùng kiểm tra lại trước khi duyệt. Chứng từ XML được đọc trực tiếp trên máy chủ.',
        ],
      },
      {
        heading: '2. Tài khoản',
        items: [
          'Người đăng ký cam kết có quyền đại diện doanh nghiệp và thông tin đăng ký là đúng.',
          'Khách hàng chịu trách nhiệm về người dùng mình tạo hoặc mời, về việc giữ bí mật mật khẩu và thiết bị xác thực hai lớp.',
          'Báo ngay cho nhà cung cấp qua {email} khi nghi ngờ tài khoản bị truy cập trái phép.',
        ],
      },
      {
        heading: '3. Gói dịch vụ và thanh toán',
        items: [
          'Giá và hạn mức từng gói công bố tại trang Gói & thanh toán. Gói trả trước theo tháng hoặc 12 tháng, không tự gia hạn.',
          'Hết hạn gói, công ty chuyển về gói Free; dữ liệu giữ nguyên nhưng thao tác vượt hạn mức gói Free bị chặn.',
          'Tiền đã thanh toán không hoàn lại, trừ khi dịch vụ ngừng hoạt động do lỗi của nhà cung cấp.',
        ],
      },
      {
        heading: '4. Sử dụng được phép',
        items: [
          'Không tải lên nội dung vi phạm pháp luật, mã độc, hoặc chứng từ mà khách hàng không có quyền xử lý.',
          'Không dò quét, tấn công, vượt qua giới hạn kỹ thuật hoặc truy cập dữ liệu của khách hàng khác.',
          'Nhà cung cấp được tạm khóa công ty vi phạm sau khi thông báo, hoặc ngay lập tức nếu gây nguy hại cho hệ thống.',
        ],
      },
      {
        heading: '5. Dữ liệu của khách hàng',
        items: [
          'Chứng từ và dữ liệu khách hàng tải lên thuộc về khách hàng. Nhà cung cấp chỉ xử lý để cung cấp dịch vụ, theo Thỏa thuận xử lý dữ liệu.',
          'Khách hàng tải toàn bộ dữ liệu bất cứ lúc nào và có thể yêu cầu xóa công ty (xóa sau 30 ngày).',
          'Khách hàng tự lưu giữ chứng từ kế toán đủ thời hạn theo Luật Kế toán (chứng từ dùng ghi sổ: tối thiểu 10 năm), kể cả khi ngừng dùng dịch vụ.',
        ],
      },
      {
        heading: '6. Cam kết và giới hạn trách nhiệm',
        items: [
          'Nhà cung cấp nỗ lực duy trì dịch vụ ổn định, sao lưu dữ liệu hằng ngày, nhưng không cam kết dịch vụ không bao giờ gián đoạn.',
          'Trách nhiệm bồi thường của nhà cung cấp, nếu có, không vượt quá số tiền khách hàng đã trả trong 3 tháng gần nhất.',
          'Nhà cung cấp không chịu trách nhiệm về quyết định kế toán, thuế dựa trên kết quả đối soát mà người dùng đã duyệt.',
        ],
      },
      {
        heading: '7. Thay đổi và chấm dứt',
        items: [
          'Khi sửa điều khoản, người dùng được hỏi đồng ý lại ở lần đăng nhập sau. Không đồng ý thì có thể xuất dữ liệu và yêu cầu xóa.',
          'Tranh chấp được thương lượng; không thành thì giải quyết tại tòa án có thẩm quyền tại Việt Nam theo pháp luật Việt Nam.',
        ],
      },
    ],
  },

  privacy: {
    title: 'Chính sách bảo vệ dữ liệu cá nhân',
    intro: `Chính sách này giải thích dữ liệu cá nhân nào được xử lý khi dùng DocuSync AI, vì sao, ở đâu và quyền của bạn, theo ${LAWS}.`,
    sections: [
      {
        heading: '1. Vai trò',
        items: [
          'Với dữ liệu trong chứng từ (tên, mã số thuế, địa chỉ của đối tác...), doanh nghiệp khách hàng là bên kiểm soát dữ liệu; {operator} là bên xử lý dữ liệu theo chỉ dẫn của khách hàng.',
          'Với dữ liệu tài khoản người dùng (họ tên, email, số điện thoại, CCCD, nhật ký đăng nhập), {operator} và khách hàng cùng kiểm soát để quản lý tài khoản và bảo mật.',
        ],
      },
      {
        heading: '2. Dữ liệu được xử lý',
        items: [
          'Tài khoản: họ tên, email, số điện thoại, ngày sinh, địa chỉ, số CCCD (do kế toán trưởng nhập), ảnh đại diện, mật khẩu (chỉ lưu dạng băm), khóa xác thực hai lớp.',
          'Chứng từ: file PDF, ảnh, XML và dữ liệu đọc được từ đó (tên hàng, số lượng, đơn giá, thông tin bên bán, bên mua).',
          'Kỹ thuật: địa chỉ IP, trình duyệt, thời điểm đăng nhập và thao tác (nhật ký), dùng để bảo mật và điều tra sự cố.',
          'Thanh toán: số tiền, nội dung chuyển khoản, mã giao dịch ngân hàng. Không lưu số thẻ hay thông tin đăng nhập ngân hàng.',
        ],
      },
      {
        heading: '3. Mục đích',
        items: [
          'Cung cấp dịch vụ đối soát, duyệt hai cấp và lưu trữ hồ sơ.',
          'Xác thực người dùng, chống truy cập trái phép, ghi nhật ký theo yêu cầu bảo mật.',
          'Gửi email cần thiết: mã xác thực, lời mời, thông báo bộ bị từ chối, thanh toán, nhắc gia hạn.',
          'Không dùng dữ liệu chứng từ để quảng cáo, không bán dữ liệu, không dùng để huấn luyện mô hình AI.',
        ],
      },
      {
        heading: '4. Nơi lưu trữ và chuyển dữ liệu ra nước ngoài',
        items: [
          'Máy chủ và cơ sở dữ liệu đặt tại {server}. Bản sao lưu lưu trên Google Cloud Storage.',
          'Chứng từ PDF/ảnh được gửi tới dịch vụ AI để đọc: {ai}. Nhà cung cấp AI xử lý theo hợp đồng API của họ và không dùng dữ liệu gửi qua API để huấn luyện mô hình.',
          'Kế toán trưởng có thể tắt đọc bằng AI ở trang Dữ liệu & quyền riêng tư; khi tắt, công ty chỉ tải được XML và không file nào được gửi ra nước ngoài để đọc.',
          'Email gửi qua Gmail (Google). {operator} thực hiện thủ tục đánh giá tác động chuyển dữ liệu cá nhân ra nước ngoài theo quy định.',
        ],
      },
      {
        heading: '5. Bảo vệ dữ liệu',
        items: [
          'Kết nối HTTPS; mỗi công ty được cách ly ở tầng cơ sở dữ liệu (Row-Level Security).',
          'Số CCCD, địa chỉ và khóa xác thực hai lớp được mã hóa khi lưu; giao diện chỉ hiện CCCD đã che, xem đủ số phải là kế toán trưởng và được ghi nhật ký.',
          'Xác thực hai lớp bắt buộc với kế toán trưởng; mật khẩu tối thiểu 10 ký tự.',
          'Khi có sự cố lộ lọt dữ liệu, {operator} thông báo cho khách hàng và cơ quan có thẩm quyền trong thời hạn luật định.',
        ],
      },
      {
        heading: '6. Thời gian lưu',
        items: [
          'Dữ liệu được lưu trong thời gian công ty dùng dịch vụ, theo thời hạn lưu trữ của gói.',
          'Khi công ty yêu cầu xóa, dữ liệu bị xóa vĩnh viễn sau 30 ngày (có thể hủy trong thời gian này). Bản sao lưu cũ tự hết hạn sau tối đa 5 tuần.',
          'Đơn thanh toán được giữ theo quy định về chứng từ kế toán của nhà cung cấp.',
        ],
      },
      {
        heading: '7. Quyền của bạn',
        items: [
          'Được biết, xem, sửa thông tin của mình (trang Hồ sơ cá nhân); kế toán trưởng xem và sửa thông tin người dùng của công ty.',
          'Được tải về dữ liệu (kế toán trưởng: trang Dữ liệu & quyền riêng tư), yêu cầu xóa, rút lại sự đồng ý, phản đối hoặc hạn chế xử lý.',
          'Rút lại đồng ý có thể khiến dịch vụ không tiếp tục được; việc xử lý trước khi rút vẫn hợp pháp.',
          'Gửi yêu cầu hoặc khiếu nại tới {email}. Phản hồi trong 72 giờ làm việc.',
        ],
      },
    ],
  },

  dpa: {
    title: 'Thỏa thuận xử lý dữ liệu',
    intro:
      'Thỏa thuận này là một phần của Điều khoản sử dụng, áp dụng khi {operator} xử lý dữ liệu cá nhân trong chứng từ thay mặt doanh nghiệp khách hàng.',
    sections: [
      {
        heading: '1. Phạm vi',
        items: [
          'Đối tượng: dữ liệu cá nhân xuất hiện trong chứng từ khách hàng tải lên (người đại diện, nhân viên, đối tác).',
          'Hoạt động xử lý: lưu trữ, đọc nội dung (trên máy chủ hoặc bằng dịch vụ AI), đối chiếu, hiển thị, sao lưu, xóa.',
          'Thời hạn: trong thời gian khách hàng dùng dịch vụ và 30 ngày sau khi yêu cầu xóa.',
        ],
      },
      {
        heading: '2. Nghĩa vụ của bên xử lý ({operator})',
        items: [
          'Chỉ xử lý theo chỉ dẫn của khách hàng thể hiện qua thao tác trên phần mềm và thỏa thuận này.',
          'Bảo đảm người có quyền truy cập dữ liệu có nghĩa vụ bảo mật; quản trị nền tảng không xem chứng từ của khách hàng.',
          'Áp dụng biện pháp bảo vệ nêu trong Chính sách bảo vệ dữ liệu cá nhân; thông báo cho khách hàng khi có sự cố trong 72 giờ kể từ khi phát hiện.',
          'Hỗ trợ khách hàng đáp ứng yêu cầu của chủ thể dữ liệu (xuất, sửa, xóa).',
          'Xóa dữ liệu khi kết thúc dịch vụ theo yêu cầu, trừ dữ liệu pháp luật buộc nhà cung cấp lưu.',
        ],
      },
      {
        heading: '3. Bên xử lý phụ',
        items: [
          'Google Cloud (máy chủ, sao lưu), {ai} (đọc PDF/ảnh), Google Gmail (gửi email), SePay (nhận thông báo chuyển khoản).',
          'Thay đổi bên xử lý phụ được cập nhật ở trang này và người dùng được hỏi đồng ý lại.',
        ],
      },
      {
        heading: '4. Nghĩa vụ của khách hàng',
        items: [
          'Có cơ sở pháp lý để xử lý dữ liệu cá nhân trong chứng từ và để giao cho bên xử lý.',
          'Tắt đọc bằng AI nếu không muốn chứng từ được gửi ra nước ngoài.',
          'Tự lưu chứng từ kế toán đủ thời hạn luật định trước khi yêu cầu xóa.',
        ],
      },
    ],
  },
};

export function fillLegalText(value, info) {
  return value
    .replaceAll('{operator}', info?.operator_name || 'DocuSync AI')
    .replaceAll('{email}', info?.contact_email || 'email hỗ trợ')
    .replaceAll('{server}', info?.server_location || 'Google Cloud')
    .replaceAll('{ai}', (info?.ai_providers || ['OpenAI (Hoa Kỳ)']).join(', '));
}
