import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  FileText,
  FileImage,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  FileUp,
  ExternalLink,
  ShoppingCart,
  PackageCheck,
  FileCode2,
} from 'lucide-react';
import {
  createDocumentBatch,
  fetchUploadFileBlob,
  getDocumentBatches,
  uploadDocument,
} from '../api.js';

const STATUS_STYLES = {
  completed: { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Hoàn tất' },
  processing: { icon: Loader2, color: 'text-brand-600', bg: 'bg-brand-50', label: 'Đang xử lý', spin: true },
  queued: { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Chờ xử lý' },
  error: { icon: AlertCircle, color: 'text-rose-600', bg: 'bg-rose-50', label: 'Lỗi' },
};

const DOC_TYPES = [
  { value: 'po', label: 'Đơn đặt hàng (PO)', desc: 'Lưu thông tin thô đơn đặt hàng làm cơ sở đối chiếu', icon: ShoppingCart },
  { value: 'invoice', label: 'Hóa đơn (Invoice)', desc: 'Kích hoạt đối soát 3 bên chéo trực tiếp từ DB', icon: FileText },
  { value: 'grn', label: 'Phiếu nhập kho (GRN)', desc: 'Lưu thông tin thực nhận làm cơ sở đối chiếu', icon: PackageCheck },
];
const BATCHES_PER_PAGE = 5;

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
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [activeDropType, setActiveDropType] = useState(null);
  const [selectedDocType, setSelectedDocType] = useState('po');
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [batchPage, setBatchPage] = useState(1);
  const documentTypesRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragDepthRef = useRef(0);

  const totalBatchPages = Math.max(1, Math.ceil(batches.length / BATCHES_PER_PAGE));
  const safeBatchPage = Math.min(batchPage, totalBatchPages);
  const paginatedBatches = batches.slice(
    (safeBatchPage - 1) * BATCHES_PER_PAGE,
    safeBatchPage * BATCHES_PER_PAGE
  );
  const batchStartIndex = batches.length === 0 ? 0 : (safeBatchPage - 1) * BATCHES_PER_PAGE + 1;
  const batchEndIndex = Math.min(safeBatchPage * BATCHES_PER_PAGE, batches.length);
  const selectedBatch = batches.find((batch) => batch.id === selectedBatchId) || batches[0] || null;
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
        if (currentId && items.some((batch) => batch.id === currentId)) return currentId;
        return items[0]?.id || null;
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
    dragDepthRef.current = 0;
    setIsDragOver(false);
    setActiveDropType(null);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragOver(true);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      resetDragState();
    }
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

        const nextFiles = [
          uploadedFile,
          ...(batch.files || []).filter((file) => file.id !== uploadedFile.id),
        ];
        const uploadedDocTypes = Array.from(new Set(nextFiles.map((file) => file.doc_type).filter(Boolean)));
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
      uploadFiles(e.target.files);
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
          const Icon = type.icon;
          const uploadedFiles = uploadedFilesByType[type.value] || [];
          return (
            <div
              key={type.value}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedDocType(type.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelectedDocType(type.value);
                }
              }}
              className={`flex flex-col items-start text-left p-4 rounded-xl border-2 transition-all ${
                isSelected
                  ? 'border-brand-500 bg-white shadow-md dark:bg-slate-800 dark:border-brand-400'
                  : 'border-slate-200/80 bg-white/60 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700'
              }`}
            >
              <div className={`p-2 rounded-lg ${isSelected ? 'bg-brand-600 text-white dark:bg-brand-500' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                <Icon size={18} />
              </div>
              <span className="mt-3 font-bold text-sm text-slate-900 dark:text-slate-100">{type.label}</span>
              <span className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{type.desc}</span>
              {uploadedFiles.length > 0 && (
                <div className="mt-3 w-full border-t border-slate-200/80 pt-2 dark:border-slate-700">
                  <div className="space-y-1">
                    {uploadedFiles.map((file, index) => (
                      <button
                        key={`${file.id || file.filename}-${index}`}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleOpenUploadedFile(file);
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1 text-left text-[11px] font-medium text-slate-700 transition-colors hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                        title="Bấm để mở file"
                      >
                        <span className="truncate">{file.filename}</span>
                        <ExternalLink size={12} className="shrink-0 text-slate-400" />
                      </button>
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
      </div>

      {/* Dropzone */}
      <div
        data-testid="document-dropzone"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={(event) => handleDrop(event, activeDropType || selectedDocType)}
        onClick={() => {
          if (!isDragOver) fileInputRef.current?.click();
        }}
        className={`card flex min-h-[310px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 transition-all ${
          isDragOver
            ? 'border-brand-500 bg-brand-50/80 dark:bg-brand-950/40'
            : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50/50 dark:border-slate-700 dark:hover:border-brand-500 dark:hover:bg-slate-800/40'
        }`}
      >
        {isDragOver ? (
          <div className="grid h-full min-h-[260px] w-full grid-cols-1 gap-3 md:grid-cols-3">
            {DOC_TYPES.map((type) => {
              const Icon = type.icon;
              const isActive = activeDropType === type.value;
              const isMuted = activeDropType && !isActive;

              return (
                <div
                  key={type.value}
                  data-testid={`drop-zone-${type.value}`}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setActiveDropType(type.value);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
                    setActiveDropType(type.value);
                  }}
                  onDrop={(event) => handleDrop(event, type.value)}
                  className={`flex min-h-[220px] flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 py-6 text-center transition-all ${
                    isActive
                      ? 'border-brand-500 bg-white shadow-md ring-4 ring-brand-100 dark:bg-slate-900 dark:ring-brand-950'
                      : 'border-slate-300 bg-white/60 dark:border-slate-700 dark:bg-slate-900/60'
                  } ${isMuted ? 'opacity-45' : 'opacity-100'}`}
                >
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-colors ${
                      isActive
                        ? 'bg-brand-600 text-white dark:bg-brand-500'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    <Icon size={24} />
                  </div>
                  <p className="mt-4 text-sm font-bold text-slate-900 dark:text-slate-100">{type.label}</p>
                  <p className="mt-1 max-w-[260px] text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    Thả file vào đây để tải lên đúng loại chứng từ này
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <>
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 transition-colors dark:bg-slate-800">
              <FileUp size={28} className="text-slate-400 dark:text-slate-500" />
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Kéo thả file vào đây
            </p>
            <p className="mt-1 text-center text-xs text-slate-500 dark:text-slate-400">
              hoặc <span className="font-semibold text-brand-600 dark:text-brand-400">bấm để chọn file từ máy tính</span>
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
              <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono font-bold text-slate-700 dark:text-slate-300">.XML</span>
              <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono font-bold text-slate-700 dark:text-slate-300">.PDF</span>
              <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono font-bold text-slate-700 dark:text-slate-300">.PNG / .JPG</span>
              <span>·</span>
              <span>Dung lượng tối đa 25 MB</span>
            </div>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".xml,.pdf,.png,.jpg,.jpeg"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Batches */}
      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Hàng đợi xử lý ({batches.length} bộ)
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
        ) : batches.length === 0 ? (
          <div className="text-center py-12 text-slate-400 dark:text-slate-500 text-xs">
            Chưa có bộ đối soát nào. Hãy kéo file vào vùng upload để tạo bộ đầu tiên.
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
              const missingCount = batch.missing_doc_types?.length ?? 3;
              const isReady = missingCount === 0 || batch.status === 'ready';

              return (
                <button
                  key={batch.id}
                  type="button"
                  onClick={() => handleSelectBatch(batch.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleSelectBatch(batch.id);
                    }
                  }}
                  className={`block w-full px-5 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset ${
                    isSelectedBatch
                      ? 'bg-brand-50/70 dark:bg-brand-950/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'
                  }`}
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
                </button>
              );
            })}
          </div>
        )}
        {batches.length > BATCHES_PER_PAGE && (
          <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Hiển thị {batchStartIndex}-{batchEndIndex} / {batches.length} bộ
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
