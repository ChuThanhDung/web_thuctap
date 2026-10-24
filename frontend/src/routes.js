// Nguồn duy nhất cho đường dẫn trang. Đổi đường dẫn ở đây; mọi nơi khác (App, menu, nút điều hướng) đều đọc từ đây.
// Đây là đường dẫn phía giao diện (React Router), không phải endpoint API (xem api.js).

export const ROUTES = {
  login: '/login',
  overview: '/accountant',
  upload: '/upload',
  batches: '/audit-trail',
  users: '/users',
  settings: '/settings',
  styleguide: '/styleguide',
};

/** Mở bộ đối soát cụ thể trong danh sách bộ. */
export const batchDetail = (id) => `${ROUTES.batches}?batchId=${id}`;

/** Danh sách bộ đã lọc theo trạng thái (ví dụ 'unapproved', 'rejected'). */
export const batchesWithStatus = (status) => `${ROUTES.batches}?status=${status}`;
