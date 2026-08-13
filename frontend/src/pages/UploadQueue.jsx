import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
  ExternalLink,
  ShoppingCart,
  PackageCheck,
  X,
} from 'lucide-react';
import {
  createDocumentBatch,
  deleteDocumentBatch,
  deleteUploadedFile,
  fetchUploadFileBlob,
  getDocumentBatches,
  uploadDocument,
} from '../api.js';

const DOC_TYPES = [
  { value: 'po', label: 'Đơn đặt hàng (PO)', desc: 'Lưu thông tin thô đơn đặt hàng làm cơ sở đối chiếu', icon: ShoppingCart },
  { value: 'invoice', label: 'Hóa đơn (Invoice)', desc: 'Kích hoạt đối soát 3 bên chéo trực tiếp từ DB', icon: FileText },
  { value: 'grn', label: 'Phiếu nhập kho (GRN)', desc: 'Lưu thông tin thực nhận làm cơ sở đối chiếu', icon: PackageCheck },
];
const BATCHES_PER_PAGE = 5;

function isBatchReady(batch) {
  if (Array.isArray(batch?.missing_doc_types)) return batch.missing_doc_types.length === 0;
  if (batch?.status === 'ready') return true;

  const uploadedTypes = new Set((batch?.files || []).map((file) => file.doc_type).filter(Boolean));
  return DOC_TYPES.every((type) => uploadedTypes.has(type.value));
}

function getFileExt(filename = '') {
  return filename.split('.').pop()?.toLowerCase() || '';
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildXmlPreviewHtml(filename, xmlText) {
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(filename)}</title>
  <style>
    body {
      margin: 0;
      background: #f6f9fc;
      color: #0d253d;
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      position: sticky;
      top: 0;
      border-bottom: 1px solid #e3e8ee;
      background: rgba(255, 255, 255, 0.94);
      padding: 14px 20px;
      backdrop-filter: blur(12px);
    }
    h1 {
      margin: 0;
      overflow-wrap: anywhere;
      font-size: 15px;
      font-weight: 700;
    }
    main {
      padding: 20px;
    }
    pre {
      margin: 0;
      overflow: auto;
      border: 1px solid #e3e8ee;
      border-radius: 8px;
      background: #ffffff;
      padding: 18px;
      font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <header><h1>${escapeHtml(filename)}</h1></header>
  <main><pre>${escapeHtml(xmlText)}</pre></main>
</body>
</html>`;
}

export default function UploadQueue({ token }) {
  const navigate = useNavigate();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeDropType, setActiveDropType] = useState(null);
  const [selectedDocType, setSelectedDocType] = useState('po');
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [batchPage, setBatchPage] = useState(1);
  const [deletingBatchIds, setDeletingBatchIds] = useState([]);
  const [readyBatchNotice, setReadyBatchNotice] = useState(null);
  const documentTypesRef = useRef(null);
  const fileInputRef = useRef(null);
  const filePickerDocTypeRef = useRef('po');

  const pendingBatches = batches.filter((batch) => !isBatchReady(batch));
  const totalBatchPages = Math.max(1, Math.ceil(pendingBatches.length / BATCHES_PER_PAGE));
  const safeBatchPage = Math.min(batchPage, totalBatchPages);
  const paginatedBatches = pendingBatches.slice(
    (safeBatchPage - 1) * BATCHES_PER_PAGE,
    safeBatchPage * BATCHES_PER_PAGE
  );
  const batchStartIndex = pendingBatches.length === 0 ? 0 : (safeBatchPage - 1) * BATCHES_PER_PAGE + 1;
  const batchEndIndex = Math.min(safeBatchPage * BATCHES_PER_PAGE, pendingBatches.length);
  const selectedBatch = pendingBatches.find((batch) => batch.id === selectedBatchId) || pendingBatches[0] || null;
  const selectedBatchFiles = selectedBatch?.files || [];
  const uploadedFilesByType = selectedBatchFiles.reduce((acc, file) => {
    if (!file.doc_type) return acc;
    acc[file.doc_type] = [...(acc[file.doc_type] || []), file];
    return acc;
  }, {});
  const hasSelectedBatchFiles = selectedBatchFiles.length > 0;

  // Hàm load danh sách bộ đối soát thực tế từ BE
  const fetchBatches = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      const data = await getDocumentBatches(token);
      const items = data.items || [];
      setBatches(items);
      setSelectedBatchId((currentId) => {
        const pendingItems = items.filter((batch) => !isBatchReady(batch));
        if (currentId && pendingItems.some((batch) => batch.id === currentId)) return currentId;
        return pendingItems[0]?.id || null;
      });
    } catch (err) {
      console.error('Không thể lấy danh sách bộ đối soát:', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [token]);

  // Load danh sách lần đầu khi render
  useEffect(() => {
    fetchBatches(true);
  }, [fetchBatches]);

  useEffect(() => {
    if (batchPage > totalBatchPages) {
      setBatchPage(totalBatchPages);
    }
  }, [batchPage, totalBatchPages]);

  // Thiết lập cơ chế tự động làm mới danh sách nếu có file đang xử lý
  useEffect(() => {
    const hasActiveFiles = batches.some((batch) =>
      (batch.files || []).some((f) => f.status === 'processing' || f.status === 'queued')
    );
    
    if (!hasActiveFiles) return;

    const timer = setInterval(() => {
      fetchBatches(false);
    }, 3000);

    return () => clearInterval(timer);
  }, [batches, fetchBatches]);

  const resetDragState = () => {
    setActiveDropType(null);
  };

  const handleTypeDragEnter = (e, docType) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedDocType(docType);
    setActiveDropType(docType);
  };

  const handleTypeDragOver = (e, docType) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    setActiveDropType(docType);
  };

  const handleTypeDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget)) resetDragState();
  };

  const handleChooseFiles = (docType) => {
    filePickerDocTypeRef.current = docType;
    setSelectedDocType(docType);
    fileInputRef.current?.click();
  };

  const handleCreateBatch = async () => {
    const batch = await createDocumentBatch(token);
    setBatches((prev) => [batch, ...prev.filter((item) => item.id !== batch.id)]);
    setSelectedBatchId(batch.id);
    setBatchPage(1);
    documentTypesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return batch;
  };

  const handleSelectBatch = (batchId) => {
    setSelectedBatchId(batchId);
    documentTypesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const ensureSelectedBatch = async () => {
    if (selectedBatch) return selectedBatch;
    return handleCreateBatch();
  };

  const upsertUploadedFileIntoBatch = (uploadedFile) => {
    setBatches((prev) =>
      prev.map((batch) => {
        if (batch.id !== uploadedFile.batch_id) return batch;
        const wasReady = isBatchReady(batch);

        const nextFiles = [
          uploadedFile,
          ...(batch.files || []).filter((file) => file.id !== uploadedFile.id),
        ];
        const uploadedDocTypes = Array.from(new Set(nextFiles.map((file) => file.doc_type).filter(Boolean)));
        const missingDocTypes = DOC_TYPES
          .map((type) => type.value)
          .filter((docType) => !uploadedDocTypes.includes(docType));
        const isReady = missingDocTypes.length === 0;

        if (!wasReady && isReady) {
          setReadyBatchNotice({
            id: batch.id,
            batchNumber: batch.batch_number,
          });
        }

        return {
          ...batch,
          files: nextFiles,
          uploaded_doc_types: uploadedDocTypes,
          missing_doc_types: missingDocTypes,
          status: isReady ? 'ready' : 'incomplete',
        };
      })
    );
  };

  // Upload file lên BE
  const uploadFiles = async (fileList, docType = selectedDocType, batchId = selectedBatchId) => {
    const filesArray = Array.from(fileList);
    if (filesArray.length === 0) return;

    const targetBatch = batchId
      ? batches.find((batch) => batch.id === batchId) || selectedBatch
      : await ensureSelectedBatch();
    const targetBatchId = targetBatch?.id;
    if (!targetBatchId) return;
    setSelectedBatchId(targetBatchId);
    
    // Thêm các file mới vào UI ngay lập tức với trạng thái 'queued' để tối ưu trải nghiệm
    const tempFiles = filesArray.map((f, i) => ({
      id: `temp-${Date.now()}-${i}`,
      batch_id: targetBatchId,
      doc_type: docType,
      filename: f.name,
      size: `${(f.size / 1024 / 1024).toFixed(1)} MB`,
      status: 'queued',
      progress: 0,
      created_at: new Date().toISOString(),
    }));
    
    setBatches((prev) =>
      prev.map((batch) =>
        batch.id === targetBatchId
          ? { ...batch, files: [...tempFiles, ...(batch.files || [])] }
          : batch
      )
    );

    // Tiến hành upload từng file lên BE
    for (let i = 0; i < filesArray.length; i++) {
      const fileObj = filesArray[i];
      try {
        // Cập nhật trạng thái file local thành 'processing'
        setBatches((prev) =>
          prev.map((batch) =>
            batch.id === targetBatchId
              ? {
                  ...batch,
                  files: (batch.files || []).map((f) =>
                    f.id === tempFiles[i].id ? { ...f, status: 'processing', progress: 30 } : f
                  ),
                }
              : batch
          )
        );

        // Gọi API thật, truyền kèm loại tài liệu đã chọn
        const uploadedFile = await uploadDocument(token, fileObj, docType, targetBatchId);
        setBatches((prev) =>
          prev.map((batch) =>
            batch.id === targetBatchId
              ? {
                  ...batch,
                  files: (batch.files || []).filter((f) => f.id !== tempFiles[i].id),
                }
              : batch
          )
        );
        upsertUploadedFileIntoBatch(uploadedFile);
        
        // Load lại danh sách thật từ BE để đồng bộ hóa
        await fetchBatches(false);
      } catch (err) {
        // Đánh dấu lỗi nếu upload thất bại
        setBatches((prev) =>
          prev.map((batch) =>
            batch.id === targetBatchId
              ? {
                  ...batch,
                  files: (batch.files || []).map((f) =>
                    f.id === tempFiles[i].id
                      ? { ...f, status: 'error', progress: 0, error_message: err.message || 'Lỗi tải lên' }
                      : f
                  ),
                }
              : batch
          )
        );
      }
    }
  };

  const handleDrop = (e, docType = selectedDocType) => {
    e.preventDefault();
    e.stopPropagation();
    resetDragState();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedDocType(docType);
      uploadFiles(e.dataTransfer.files, docType, selectedBatch?.id || null);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(e.target.files, filePickerDocTypeRef.current);
      e.target.value = '';
    }
  };

  const handleOpenUploadedFile = async (file) => {
    if (!file.file_url || file.status !== 'completed') return;

    const previewTab = window.open('', '_blank');
    if (!previewTab) {
      alert('Trình duyệt đang chặn tab mới. Vui lòng cho phép pop-up để xem file.');
      return;
    }

    try {
      previewTab.document.title = file.filename;
      previewTab.document.body.innerHTML = '<p style="font-family: system-ui, sans-serif; padding: 24px;">Đang mở file...</p>';
      const blob = await fetchUploadFileBlob(token, file);
      const ext = getFileExt(file.filename);

      if (ext === 'xml') {
        const xmlText = await blob.text();
        previewTab.document.open();
        previewTab.document.write(buildXmlPreviewHtml(file.filename, xmlText));
        previewTab.document.close();
        return;
      }

      const objectUrl = URL.createObjectURL(blob);
      previewTab.location.href = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (err) {
      previewTab.close();
      alert(err.message || 'Không thể mở file này. Vui lòng thử lại.');
    }
  };

  const handleDeleteUploadedFile = async (file) => {
    if (!file.id || file.status !== 'completed') return;

    const confirmed = window.confirm(`Bạn có chắc chắn muốn xóa file "${file.filename}" không?`);
    if (!confirmed) return;

    try {
      await deleteUploadedFile(token, file.id);
      setBatches((prev) =>
        prev.map((batch) => {
          if (batch.id !== file.batch_id) return batch;

          const nextFiles = (batch.files || []).filter((item) => item.id !== file.id);
          const uploadedDocTypes = Array.from(new Set(nextFiles.map((item) => item.doc_type).filter(Boolean)));
          const missingDocTypes = DOC_TYPES
            .map((type) => type.value)
            .filter((docType) => !uploadedDocTypes.includes(docType));

          return {
            ...batch,
            files: nextFiles,
            uploaded_doc_types: uploadedDocTypes,
            missing_doc_types: missingDocTypes,
            status: missingDocTypes.length === 0 ? 'ready' : 'incomplete',
          };
        })
      );
      await fetchBatches(false);
    } catch (err) {
      alert(err.message || 'Không thể xóa file này. Vui lòng thử lại.');
    }
  };

  const handleDeleteBatch = async (batch) => {
    if (!batch?.id || (batch.files || []).length > 0 || deletingBatchIds.includes(batch.id)) return;

    const confirmed = window.confirm(`Bạn có chắc chắn muốn xóa batch "${batch.batch_number}" không?`);
    if (!confirmed) return;

    setDeletingBatchIds((prev) => [...prev, batch.id]);
    try {
      await deleteDocumentBatch(token, batch.id);
      const remainingBatches = batches.filter((item) => item.id !== batch.id && !isBatchReady(item));
      setBatches((prev) => {
        const filteredBatches = prev.filter((item) => item.id !== batch.id);
        return filteredBatches;
      });
      setSelectedBatchId((currentId) => (
        currentId === batch.id ? remainingBatches[0]?.id || null : currentId
      ));
    } catch (err) {
      alert(err.message || 'Không thể xóa batch này. Vui lòng thử lại.');
    } finally {
      setDeletingBatchIds((prev) => prev.filter((id) => id !== batch.id));
    }
  };

  const handleViewReconciliation = (batch) => {
    if (!batch?.id) return;
    navigate(`/audit-trail?batchId=${batch.id}`);
  };

  const handleOpenReadyBatch = () => {
    if (!readyBatchNotice?.id) return;
    navigate(`/audit-trail?batchId=${readyBatchNotice.id}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Tải lên & Xử lý chứng từ</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Tải lên đơn đặt hàng PO, hóa đơn (.xml, .pdf, .png) hoặc phiếu nhập kho GRN để AI tự động bóc tách và đối soát.
        </p>
      </div>

      {/* Select Document Type with Highlight Bounding Container */}
      <div ref={documentTypesRef} className="highlight-box-info grid grid-cols-1 md:grid-cols-3 gap-3 scroll-mt-6">
        {DOC_TYPES.map((type) => {
          const isSelected = selectedDocType === type.value;
          const isDropActive = activeDropType === type.value;
          const Icon = type.icon;
          const uploadedFiles = uploadedFilesByType[type.value] || [];
          return (
            <div
              key={type.value}
              role="button"
              tabIndex={0}
              data-testid={`drop-zone-${type.value}`}
              onClick={() => handleChooseFiles(type.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleChooseFiles(type.value);
                }
              }}
              onDragEnter={(event) => handleTypeDragEnter(event, type.value)}
              onDragOver={(event) => handleTypeDragOver(event, type.value)}
              onDragLeave={handleTypeDragLeave}
              onDrop={(event) => handleDrop(event, type.value)}
              className={`flex flex-col items-start text-left p-4 rounded-xl border-2 transition-all ${
                isDropActive
                  ? 'border-brand-500 bg-brand-50 shadow-md ring-4 ring-brand-100 dark:border-brand-400 dark:bg-brand-950/30 dark:ring-brand-950'
                  : isSelected
                  ? 'border-brand-500 bg-white shadow-md dark:bg-slate-800 dark:border-brand-400'
                  : 'border-slate-200/80 bg-white/60 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700'
              }`}
            >
              <div className={`p-2 rounded-lg ${isSelected || isDropActive ? 'bg-brand-600 text-white dark:bg-brand-500' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                <Icon size={18} />
              </div>
              <span className="mt-3 font-bold text-sm text-slate-900 dark:text-slate-100">{type.label}</span>
              <span className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{type.desc}</span>
              {uploadedFiles.length > 0 && (
                <div className="mt-3 w-full border-t border-slate-200/80 pt-2 dark:border-slate-700">
                  <div className="space-y-1">
                    {uploadedFiles.map((file, index) => (
                      <div
                        key={`${file.id || file.filename}-${index}`}
                        className="flex w-full flex-wrap items-center gap-1 rounded-md bg-slate-50 px-2 py-1 dark:bg-slate-900"
                      >
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleOpenUploadedFile(file);
                          }}
                          className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-[11px] font-medium text-slate-700 transition-colors hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-slate-300"
                          title="Bấm để mở file"
                        >
                          <span className="truncate">{file.filename}</span>
                          {(file.status === 'queued' || file.status === 'processing') ? (
                            <Loader2 size={12} className="shrink-0 animate-spin text-brand-600 dark:text-brand-300" />
                          ) : (
                            <ExternalLink size={12} className="shrink-0 text-slate-400" />
                          )}
                        </button>
                        {file.status === 'completed' && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteUploadedFile(file);
                            }}
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:hover:bg-rose-950/40"
                            title="Xóa file"
                          >
                            <X size={13} />
                          </button>
                        )}
                        {(file.status === 'queued' || file.status === 'processing') && (
                          <div className="hidden">
                            <Loader2 size={12} className="animate-spin" />
                            <span>
                              {file.status === 'queued'
                                ? 'Đang chờ tải lên...'
                                : 'Đang tải và AI đang đọc...' }
                            </span>
                          </div>
                        )}
                        {file.status === 'error' && (
                          <p className="mt-1 basis-full text-[10px] font-semibold text-rose-600 dark:text-rose-300">
                            {file.error_message || 'Tải lên thất bại'}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {uploadedFiles.length === 0 && hasSelectedBatchFiles && (
                <div className="mt-3 w-full border-t border-slate-200/80 pt-2 dark:border-slate-700">
                  <p className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                    Chưa có chứng từ
                  </p>
                </div>
              )}
            </div>
          );
        })}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".xml,.pdf,.png,.jpg,.jpeg"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {readyBatchNotice && (
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-[0_1px_3px_rgba(0,55,112,0.08)] dark:border-emerald-900 dark:bg-emerald-950/25 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <CheckCircle2 size={17} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
                {readyBatchNotice.batchNumber} đã đủ chứng từ
              </p>
              <p className="mt-0.5 text-sm text-emerald-800 dark:text-emerald-200">
                Sang Tab Batch đối soát để xem kết quả
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:self-center">
            <button
              type="button"
              onClick={handleOpenReadyBatch}
              className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              Xem ngay
            </button>
            <button
              type="button"
              onClick={() => setReadyBatchNotice(null)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-emerald-700 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-200 dark:hover:bg-emerald-950"
              title="Đóng thông báo"
              aria-label="Đóng thông báo"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Batches */}
      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Hàng đợi xử lý ({pendingBatches.length} bộ)
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Chọn một bộ để bổ sung PO, hóa đơn hoặc phiếu nhập kho còn thiếu.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchBatches(true)}
              className="text-xs text-brand-600 dark:text-brand-400 hover:text-brand-700 font-semibold"
            >
              Làm mới
            </button>
            <button
              onClick={handleCreateBatch}
              className="rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              Tạo bộ mới
            </button>
          </div>
        </div>
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="animate-spin text-brand-600 dark:text-brand-400" size={24} />
            <span className="text-xs text-slate-400 dark:text-slate-500 ml-2">Đang tải danh sách...</span>
          </div>
        ) : pendingBatches.length === 0 ? (
          <div className="text-center py-12 text-slate-400 dark:text-slate-500 text-xs">
            Chưa có bộ đối soát nào. Hãy kéo file vào ô PO, Invoice hoặc GRN để tạo bộ đầu tiên.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto dark:divide-slate-800">
            {paginatedBatches.map((batch) => {
              const isSelectedBatch = selectedBatch?.id === batch.id;
              const filesByType = (batch.files || []).reduce((acc, file) => {
                if (!file.doc_type) return acc;
                acc[file.doc_type] = file;
                return acc;
              }, {});
              const canDeleteBatch = (batch.files || []).length === 0;
              const isDeletingBatch = deletingBatchIds.includes(batch.id);
              const missingCount = batch.missing_doc_types?.length ?? 3;
              const isReady = missingCount === 0 || batch.status === 'ready';

              return (
                <div
                  key={batch.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectBatch(batch.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleSelectBatch(batch.id);
                    }
                  }}
                  className={`block w-full px-5 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset ${
                    isSelectedBatch
                      ? 'bg-brand-50/80 ring-1 ring-inset ring-brand-300 shadow-[inset_4px_0_0_#4f46e5] dark:bg-brand-950/30 dark:ring-brand-700/80 dark:shadow-[inset_4px_0_0_#818cf8]'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'
                  } group relative cursor-pointer pr-14`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {batch.batch_number}
                        </p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            isReady
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                          }`}
                        >
                          {isReady ? 'Đủ chứng từ' : `Cần bổ sung ${missingCount} chứng từ`}
                        </span>
                        {isReady && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleViewReconciliation(batch);
                            }}
                            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-brand-200 bg-white px-2.5 text-[11px] font-semibold text-brand-700 shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-brand-800 dark:bg-slate-900 dark:text-brand-300 dark:hover:bg-brand-950/40"
                            title="Xem đối soát"
                            aria-label={`Xem đối soát ${batch.batch_number}`}
                          >
                            <Eye size={13} />
                            Xem đối soát
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                        Cập nhật: {batch.updated_at || batch.created_at}
                      </p>
                    </div>
                    <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 md:grid-cols-3 lg:max-w-3xl">
                      {DOC_TYPES.map((type) => {
                        const file = filesByType[type.value];
                        return (
                          <span
                            key={type.value}
                            className={`min-w-0 rounded-lg border px-3 py-2 text-xs ${
                              file
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
                                : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                            }`}
                            title={file?.filename || 'Chưa có chứng từ'}
                          >
                            <span className="block font-semibold">{type.label}</span>
                            <span className="mt-0.5 block truncate">
                              {file?.filename || 'Chưa có chứng từ'}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  {canDeleteBatch && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteBatch(batch);
                      }}
                      disabled={isDeletingBatch}
                      className="absolute right-4 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 opacity-0 transition-all hover:bg-rose-50 hover:text-rose-600 focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-50 group-hover:opacity-100 dark:text-slate-500 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
                      title="Xóa batch"
                      aria-label={`Xóa batch ${batch.batch_number}`}
                    >
                      {isDeletingBatch ? <Loader2 size={14} className="animate-spin" /> : <X size={15} />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {pendingBatches.length > BATCHES_PER_PAGE && (
          <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Hiển thị {batchStartIndex}-{batchEndIndex} / {pendingBatches.length} bộ
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setBatchPage((page) => Math.max(1, page - 1))}
                disabled={safeBatchPage === 1}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
              >
                Trước
              </button>
              <span className="min-w-[72px] text-center text-xs font-semibold text-slate-700 dark:text-slate-300">
                {safeBatchPage} / {totalBatchPages}
              </span>
              <button
                type="button"
                onClick={() => setBatchPage((page) => Math.min(totalBatchPages, page + 1))}
                disabled={safeBatchPage === totalBatchPages}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
              >
                Sau
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
