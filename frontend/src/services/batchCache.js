import { getDocumentBatches } from '../api.js';
import { repairTextDeep } from '../text.js';

let cachedData = null;
let lastFetchedAt = 0;
let inflightPromise = null;
const subscribers = new Set();

/**
 * Lấy dữ liệu cache hiện tại trong memory (nếu có).
 */
export function getCachedBatches() {
  return cachedData;
}

/**
 * Kiểm tra xem cache hiện tại có còn mới (fresh) không.
 * @param {number} maxAgeMs - Thời gian hiệu lực (mặc định 60s)
 */
export function isCacheFresh(maxAgeMs = 60000) {
  return Boolean(cachedData && Date.now() - lastFetchedAt < maxAgeMs);
}

/**
 * Đăng ký lắng nghe sự thay đổi của cache dữ liệu.
 */
export function subscribeBatchCache(listener) {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

function notifySubscribers(data) {
  subscribers.forEach((listener) => {
    try {
      listener(data);
    } catch (err) {
      console.error('Error in batchCache listener:', err);
    }
  });
}

/**
 * Fetch danh sách batch có kèm cache in-memory và chống trùng lặp request (deduplication).
 */
export async function fetchDocumentBatchesWithCache(token, options = {}) {
  const { forceRefresh = false, maxAgeMs = 60000 } = options;
  const now = Date.now();

  // Trả về ngay nếu có cache và còn fresh
  if (!forceRefresh && cachedData && now - lastFetchedAt < maxAgeMs) {
    return cachedData;
  }

  // Nếu đang có 1 request đang chạy dở, dùng lại promise đó để tránh gửi request trùng
  if (inflightPromise) {
    return inflightPromise;
  }

  inflightPromise = (async () => {
    try {
      const response = await getDocumentBatches(token);
      const repaired = repairTextDeep(response);
      cachedData = repaired;
      lastFetchedAt = Date.now();
      notifySubscribers(cachedData);
      return cachedData;
    } finally {
      inflightPromise = null;
    }
  })();

  return inflightPromise;
}

/**
 * Xóa cache hoặc ép buộc làm mới dữ liệu ở lần gọi tới.
 */
export function invalidateBatchCache() {
  cachedData = null;
  lastFetchedAt = 0;
}

/**
 * Cập nhật trực tiếp 1 batch trong cache (ví dụ sau khi tạo mới, upload file, duyệt, từ chối, hoặc đổi trạng thái)
 */
export function updateCachedBatchItem(updatedBatch) {
  if (!updatedBatch?.id) return;

  const repairedBatch = repairTextDeep(updatedBatch);

  if (!cachedData || !Array.isArray(cachedData.items)) {
    cachedData = {
      items: [repairedBatch],
      total: 1,
    };
    lastFetchedAt = Date.now();
    notifySubscribers(cachedData);
    return;
  }

  const exists = cachedData.items.some((item) => String(item.id) === String(repairedBatch.id));
  const nextItems = exists
    ? cachedData.items.map((item) =>
        String(item.id) === String(repairedBatch.id) ? { ...item, ...repairedBatch } : item
      )
    : [repairedBatch, ...cachedData.items];

  cachedData = {
    ...cachedData,
    items: nextItems,
    total: nextItems.length,
  };
  lastFetchedAt = Date.now();
  notifySubscribers(cachedData);
}

/**
 * Xóa 1 batch khỏi cache khi bị xóa.
 */
export function removeCachedBatchItem(batchId) {
  if (!cachedData || !Array.isArray(cachedData.items) || !batchId) {
    return;
  }

  const nextItems = cachedData.items.filter((item) => String(item.id) !== String(batchId));
  cachedData = {
    ...cachedData,
    items: nextItems,
    total: nextItems.length,
  };
  lastFetchedAt = Date.now();
  notifySubscribers(cachedData);
}
