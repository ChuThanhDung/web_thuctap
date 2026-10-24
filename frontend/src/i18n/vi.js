// Toàn bộ chuỗi giao diện dùng chung nằm ở đây để thống nhất thuật ngữ và dễ sửa một chỗ.
// Quy ước thuật ngữ: một "bộ đối soát" gồm Đơn đặt hàng (PO) + Hóa đơn + Phiếu nhập kho (GRN).
// Mã bộ (BATCH_dd_MM_yyyy_NN) là dữ liệu, giữ nguyên.

export const vi = {
  brand: {
    name: 'DocuSync AI',
    tagline: 'Đối soát chứng từ',
    documentTitle: 'DocuSync AI - Đối soát chứng từ',
  },

  roles: {
    accountant: 'Kế toán viên',
    chief_accountant: 'Kế toán trưởng',
  },

  userStatus: {
    ACTIVE: 'Đang hoạt động',
    DEACTIVE: 'Ngưng hoạt động',
  },

  docTypes: {
    po: { short: 'PO', label: 'Đơn đặt hàng' },
    invoice: { short: 'Hóa đơn', label: 'Hóa đơn' },
    grn: { short: 'GRN', label: 'Phiếu nhập kho' },
  },

  batch: {
    singular: 'bộ đối soát',
    plural: 'Bộ đối soát',
  },

  // Trạng thái đối soát do AI/hệ thống xác định.
  reconciliation: {
    processing: { label: 'Đang xử lý', hint: 'Chứng từ đang được đọc và trích xuất dữ liệu.' },
    missing_docs: { label: 'Thiếu chứng từ', hint: 'Cần tải thêm chứng từ để đối soát.' },
    matched: { label: 'Khớp', hint: 'PO, Hóa đơn và GRN khớp nhau.' },
    mismatch: { label: 'Có chênh lệch', hint: 'Phát hiện sai khác giữa các chứng từ.' },
  },

  // Trạng thái duyệt do con người quyết định (quy trình hai cấp).
  approval: {
    pending_accountant: { label: 'Chờ kế toán viên duyệt', hint: 'Kế toán viên cần duyệt bộ đã khớp.' },
    pending_chief: { label: 'Chờ kế toán trưởng duyệt', hint: 'Kế toán viên đã duyệt, đang chờ duyệt cuối.' },
    approved: { label: 'Đã duyệt', hint: 'Đã được kế toán trưởng duyệt cuối.' },
    rejected: { label: 'Từ chối', hint: 'Kế toán trưởng đã từ chối, cần bổ sung.' },
  },

  // Nhãn mục điều hướng. Đường dẫn nằm ở src/routes.js, cách ghép ở src/lib/nav.js.
  nav: {
    overview: 'Tổng quan',
    upload: 'Tải chứng từ',
    batches: 'Bộ đối soát',
    users: 'Quản lý tài khoản',
    settings: 'Ngưỡng sai số',
  },

  shell: {
    skipToContent: 'Bỏ qua, tới nội dung chính',
    mainNavigation: 'Điều hướng chính',
    openMenu: 'Mở menu điều hướng',
    closeMenu: 'Đóng menu điều hướng',
    collapseSidebar: 'Thu gọn',
    expandSidebar: 'Mở rộng',
    profile: 'Thông tin cá nhân',
    logout: 'Đăng xuất',
    theme: 'Giao diện',
    themeLight: 'Giao diện sáng',
    themeDark: 'Giao diện tối',
    switchToLight: 'Chuyển sang giao diện sáng',
    switchToDark: 'Chuyển sang giao diện tối',
    sessionExpired: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  },

  notifications: {
    title: 'Thông báo',
    unreadCount: (count) => `${count} thông báo chưa đọc`,
    ariaLabel: (count) => (count > 0 ? `Thông báo, ${count} chưa đọc` : 'Thông báo'),
    unread: 'Chưa đọc',
    markAllRead: 'Đánh dấu tất cả đã đọc',
    empty: 'Chưa có thông báo',
    loading: 'Đang tải thông báo…',
    loadFailed: 'Không thể tải thông báo.',
    updateFailed: 'Không thể cập nhật thông báo.',
  },

  overview: {
    title: 'Tổng quan',
    chiefDescription: 'Theo dõi tiến độ duyệt và các bộ cần chú ý.',
    period: 'Khoảng thời gian',
    ranges: {
      all: 'Tất cả thời gian',
      today: 'Hôm nay',
      last_7_days: '7 ngày gần nhất',
      last_30_days: '30 ngày gần nhất',
      this_month: 'Tháng này',
      custom: 'Tùy chọn khoảng ngày',
    },
    from: 'Từ ngày',
    to: 'Đến ngày',
    loadFailed: 'Không thể tải dữ liệu tổng quan.',
    retry: 'Thử lại',
    kpi: {
      pending: 'Chờ bạn duyệt',
      pendingHint: 'Kế toán viên đã duyệt, đang chờ quyết định cuối của bạn.',
      approved: 'Đã duyệt',
      approvedHint: 'Đã được duyệt cuối cùng.',
      rejected: 'Từ chối',
      rejectedHint: 'Đã bị từ chối, kế toán viên cần bổ sung.',
      matchRate: 'Tỷ lệ khớp',
      matchRateHint: (judged) => `Trên ${judged} bộ đã có kết quả đối soát.`,
      matchRateEmpty: 'Chưa có bộ nào đối soát xong.',
    },
    queue: {
      title: 'Cần xử lý ngay',
      description: 'Bộ chờ bạn duyệt, chờ lâu nhất lên trước.',
      empty: 'Không có bộ nào đang chờ bạn duyệt.',
      emptyHint: 'Khi kế toán viên duyệt xong một bộ, nó sẽ hiện ở đây.',
      view: 'Xem',
      viewLabel: (batchNumber) => `Xem ${batchNumber}`,
      viewAll: (total) => `Xem tất cả (${total})`,
      waiting: (text) => `Chờ ${text}`,
      overdue: (text) => `Quá hạn, chờ ${text}`,
      by: (name) => `Kế toán viên: ${name}`,
    },
    attention: {
      title: 'Cần chú ý',
      description: 'Những điểm nên xem trước khi duyệt.',
      largestDiff: 'Chênh lệch lớn nhất',
      overdue: (days) => `Chờ quá ${days} ngày`,
      overdueCount: (count) => `${count} bộ`,
      rejected: 'Từ chối, chưa bổ sung',
      rejectedCount: (count) => `${count} bộ`,
      none: 'Không có gì cần chú ý.',
    },
    timeline: {
      title: 'Bộ đối soát theo ngày',
      description: (days) => `${days} ngày gần nhất.`,
      matched: 'Khớp',
      mismatch: 'Có chênh lệch',
      rejected: 'Từ chối',
      ariaLabel: 'Biểu đồ cột số bộ đối soát theo ngày',
      tableCaption: 'Số bộ đối soát theo ngày',
      date: 'Ngày',
      empty: 'Chưa có bộ nào trong khoảng thời gian này.',
    },
    result: {
      title: 'Kết quả đối soát',
      description: 'Theo đánh giá của hệ thống.',
      matchedShort: 'khớp',
      ariaLabel: 'Biểu đồ tròn kết quả đối soát',
      empty: 'Chưa có dữ liệu.',
    },
    activity: {
      title: 'Hoạt động gần đây',
      description: 'Thời điểm tính theo lần cập nhật gần nhất của bộ.',
      empty: 'Chưa có hoạt động nào.',
      created: (name, batch) => `${name} đã tạo ${batch}`,
      approved: (name, batch) => `${name} đã duyệt ${batch}, chờ kế toán trưởng`,
      final_approved: (name, batch) => `${name} đã duyệt cuối ${batch}`,
      rejected: (name, batch) => (name ? `${name} đã từ chối ${batch}` : `${batch} bị từ chối`),
    },
    accountants: {
      title: 'Theo kế toán viên',
      description: 'Số bộ đã tạo và tỷ lệ khớp.',
      empty: 'Chưa có dữ liệu.',
      sets: (count) => `${count} bộ`,
      rate: (percent) => (percent === null ? 'Chưa có kết quả' : `${percent}% khớp`),
    },
    empty: {
      title: 'Chưa có bộ đối soát nào',
      description: 'Khi kế toán viên tải chứng từ lên, số liệu sẽ hiện ở đây.',
    },
  },

  actions: {
    save: 'Lưu',
    cancel: 'Hủy',
    close: 'Đóng',
    confirm: 'Xác nhận',
    delete: 'Xóa',
    edit: 'Chỉnh sửa',
    approve: 'Duyệt',
    reject: 'Từ chối',
    search: 'Tìm kiếm',
    moreActions: 'Thao tác khác',
  },

  common: {
    loading: 'Đang tải…',
    notifications: 'Thông báo',
    noData: 'Chưa có dữ liệu',
    system: 'Hệ thống',
    selectPlaceholder: 'Chọn…',
    dismissNotification: 'Đóng thông báo',
  },
};
