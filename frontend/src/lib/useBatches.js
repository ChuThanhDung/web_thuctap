import { useCallback, useEffect, useState } from 'react';
import { fetchDocumentBatchesWithCache, getCachedBatches, subscribeBatchCache } from '../services/batchCache.js';
import { vi } from '../i18n/vi.js';

/**
 * Danh sách bộ đối soát dùng chung cho các trang (có cache trong bộ nhớ và tự cập nhật khi cache đổi).
 * Có cache thì hiện ngay, không nháy trạng thái tải; lỗi chỉ báo khi chưa có gì để hiển thị.
 */
export default function useBatches(token) {
  const cached = getCachedBatches();
  const [batches, setBatches] = useState(() => cached?.items || []);
  const [loading, setLoading] = useState(() => !cached);
  const [error, setError] = useState('');

  useEffect(() => subscribeBatchCache((data) => data?.items && setBatches(data.items)), []);

  const load = useCallback(
    async (forceRefresh = false) => {
      try {
        if (!getCachedBatches()) setLoading(true);
        setError('');
        const data = await fetchDocumentBatchesWithCache(token, { forceRefresh });
        setBatches(data.items || []);
      } catch (err) {
        if (!getCachedBatches()) setError(err.message || vi.overview.loadFailed);
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    load();
  }, [load]);

  return { batches, loading, error, reload: () => load(true) };
}
