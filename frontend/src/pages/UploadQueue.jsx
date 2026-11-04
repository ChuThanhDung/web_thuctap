import { batchDetail } from '../routes.js';
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
  ExternalLink,
  ShoppingCart,
  PackageCheck,
  X,
  Plus,
  RefreshCw,
  AlertCircle,
  ArrowRight,
  UploadCloud,
} from 'lucide-react';
import {
  createDocumentBatch,
  deleteDocumentBatch,
  deleteUploadedFile,
  fetchUploadFileBlob,
  uploadDocument,
  updateDocumentBatch,
} from '../api.js';
import {
  fetchDocumentBatchesWithCache,
  getCachedBatches,
  removeCachedBatchItem,
  subscribeBatchCache,
  updateCachedBatchItem,
} from '../services/batchCache.js';
import { useToast } from '../ui/Toast.jsx';
import { Button, PageHeader } from '../ui/index.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { EXPORT_FONT_STACK } from '../lib/exportStyles.js';
import { formatDateTime } from '../lib/format.js';

const DOC_TYPES = [
  { value: 'po', label: 'Đơn đặt hàng (PO)', icon: ShoppingCart },
  { value: 'invoice', label: 'Hóa đơn (HĐ)', icon: FileText },
  { value: 'grn', label: 'Phiếu nhập kho (GRN)', icon: PackageCheck },
];
const MAX_PARALLEL_UPLOADS = 3;
const AUTO_DOC_TYPE = 'auto';
const AUTO_UPLOAD_ERROR_MESSAGE =
  'Chưa nhận diện được file chứng từ. Vui lòng kiểm tra lại và kéo thả đúng file PO/Invoice hoặc GRN.';
const BATCHES_PER_PAGE = 5;
const BATCH_NOTE_MAX_LENGTH = 500;

function isBatchReady(batch) {
  if (batch?.status === 'ready' || batch?.status === 'approved' || batch?.status === 'final_approved') return true;
  const { uploadedDocTypes, missingDocTypes, pendingExtractionDocTypes } = getBatchDocState(batch);
  if (uploadedDocTypes.length > 0) {
    return missingDocTypes.length === 0 && pendingExtractionDocTypes.length === 0;
  }

  if (Array.isArray(batch?.pending_extraction_doc_types) && Array.isArray(batch?.missing_doc_types)) {
    return batch.missing_doc_types.length === 0 && batch.pending_extraction_doc_types.length === 0;
  }
  if (Array.isArray(batch?.extracted_doc_types)) {
    return DOC_TYPES.every((type) => batch.extracted_doc_types.includes(type.value));
  }
  return false;
}

function getBatchDocState(batch) {
  const files = batch?.files || [];
  const fileUploadedDocTypes = files.map((file) => file.doc_type).filter(Boolean);
  const fallbackUploadedDocTypes = Array.isArray(batch?.uploaded_doc_types) ? batch.uploaded_doc_types : [];
  const fallbackPendingDocTypes = Array.isArray(batch?.pending_extraction_doc_types)
    ? batch.pending_extraction_doc_types
    : [];
  const fallbackExtractedDocTypes = Array.isArray(batch?.extracted_doc_types) ? batch.extracted_doc_types : [];
  const uploadedDocTypes = Array.from(new Set([
    ...fileUploadedDocTypes,
    ...fallbackUploadedDocTypes,
    ...fallbackPendingDocTypes,
    ...fallbackExtractedDocTypes,
  ]));

  const fileExtractedDocTypes = files
      .filter((file) => hasExtractedData(file))
      .map((file) => file.doc_type)
      .filter(Boolean);
  const extractedDocTypes = Array.from(new Set([
    ...fileExtractedDocTypes,
    ...fallbackExtractedDocTypes,
  ]));

  const missingDocTypes = DOC_TYPES
    .map((type) => type.value)
    .filter((docType) => !uploadedDocTypes.includes(docType));
  const pendingExtractionDocTypes = DOC_TYPES
    .map((type) => type.value)
    .filter((docType) => (
      fallbackPendingDocTypes.includes(docType)
      || files.some((f) => f.doc_type === docType && (f.status === 'processing' || f.status === 'queued' || f.isInFlight))
    ));

  return { uploadedDocTypes, extractedDocTypes, missingDocTypes, pendingExtractionDocTypes };
}

function isBatchEmpty(batch) {
  if (!batch || ['ready', 'approved', 'final_approved', 'rejected'].includes(batch.status)) return false;
  const { uploadedDocTypes } = getBatchDocState(batch);
  return uploadedDocTypes.length === 0 && (batch.files || []).length === 0;
}

function hasExtractedData(file) {
  if (!file) return false;
  if (file.ai_extraction) {
    return Boolean(file.ai_extraction.is_correct_type && file.ai_extraction.extracted_data);
  }
  return file.status === 'completed';
}

function isFileBeingRead(file) {
  if (!file) return false;
  if (file.isInFlight) return file.status === 'processing';
  if (file.status === 'error') return false;
  if (file.status === 'queued' || file.status === 'processing') return true;
  return false;
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
      font-family: ${EXPORT_FONT_STACK};
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
  const toast = useToast();
  const [pendingDelete, setPendingDelete] = useState(null);
  const [isDeletingPending, setIsDeletingPending] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedBatchId = searchParams.get('batchId');
  const isSupplementMode = Boolean(requestedBatchId && searchParams.get('mode') === 'supplement');
  const cached = getCachedBatches();
  const [batches, setBatches] = useState(() => cached?.items || []);
  const [loading, setLoading] = useState(() => !cached);
  const [inFlightFiles, setInFlightFiles] = useState([]);
  const [activeDropType, setActiveDropType] = useState(null);
  const [selectedDocType, setSelectedDocType] = useState(AUTO_DOC_TYPE);
  const [selectedBatchId, setSelectedBatchId] = useState(() => {
    if (requestedBatchId) {
      const requestedBatch = (cached?.items || []).find((batch) => String(batch.id) === String(requestedBatchId));
      return requestedBatch?.id || requestedBatchId;
    }
    const emptyBatch = (cached?.items || []).find(isBatchEmpty);
    return emptyBatch?.id || null;
  });
  const [batchFilterTab, setBatchFilterTab] = useState(() => (requestedBatchId ? 'all' : 'incomplete')); // 'incomplete' | 'ready' | 'all'
  const [batchPage, setBatchPage] = useState(1);
  const [deletingBatchIds, setDeletingBatchIds] = useState([]);
  const [batchNoteDraft, setBatchNoteDraft] = useState('');
  const [lastSavedBatchNote, setLastSavedBatchNote] = useState('');
  const [batchNoteSaving, setBatchNoteSaving] = useState(false);
  const [batchNoteError, setBatchNoteError] = useState('');
  const [supplementUploadedFileIds, setSupplementUploadedFileIds] = useState(() => new Set());
  const [uploadWorkspaceReady, setUploadWorkspaceReady] = useState(false);
  const [uploadWorkspaceError, setUploadWorkspaceError] = useState('');
  const uploadWorkspaceInitKeyRef = useRef(null);

  // Ref to always have the real-time selected batch ID without stale closure
  const selectedBatchIdRef = useRef(selectedBatchId);
  useEffect(() => {
    selectedBatchIdRef.current = selectedBatchId;
  }, [selectedBatchId]);

  // Track batches that have been viewed / navigated to AuditTrail
  const initialReadyIdsRef = useRef(null);
  const [viewedBatchIds, setViewedBatchIds] = useState(() => new Set());

  const documentTypesRef = useRef(null);
  const fileInputRef = useRef(null);
  const filePickerDocTypeRef = useRef('po');

  // Batches that need action: incomplete batches + newly completed batches not yet viewed
  const activeBatches = useMemo(() => {
    return batches.filter((batch) => {
      if (!isBatchReady(batch)) return true; // incomplete
      return !viewedBatchIds.has(batch.id); // newly completed in this session, not yet viewed!
    });
  }, [batches, viewedBatchIds]);

  const readyBatches = useMemo(() => {
    return batches.filter((batch) => isBatchReady(batch));
  }, [batches]);

  // Selected batch lookup: strictly prioritize the explicitly selected batch ID
  const selectedBatch = useMemo(() => {
    const targetId = selectedBatchId || selectedBatchIdRef.current;
    if (targetId) {
      const match = batches.find((batch) => String(batch.id) === String(targetId));
      return match || null;
    }
    return null;
  }, [batches, selectedBatchId]);

  // In-flight files for selected batch
  const selectedBatchInFlight = inFlightFiles.filter((inf) => String(inf.batchId) === String(selectedBatch?.id));
  const selectedBatchFiles = selectedBatch?.files || [];

  useEffect(() => {
    const selectedNote = selectedBatch?.note || '';
    setBatchNoteDraft(selectedNote);
    setLastSavedBatchNote(selectedNote);
    setBatchNoteError('');
  }, [selectedBatch?.id]);

  // Group files by doc_type for the selected batch
  const uploadedFilesByType = useMemo(() => {
    return DOC_TYPES.reduce((acc, type) => {
      const completed = selectedBatchFiles.filter((f) => {
        if (f.doc_type !== type.value) return false;
        if (!isSupplementMode) return true;
        return supplementUploadedFileIds.has(String(f.id));
      });
      const inFlight = selectedBatchInFlight
        .filter((inf) => inf.docType === type.value)
        .map((inf) => ({
          id: inf.tempId,
          batch_id: inf.batchId,
          doc_type: inf.docType,
          filename: inf.filename,
          size: inf.size,
          status: inf.status,
          error_message: inf.errorMessage,
          isInFlight: true,
        }));

      acc[type.value] = [...inFlight, ...completed];
      return acc;
    }, {});
  }, [isSupplementMode, selectedBatchFiles, selectedBatchInFlight, supplementUploadedFileIds]);

  // Filtering batches for list based on tab
  const filteredBatches = useMemo(() => {
    if (batchFilterTab === 'incomplete') return activeBatches;
    if (batchFilterTab === 'ready') return readyBatches;
    return batches;
  }, [batchFilterTab, activeBatches, readyBatches, batches]);

  const totalBatchPages = Math.max(1, Math.ceil(filteredBatches.length / BATCHES_PER_PAGE));
  const safeBatchPage = Math.min(batchPage, totalBatchPages);
  const paginatedBatches = filteredBatches.slice(
    (safeBatchPage - 1) * BATCHES_PER_PAGE,
    safeBatchPage * BATCHES_PER_PAGE
  );
  const batchStartIndex = filteredBatches.length === 0 ? 0 : (safeBatchPage - 1) * BATCHES_PER_PAGE + 1;
  const batchEndIndex = Math.min(safeBatchPage * BATCHES_PER_PAGE, filteredBatches.length);

  const syncReadyBatchNotice = useCallback((items) => {
    const nextReadyIds = new Set(items.filter(isBatchReady).map((batch) => batch.id));
    
    // On first load, mark historical ready batches as already viewed
    if (initialReadyIdsRef.current === null && items.length > 0) {
      initialReadyIdsRef.current = new Set(nextReadyIds);
      setViewedBatchIds(new Set(nextReadyIds));
    }
  }, []);

  // Lắng nghe thay đổi từ batchCache
  useEffect(() => {
    const unsubscribe = subscribeBatchCache((data) => {
      if (data?.items) {
        syncReadyBatchNotice(data.items);
        setBatches(data.items);
      }
    });
    return unsubscribe;
  }, [syncReadyBatchNotice]);

  // Hàm load danh sách bộ đối soát thực tế từ BE
  const fetchBatches = useCallback(async (showLoading = false, forceRefresh = false) => {
    try {
      if (showLoading && !getCachedBatches()) setLoading(true);
      const data = await fetchDocumentBatchesWithCache(token, { forceRefresh });
      const items = data?.items || [];
      syncReadyBatchNotice(items);
      setBatches(items);
      
      setSelectedBatchId((currentId) => {
        const activeId = currentId || selectedBatchIdRef.current;
        // If current selected batch is valid in items, keep it locked
        if (activeId) {
          const activeBatch = items.find((batch) => String(batch.id) === String(activeId));
          if (activeBatch) {
            selectedBatchIdRef.current = activeBatch.id;
            return activeBatch.id;
          }
        }
        // If activeId was locally set (e.g. freshly created), retain it
        if (activeId) {
          selectedBatchIdRef.current = activeId;
          return activeId;
        }
        const emptyBatch = items.find(isBatchEmpty);
        const fallbackId = emptyBatch?.id || null;
        selectedBatchIdRef.current = fallbackId;
        return fallbackId;
      });
    } catch (err) {
      console.error('Không thể lấy danh sách bộ đối soát:', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [syncReadyBatchNotice, token]);

  const initializeUploadWorkspace = useCallback(async ({ force = false } = {}) => {
    const initializationKey = requestedBatchId ? `requested:${requestedBatchId}` : 'default';
    if (!force && uploadWorkspaceInitKeyRef.current === initializationKey) return;

    uploadWorkspaceInitKeyRef.current = initializationKey;
    setLoading(true);
    setUploadWorkspaceReady(false);
    setUploadWorkspaceError('');

    try {
      const data = await fetchDocumentBatchesWithCache(token, { forceRefresh: true });
      let items = data?.items || [];
      syncReadyBatchNotice(items);

      if (requestedBatchId) {
        const requestedBatch = items.find((batch) => String(batch.id) === String(requestedBatchId));
        if (!requestedBatch) {
          throw new Error('Không tìm thấy bộ chứng từ cần tải bổ sung hoặc bạn không còn quyền truy cập.');
        }
        const nextId = requestedBatch.id;
        setBatches(items);
        setSelectedBatchId(nextId);
        selectedBatchIdRef.current = nextId;
        setUploadWorkspaceReady(true);
        return;
      }

      let uploadBatch = items.find(isBatchEmpty);
      if (!uploadBatch) {
        uploadBatch = await createDocumentBatch(token);
        updateCachedBatchItem(uploadBatch);
        items = [uploadBatch, ...items.filter((batch) => String(batch.id) !== String(uploadBatch.id))];
      }

      setBatches(items);
      setSelectedBatchId(uploadBatch.id);
      selectedBatchIdRef.current = uploadBatch.id;
      setBatchFilterTab('incomplete');
      setBatchPage(1);
      setUploadWorkspaceReady(true);
    } catch (err) {
      uploadWorkspaceInitKeyRef.current = null;
      setUploadWorkspaceError(err.message || 'Không thể chuẩn bị bộ chứng từ để tải lên.');
    } finally {
      setLoading(false);
    }
  }, [requestedBatchId, syncReadyBatchNotice, token]);

  // Mỗi lần vào trang, đảm bảo có một batch rỗng an toàn để bắt đầu tải lên.
  useEffect(() => {
    initializeUploadWorkspace();
  }, [initializeUploadWorkspace]);

  useEffect(() => {
    if (!requestedBatchId) return;
    const requestedBatch = batches.find((batch) => String(batch.id) === String(requestedBatchId));
    const nextId = requestedBatch?.id || requestedBatchId;
    setSelectedBatchId(nextId);
    selectedBatchIdRef.current = nextId;
    setBatchFilterTab('all');
    setBatchPage(1);
    window.setTimeout(() => {
      documentTypesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, [batches, requestedBatchId]);

  useEffect(() => {
    setSupplementUploadedFileIds(new Set());
  }, [requestedBatchId, isSupplementMode]);

  useEffect(() => {
    if (batchPage > totalBatchPages) {
      setBatchPage(totalBatchPages);
    }
  }, [batchPage, totalBatchPages]);

  // Tự động làm mới nếu có file đang xử lý
  useEffect(() => {
    const hasActiveFiles = inFlightFiles.some((f) => f.status === 'processing') || batches.some((batch) => {
      const { pendingExtractionDocTypes } = getBatchDocState(batch);
      return (batch.files || []).some((f) => f.status === 'processing' || f.status === 'queued')
        || (pendingExtractionDocTypes.length > 0 && (batch.files || []).some((f) => f.status === 'processing' || f.status === 'queued'));
    });
    
    if (!hasActiveFiles) return;

    const timer = setInterval(() => {
      fetchBatches(false);
    }, 3000);

    return () => clearInterval(timer);
  }, [batches, inFlightFiles, fetchBatches]);

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
    if (!uploadWorkspaceReady) return;
    filePickerDocTypeRef.current = docType;
    setSelectedDocType(docType);
    fileInputRef.current?.click();
  };

  const persistBatchNote = useCallback(async (batchId, note) => {
    const currentBatch = batches.find((batch) => String(batch.id) === String(batchId));
    const normalizedNote = note.trim();
    if (!currentBatch || (currentBatch.note || '') === normalizedNote) return;

    setBatchNoteSaving(true);
    setBatchNoteError('');
    try {
      const updatedBatch = await updateDocumentBatch(token, batchId, {
        note: normalizedNote || null,
      });
      updateCachedBatchItem(updatedBatch);
      setBatches((prev) =>
        prev.map((batch) => (String(batch.id) === String(batchId) ? { ...batch, ...updatedBatch } : batch))
      );
      setLastSavedBatchNote(updatedBatch.note || '');
    } catch (err) {
      setBatchNoteError(err.message || 'Không thể lưu ghi chú.');
    } finally {
      setBatchNoteSaving(false);
    }
  }, [batches, token]);

  useEffect(() => {
    if (!selectedBatch?.id || batchNoteDraft === lastSavedBatchNote) return undefined;

    const timer = window.setTimeout(() => {
      persistBatchNote(selectedBatch.id, batchNoteDraft);
    }, 700);

    return () => window.clearTimeout(timer);
  }, [batchNoteDraft, lastSavedBatchNote, persistBatchNote, selectedBatch?.id]);

  const handleBatchNoteChange = (event) => {
    setBatchNoteDraft(event.target.value.slice(0, BATCH_NOTE_MAX_LENGTH));
  };

  const handleBatchNoteBlur = () => {
    if (selectedBatch?.id && batchNoteDraft !== lastSavedBatchNote) {
      persistBatchNote(selectedBatch.id, batchNoteDraft);
    }
  };

  const handleCreateBatch = async () => {
    try {
      // If currently selected batch was completed, mark it as viewed
      if (selectedBatch && isBatchReady(selectedBatch)) {
        setViewedBatchIds((prev) => new Set([...prev, selectedBatch.id]));
      }
      const batch = await createDocumentBatch(token);
      updateCachedBatchItem(batch);
      setBatches((prev) => [batch, ...prev.filter((item) => item.id !== batch.id)]);
      setSelectedBatchId(batch.id);
      selectedBatchIdRef.current = batch.id;
      setBatchFilterTab('incomplete');
      setBatchPage(1);
      setUploadWorkspaceError('');
      setUploadWorkspaceReady(true);
      documentTypesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return batch;
    } catch (err) {
      toast.error(err.message || 'Không thể tạo bộ đối soát mới.');
    }
  };

  const handleSelectBatch = (batchId) => {
    setSelectedBatchId(batchId);
    selectedBatchIdRef.current = batchId;
    documentTypesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const ensureSelectedBatch = async () => {
    const currentId = selectedBatchIdRef.current || selectedBatchId;
    const existing = batches.find((batch) => String(batch.id) === String(currentId));
    if (existing) return existing;

    const emptyBatch = batches.find(isBatchEmpty);
    if (emptyBatch) {
      setSelectedBatchId(emptyBatch.id);
      selectedBatchIdRef.current = emptyBatch.id;
      return emptyBatch;
    }
    return handleCreateBatch();
  };

  const upsertUploadedFileIntoBatch = (uploadedFile) => {
    setBatches((prev) =>
      prev.map((batch) => {
        if (String(batch.id) !== String(uploadedFile.batch_id)) return batch;

        const nextFiles = [
          uploadedFile,
          ...(batch.files || []).filter((file) => file.id !== uploadedFile.id),
        ];
        const nextBatchState = { ...batch, files: nextFiles };
        const { uploadedDocTypes, extractedDocTypes, missingDocTypes, pendingExtractionDocTypes } = getBatchDocState(nextBatchState);
        const isReady = isBatchReady(nextBatchState);

        const updated = {
          ...batch,
          files: nextFiles,
          uploaded_doc_types: uploadedDocTypes,
          extracted_doc_types: extractedDocTypes,
          missing_doc_types: missingDocTypes,
          pending_extraction_doc_types: pendingExtractionDocTypes,
          approved_by_id: batch.status === 'rejected' ? null : batch.approved_by_id,
          approved_by_name: batch.status === 'rejected' ? null : batch.approved_by_name,
          chief_approved_by_id: batch.status === 'rejected' ? null : batch.chief_approved_by_id,
          chief_approved_by_name: batch.status === 'rejected' ? null : batch.chief_approved_by_name,
          rejection_note: batch.rejection_note,
          rejectionNote: batch.rejectionNote || batch.rejection_note,
          status: isReady ? 'ready' : 'incomplete',
        };
        updateCachedBatchItem(updated);
        return updated;
      })
    );
  };

  // Upload file lên BE với trạng thái in-flight độc lập
  const uploadFiles = async (fileList, docType = selectedDocType, batchId = null) => {
    const filesArray = Array.from(fileList);
    if (filesArray.length === 0 || !uploadWorkspaceReady) return;

    const ensuredBatch = batchId ? null : await ensureSelectedBatch();
    const targetBatchId = batchId || ensuredBatch?.id;
    if (!targetBatchId) return;

    // Lock the selected batch to this target batch
    setSelectedBatchId(targetBatchId);
    selectedBatchIdRef.current = targetBatchId;
    
    // Thêm các file vào tracking inFlightFiles để luôn giữ trạng thái "Đang đọc file" ngay lập tức (0ms)
    const newTrackingItems = filesArray.map((f, i) => ({
      tempId: `inflight-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      batchId: targetBatchId,
      docType: docType,
      filename: f.name,
      size: `${(f.size / 1024 / 1024).toFixed(1)} MB`,
      status: 'processing',
      errorMessage: null,
      startedAt: Date.now(),
    }));

    setInFlightFiles((prev) => [...prev, ...newTrackingItems]);

    // Tải song song (tối đa MAX_PARALLEL_UPLOADS file cùng lúc): thời gian cả bộ gần bằng file chậm nhất thay vì tổng.
    // Backend ghi từng file theo thứ tự và tự tính lại trạng thái bộ, nên thứ tự hoàn thành không ảnh hưởng kết quả.
    const uploadOne = async (index) => {
      const fileObj = filesArray[index];
      const trackingItem = newTrackingItems[index];

      try {
        const uploadedFile = await uploadDocument(token, fileObj, docType, targetBatchId);
        if (isSupplementMode) {
          setSupplementUploadedFileIds((prev) => {
            const next = new Set(prev);
            next.add(String(uploadedFile.id));
            return next;
          });
        }

        // Xóa khỏi in-flight khi hoàn thành
        setInFlightFiles((prev) => prev.filter((item) => item.tempId !== trackingItem.tempId));

        // Cập nhật ngay vào batch
        upsertUploadedFileIntoBatch(uploadedFile);
      } catch (err) {
        // Đánh dấu lỗi trên tracking item
        setInFlightFiles((prev) =>
          prev.map((item) =>
            item.tempId === trackingItem.tempId
              ? { ...item, status: 'error', errorMessage: err.message || 'Lỗi đọc file' }
              : item
          )
        );
      }
    };

    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(MAX_PARALLEL_UPLOADS, filesArray.length) }, async () => {
      while (nextIndex < filesArray.length) {
        const index = nextIndex;
        nextIndex += 1;
        await uploadOne(index);
      }
    });
    await Promise.all(workers);

    // Đồng bộ lại với backend một lần sau khi cả đợt xong (trước đây gọi sau từng file).
    await fetchBatches(false, true);
  };

  const handleDismissInFlightError = (tempId) => {
    setInFlightFiles((prev) => prev.filter((item) => item.tempId !== tempId));
  };

  const handleDrop = (e, docType = selectedDocType) => {
    e.preventDefault();
    e.stopPropagation();
    resetDragState();
    if (!uploadWorkspaceReady) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedDocType(docType);
      uploadFiles(e.dataTransfer.files, docType);
    }
  };

  const handleFileSelect = (e) => {
    if (!uploadWorkspaceReady) {
      e.target.value = '';
      return;
    }
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(e.target.files, filePickerDocTypeRef.current);
      e.target.value = '';
    }
  };

  const handleOpenUploadedFile = async (file) => {
    if (!file.file_url || file.status !== 'completed') return;

    const previewTab = window.open('', '_blank');
    if (!previewTab) {
      toast.error('Trình duyệt đang chặn tab mới. Vui lòng cho phép pop-up để xem file.');
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
      toast.error(err.message || 'Không thể mở file này. Vui lòng thử lại.');
    }
  };

  const handleDeleteUploadedFile = (file) => {
    if (!file.id || file.status !== 'completed') return;
    setPendingDelete({ kind: 'file', item: file });
  };

  const deleteFileNow = async (file) => {
    try {
      await deleteUploadedFile(token, file.id);
      setBatches((prev) =>
        prev.map((batch) => {
          if (batch.id !== file.batch_id) return batch;

          const nextFiles = (batch.files || []).filter((item) => item.id !== file.id);
          const { uploadedDocTypes, extractedDocTypes, missingDocTypes, pendingExtractionDocTypes } = getBatchDocState({
            ...batch,
            files: nextFiles,
          });

          return {
            ...batch,
            files: nextFiles,
            uploaded_doc_types: uploadedDocTypes,
            extracted_doc_types: extractedDocTypes,
            missing_doc_types: missingDocTypes,
            pending_extraction_doc_types: pendingExtractionDocTypes,
            status: missingDocTypes.length === 0 && pendingExtractionDocTypes.length === 0 ? 'ready' : 'incomplete',
          };
        })
      );
      await fetchBatches(false, true);
    } catch (err) {
      toast.error(err.message || 'Không thể xóa file này. Vui lòng thử lại.');
    }
  };

  const handleDeleteBatch = (batch) => {
    if (!batch?.id || (batch.files || []).length > 0 || deletingBatchIds.includes(batch.id)) return;
    setPendingDelete({ kind: 'batch', item: batch });
  };

  const confirmPendingDelete = async () => {
    if (!pendingDelete || isDeletingPending) return;
    setIsDeletingPending(true);
    try {
      if (pendingDelete.kind === 'file') await deleteFileNow(pendingDelete.item);
      else await deleteBatchNow(pendingDelete.item);
    } finally {
      setIsDeletingPending(false);
      setPendingDelete(null);
    }
  };

  const deleteBatchNow = async (batch) => {
    setDeletingBatchIds((prev) => [...prev, batch.id]);
    try {
      await deleteDocumentBatch(token, batch.id);
      removeCachedBatchItem(batch.id);
      const remainingBatches = batches.filter((item) => item.id !== batch.id);
      setBatches(remainingBatches);
      setSelectedBatchId((currentId) => {
        const nextEmptyBatch = remainingBatches.find(isBatchEmpty);
        const nextId = String(currentId) === String(batch.id) ? nextEmptyBatch?.id || null : currentId;
        selectedBatchIdRef.current = nextId;
        return nextId;
      });
    } catch (err) {
      toast.error(err.message || 'Không thể xóa bộ chứng từ này. Vui lòng thử lại.');
    } finally {
      setDeletingBatchIds((prev) => prev.filter((id) => id !== batch.id));
    }
  };

  // Navigating to audit-trail marks the batch as viewed, moving it to "Đã hoàn tất"
  const handleViewReconciliation = (batch) => {
    if (!batch?.id) return;
    setViewedBatchIds((prev) => new Set([...prev, batch.id]));
    navigate(batchDetail(batch.id));
  };

  const autoUploadFiles = selectedBatchInFlight.filter((inf) => inf.docType === AUTO_DOC_TYPE);
  const isAutoDropActive = activeDropType === AUTO_DOC_TYPE;
  const isAutoReading = autoUploadFiles.some((file) => file.status === 'processing');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tải chứng từ"
        description="Tải PO, hóa đơn và phiếu nhập kho cho một bộ. XML được đọc cục bộ; PDF và ảnh qua AI trích xuất."
        actions={
          <Button variant="primary" leadingIcon={Plus} onClick={handleCreateBatch} disabled={!uploadWorkspaceReady}>
            Tạo bộ mới
          </Button>
        }
      />

      {!uploadWorkspaceReady && (
        <div
          role={uploadWorkspaceError ? 'alert' : 'status'}
          className={`flex flex-wrap items-center justify-between gap-3 rounded-card border px-4 py-3 text-sm ${
            uploadWorkspaceError
              ? 'border-tone-danger-line bg-tone-danger-bg text-tone-danger-fg'
              : 'border-tone-brand-line bg-tone-brand-bg text-tone-brand-fg'
          }`}
        >
          <span className="inline-flex items-center gap-2 font-semibold">
            {uploadWorkspaceError ? <AlertCircle size={16} /> : <Loader2 size={16} className="animate-spin" />}
            {uploadWorkspaceError || 'Đang chuẩn bị một bộ chứng từ trống để tải lên...'}
          </span>
          {uploadWorkspaceError && (
            <button
              type="button"
              onClick={() => initializeUploadWorkspace({ force: true })}
              className="btn-secondary px-3 py-1.5 text-xs"
            >
              <RefreshCw size={13} />
              Thử lại
            </button>
          )}
        </div>
      )}

      {/* Selected Batch Status Banner */}
      {uploadWorkspaceReady && (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-fg-muted">
            Đang tải cho bộ:
          </span>
          <span className="rounded-control bg-tone-brand-bg px-2.5 py-1 font-mono text-sm font-bold text-tone-brand-fg">
            {selectedBatch?.batch_number || 'Chưa chọn bộ'}
          </span>
          {selectedBatch && (
            isBatchReady(selectedBatch) ? (
              <span className="inline-flex items-center gap-1.5 rounded-control bg-tone-success-bg px-2.5 py-0.5 text-xs font-semibold text-tone-success-fg">
                <CheckCircle2 size={12} />
                Đã đủ chứng từ & hoàn tất bóc tách
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-control bg-tone-neutral-bg px-2.5 py-0.5 text-xs font-semibold text-tone-neutral-fg">
                <AlertCircle size={12} />
                Cần bổ sung chứng từ
              </span>
            )
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedBatch && isBatchReady(selectedBatch) && (
            <button
              type="button"
              onClick={() => handleViewReconciliation(selectedBatch)}
              className="btn-primary inline-flex items-center gap-1.5 text-xs py-2 px-4 font-semibold shadow-card"
            >
              <Eye size={14} />
              Xem đối soát ngay
              <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>
      )}

      {/* Select Document Type with Unified Auto Drop Zone */}
      <div
        ref={documentTypesRef}
        onDragEnter={(event) => handleTypeDragEnter(event, AUTO_DOC_TYPE)}
        onDragOver={(event) => handleTypeDragOver(event, AUTO_DOC_TYPE)}
        onDragLeave={handleTypeDragLeave}
        onDrop={(event) => handleDrop(event, AUTO_DOC_TYPE)}
        className={`space-y-3.5 scroll-mt-6 rounded-card transition-all ${
          isAutoDropActive
            ? 'ring-2 ring-focus bg-tone-brand-bg'
            : ''
        }`}
      >
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {DOC_TYPES.map((type) => {
            const Icon = type.icon;
            const uploadedFiles = uploadedFilesByType[type.value] || [];
            const isReadingThisType = uploadedFiles.some((f) => isFileBeingRead(f));

            return (
              <div
                key={type.value}
                data-testid={`card-${type.value}`}
                className={`flex flex-col items-start rounded-card border px-3 py-2.5 text-left transition-colors ${
                  isReadingThisType ? 'border-tone-brand-line bg-tone-brand-bg' : 'border-line bg-surface'
                }`}
              >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-fg">
                  <Icon size={16} className="shrink-0 text-fg-subtle" aria-hidden="true" />
                  <span className="truncate">{type.label}</span>
                </span>
                {isReadingThisType ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-tone-brand-fg">
                    <Loader2 size={11} className="animate-spin" aria-hidden="true" />
                    Đang đọc
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-fg-subtle">
                    {uploadedFiles.length ? `${uploadedFiles.length} file` : 'Chưa có'}
                  </span>
                )}
              </div>

              {uploadedFiles.length > 0 && (
                <div className="mt-2 w-full border-t border-line pt-2">
                  <div className="space-y-1.5">
                    {uploadedFiles.map((file, index) => {
                      const fileBeingRead = isFileBeingRead(file);

                      if (fileBeingRead) {
                        return (
                          <div
                            key={file.id || `${file.filename}-${index}`}
                            className="flex w-full flex-col gap-1.5 rounded-control border border-tone-brand-line bg-tone-brand-bg p-2.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <Loader2 size={13} className="shrink-0 animate-spin text-primary" />
                                <span className="truncate text-xs font-semibold text-tone-brand-fg" title={file.filename}>
                                  {file.filename}
                                </span>
                              </div>
                              {file.size && (
                                <span className="shrink-0 rounded bg-tone-brand-bg px-1.5 py-0.5 text-[10px] font-bold text-tone-brand-fg">
                                  {file.size}
                                </span>
                              )}
                            </div>
                            <p className="flex items-center gap-1.5 text-xs font-semibold text-tone-brand-fg">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
                              Đang đọc và bóc tách dữ liệu AI...
                            </p>
                          </div>
                        );
                      }

                      if (file.status === 'error') {
                        return (
                          <div
                            key={file.id || `${file.filename}-${index}`}
                            className="flex w-full flex-col gap-1 rounded-control border border-tone-danger-line bg-tone-danger-bg p-2.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-xs font-semibold text-tone-danger-fg">{file.filename}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDismissInFlightError(file.id);
                                }}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-tone-danger-fg hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                                title="Đóng thông báo"
                                aria-label={`Đóng thông báo lỗi của ${file.filename}`}
                              >
                                <X size={15} aria-hidden="true" />
                              </button>
                            </div>
                            <p className="text-xs font-medium text-tone-danger-fg">
                              {file.error_message || 'Tải lên hoặc đọc file thất bại'}
                            </p>
                          </div>
                        );
                      }

                      // Completed file
                      const isLowQualityFile = file.ai_extraction?.status === 'low_quality';
                      const lowQualityMessage =
                        file.ai_extraction?.validation_message
                        || 'Chất lượng file thấp, dữ liệu trích xuất có thể không chính xác. Vui lòng kiểm tra lại dữ liệu trích xuất.';
                      return (
                        <div
                          key={file.id || `${file.filename}-${index}`}
                          className={`flex w-full flex-col gap-2 rounded-control border px-2.5 py-2 ${
                            isLowQualityFile
                              ? 'border-tone-neutral-line bg-tone-neutral-bg'
                              : 'border-line bg-surface-muted'
                          }`}
                        >
                          <div className="flex w-full items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleOpenUploadedFile(file);
                              }}
                              className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs font-semibold text-fg transition-colors hover:text-primary"
                              title="Bấm để mở xem file"
                            >
                              <CheckCircle2 size={14} className="shrink-0 text-tone-success-fg" />
                              <span className="truncate">{file.filename}</span>
                              <ExternalLink size={12} className="shrink-0 text-fg-subtle" />
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDeleteUploadedFile(file);
                              }}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-fg-subtle hover:bg-tone-danger-bg hover:text-tone-danger-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                              title="Xóa file"
                              aria-label={`Xóa file ${file.filename}`}
                            >
                              <X size={15} aria-hidden="true" />
                            </button>
                          </div>
                          {isLowQualityFile && (
                            <p className="flex items-start gap-1.5 text-xs leading-4 text-fg">
                              <AlertCircle size={13} className="mt-0.5 shrink-0 text-tone-neutral-fg" aria-hidden="true" />
                              <span><strong>Cần kiểm tra dữ liệu đọc:</strong> {lowQualityMessage}</span>
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              </div>
            );
          })}
        </div>

        <div
          role="button"
          tabIndex={uploadWorkspaceReady ? 0 : -1}
          aria-disabled={!uploadWorkspaceReady}
          aria-label="Kéo thả hoặc chọn file PO, hóa đơn, phiếu nhập kho (XML, PDF, JPG, PNG)"
          data-testid="drop-zone-auto"
          onClick={() => handleChooseFiles(AUTO_DOC_TYPE)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handleChooseFiles(AUTO_DOC_TYPE);
            }
          }}
          onDragEnter={(event) => handleTypeDragEnter(event, AUTO_DOC_TYPE)}
          onDragOver={(event) => handleTypeDragOver(event, AUTO_DOC_TYPE)}
          onDragLeave={handleTypeDragLeave}
          onDrop={(event) => handleDrop(event, AUTO_DOC_TYPE)}
          className={`flex min-h-[128px] cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed p-4 text-center transition-all ${
            !uploadWorkspaceReady ? 'pointer-events-none opacity-60 ' : ''
          }${
            isAutoDropActive
              ? 'border-primary bg-tone-brand-bg shadow-card ring-4 ring-focus'
              : isAutoReading
              ? 'border-primary bg-tone-brand-bg shadow-card ring-2 ring-focus'
              : 'border-tone-neutral-line bg-surface hover:border-tone-brand-line hover:bg-tone-brand-bg'
          }`}
        >
          <div className="flex flex-col items-center justify-center gap-2">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-card ${
              isAutoReading || isAutoDropActive
                ? 'bg-primary text-primary-fg'
                : 'bg-surface-muted text-fg-subtle'
            }`}>
              {isAutoReading ? <Loader2 size={20} className="animate-spin" /> : <UploadCloud size={21} />}
            </div>
            <p className="text-sm font-bold text-fg">Kéo thả hoặc chọn file chứng từ</p>
            <p className="text-xs text-fg-muted">PO, hóa đơn, phiếu nhập kho · XML, PDF, JPG, PNG · hệ thống tự nhận loại</p>
          </div>

          {autoUploadFiles.length > 0 && (
            <div className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-2 lg:grid-cols-3">
              {autoUploadFiles.map((file) => {
                const isProcessing = file.status === 'processing';
                return (
                  <div
                    key={file.tempId}
                    className={`flex min-w-0 flex-col gap-1.5 rounded-control border p-2.5 ${
                      isProcessing
                        ? 'border-tone-brand-line bg-tone-brand-bg'
                        : 'border-tone-danger-line bg-tone-danger-bg'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        {isProcessing ? (
                          <Loader2 size={13} className="shrink-0 animate-spin text-primary" />
                        ) : (
                          <AlertCircle size={13} className="shrink-0 text-tone-danger-fg" />
                        )}
                        <span
                          className={`truncate text-xs font-semibold ${
                            isProcessing ? 'text-tone-brand-fg' : 'text-tone-danger-fg'
                          }`}
                          title={file.filename}
                        >
                          {file.filename}
                        </span>
                      </div>
                      {!isProcessing && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDismissInFlightError(file.tempId);
                          }}
                          className="text-tone-danger-fg hover:text-tone-danger-fg"
                          title="Đóng thông báo"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                    <p
                      className={`text-xs font-semibold ${
                        isProcessing ? 'text-tone-brand-fg' : 'text-tone-danger-fg'
                      }`}
                    >
                      {isProcessing
                        ? 'Đang đọc và tự nhận dạng loại chứng từ...'
                        : file.errorMessage || AUTO_UPLOAD_ERROR_MESSAGE}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".xml,.pdf,.png,.jpg,.jpeg"
          onChange={handleFileSelect}
          disabled={!uploadWorkspaceReady}
          className="hidden"
        />
      </div>

      <div className="rounded-card border border-line bg-surface p-3.5 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <div>
            <label htmlFor="batch-note" className="text-sm font-bold text-fg">
              Ghi chú
            </label>
          </div>
          <span className="text-xs font-semibold text-fg-subtle">
            {batchNoteDraft.length}/{BATCH_NOTE_MAX_LENGTH}
          </span>
        </div>
        <textarea
          id="batch-note"
          value={batchNoteDraft}
          onChange={handleBatchNoteChange}
          onBlur={handleBatchNoteBlur}
          disabled={!selectedBatch}
          rows={2}
          maxLength={BATCH_NOTE_MAX_LENGTH}
          placeholder="Ví dụ: Bộ chứng từ đối chiếu hóa đơn công ty A..."
          className="mt-2 w-full resize-none rounded-control border border-line bg-surface-muted px-3 py-2 text-sm text-fg outline-none transition focus:bg-surface focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-60"
        />
        <div className="mt-2 min-h-[18px] text-xs">
          {batchNoteError ? (
            <span className="font-semibold text-tone-danger-fg">{batchNoteError}</span>
          ) : batchNoteSaving ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
              <Loader2 size={12} className="animate-spin" />
              Đang lưu ghi chú...
            </span>
          ) : selectedBatch && batchNoteDraft === lastSavedBatchNote ? (
            <span className="font-medium text-fg-subtle">Ghi chú được tự động lưu.</span>
          ) : null}
        </div>
      </div>

      {/* Batches Queue Table */}
      <div className="card overflow-hidden">
        <div className="border-b border-line px-5 py-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-fg">
              Danh sách bộ đối soát ({batches.length} bộ)
            </h2>
            <p className="mt-0.5 text-xs text-fg-subtle">
              Chọn một bộ để bổ sung PO, hóa đơn hoặc phiếu nhập kho còn thiếu.
            </p>
          </div>
          <div className="flex items-center gap-1.5 self-start sm:self-center bg-surface-muted p-1 rounded-control">
            <button
              type="button"
              onClick={() => { setBatchFilterTab('incomplete'); setBatchPage(1); }}
              className={`px-3 py-1 text-xs font-semibold rounded-control transition-colors ${
                batchFilterTab === 'incomplete'
                  ? 'bg-surface text-tone-brand-fg shadow-card'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              Chờ xử lý ({activeBatches.length})
            </button>
            <button
              type="button"
              onClick={() => { setBatchFilterTab('ready'); setBatchPage(1); }}
              className={`px-3 py-1 text-xs font-semibold rounded-control transition-colors ${
                batchFilterTab === 'ready'
                  ? 'bg-surface text-tone-brand-fg shadow-card'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              Đã hoàn tất ({readyBatches.length})
            </button>
            <button
              type="button"
              onClick={() => { setBatchFilterTab('all'); setBatchPage(1); }}
              className={`px-3 py-1 text-xs font-semibold rounded-control transition-colors ${
                batchFilterTab === 'all'
                  ? 'bg-surface text-tone-brand-fg shadow-card'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              Tất cả ({batches.length})
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="animate-spin text-primary" size={24} />
            <span className="text-xs text-fg-subtle ml-2">Đang tải danh sách...</span>
          </div>
        ) : filteredBatches.length === 0 ? (
          <div className="text-center py-12 text-fg-subtle text-xs">
            {batchFilterTab === 'incomplete'
              ? 'Không có bộ nào đang chờ bổ sung chứng từ.'
              : batchFilterTab === 'ready'
              ? 'Chưa có bộ nào hoàn tất đủ 3 chứng từ.'
              : 'Chưa có bộ đối soát nào. Hãy kéo file vào vùng tải chứng từ để tạo bộ đầu tiên.'}
          </div>
        ) : (
          <div className="divide-y divide-line max-h-[480px] overflow-y-auto">
            {paginatedBatches.map((batch) => {
              const isSelectedBatch = selectedBatch?.id === batch.id;
              const filesByType = (batch.files || []).reduce((acc, file) => {
                if (!file.doc_type) return acc;
                acc[file.doc_type] = [...(acc[file.doc_type] || []), file];
                return acc;
              }, {});
              const canDeleteBatch = (batch.files || []).length === 0;
              const isDeletingBatch = deletingBatchIds.includes(batch.id);
              const batchDocState = getBatchDocState(batch);
              const missingCount = batchDocState.missingDocTypes.length;
              const isReady = isBatchReady(batch);
              const batchInFlight = inFlightFiles.filter((inf) => String(inf.batchId) === String(batch.id));
              const hasInFlight = batchInFlight.some((inf) => inf.status === 'processing');

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
                  className={`block w-full px-5 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset ${
                    isSelectedBatch
                      ? 'bg-tone-brand-bg ring-1 ring-inset ring-focus shadow-card'
                      : 'hover:bg-surface-muted'
                  } group relative cursor-pointer pr-14`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 shrink-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-fg">
                          {batch.batch_number}
                        </p>
                        {!isReady && (
                          <span
                            className={`rounded-control px-2 py-0.5 text-xs font-semibold ${
                              hasInFlight
                                ? 'bg-tone-brand-bg text-tone-brand-fg'
                                : 'border border-tone-neutral-line bg-tone-neutral-bg text-tone-neutral-fg'
                            }`}
                          >
                            {hasInFlight ? 'Đang đọc file...' : `Thiếu ${missingCount} chứng từ`}
                          </span>
                        )}
                        {isReady && batchFilterTab !== 'incomplete' && (
                          <span className="rounded-control bg-tone-success-bg px-2 py-0.5 text-xs font-semibold text-tone-success-fg">
                            Đã hoàn tất
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-fg-subtle">
                        Cập nhật: {formatDateTime(batch.updated_at || batch.created_at)}
                      </p>
                      {batch.note && (
                        <p className="mt-1 max-w-sm truncate text-xs font-medium text-fg-muted" title={batch.note}>
                          {batch.note}
                        </p>
                      )}
                    </div>

                    <div className="grid min-w-0 flex-1 grid-cols-1 gap-2.5 sm:grid-cols-3">
                      {DOC_TYPES.map((type) => {
                        const filesForType = filesByType[type.value] || [];
                        const file = filesForType[0];
                        const typeInFlight = batchInFlight.find((inf) => inf.docType === type.value && inf.status === 'processing');
                        const fileBeingRead = Boolean(typeInFlight) || isFileBeingRead(file) || batchDocState.pendingExtractionDocTypes.includes(type.value);
                        const isWrongType = Boolean(file?.ai_extraction && !file.ai_extraction.is_correct_type);
                        const fileLabel = filesForType.length > 1 ? `${filesForType.length} file đã nhận` : file?.filename;

                        return (
                          <span
                            key={type.value}
                            className={`min-w-0 rounded-control border px-3 py-2 text-xs transition-colors ${
                              fileBeingRead
                                ? 'border-tone-brand-line bg-tone-brand-bg text-tone-brand-fg'
                                : isWrongType
                                ? 'border-tone-danger-line bg-tone-danger-bg text-tone-danger-fg'
                                : file
                                ? 'border-tone-success-line bg-tone-success-bg text-tone-success-fg'
                                : 'border-line bg-surface-muted text-fg-subtle'
                            }`}
                            title={typeInFlight?.filename || fileLabel || 'Chưa có chứng từ'}
                          >
                            <span className="block font-semibold whitespace-nowrap truncate">{type.label}</span>
                            <span className="mt-0.5 block truncate text-xs">
                              {typeInFlight?.filename || fileLabel || (fileBeingRead ? 'Đã nhận file' : 'Chưa có chứng từ')}
                            </span>
                            {fileBeingRead ? (
                              <span className="mt-1 flex items-center gap-1 font-semibold text-primary whitespace-nowrap">
                                <Loader2 size={11} className="animate-spin" />
                                Đang đọc file
                              </span>
                            ) : isWrongType ? (
                              <span className="mt-1 flex items-center gap-1 font-semibold text-tone-danger-fg whitespace-nowrap">
                                <AlertCircle size={11} aria-hidden="true" />
                                Sai loại file
                              </span>
                            ) : file ? (
                              <span className="mt-1 flex items-center gap-1 font-semibold text-tone-success-fg whitespace-nowrap">
                                <CheckCircle2 size={11} />
                                Đã bóc tách
                              </span>
                            ) : null}
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
                      className="absolute right-4 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-control text-fg-subtle opacity-0 transition-all hover:bg-tone-danger-bg hover:text-tone-danger-fg focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50 group-hover:opacity-100"
                      title="Xóa bộ chứng từ"
                      aria-label={`Xóa bộ chứng từ ${batch.batch_number}`}
                    >
                      {isDeletingBatch ? <Loader2 size={14} className="animate-spin" /> : <X size={15} />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {filteredBatches.length > BATCHES_PER_PAGE && (
          <div className="flex flex-col gap-3 border-t border-line px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-fg-subtle">
              Hiển thị {batchStartIndex}-{batchEndIndex} / {filteredBatches.length} bộ
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setBatchPage((page) => Math.max(1, page - 1))}
                disabled={safeBatchPage === 1}
                className="rounded-control border border-line px-3 py-1.5 text-xs font-semibold text-fg-muted transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-45"
              >
                Trước
              </button>
              <span className="min-w-[72px] text-center text-xs font-semibold text-fg-muted">
                {safeBatchPage} / {totalBatchPages}
              </span>
              <button
                type="button"
                onClick={() => setBatchPage((page) => Math.min(totalBatchPages, page + 1))}
                disabled={safeBatchPage === totalBatchPages}
                className="rounded-control border border-line px-3 py-1.5 text-xs font-semibold text-fg-muted transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-45"
              >
                Sau
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        tone="danger"
        title={pendingDelete?.kind === 'file' ? 'Xóa file chứng từ' : 'Xóa bộ chứng từ trống'}
        description={
          pendingDelete?.kind === 'file'
            ? `File "${pendingDelete.item.filename}" sẽ bị xóa khỏi bộ và kết quả đối soát được tính lại.`
            : pendingDelete
              ? `Bộ "${pendingDelete.item.batch_number}" sẽ bị xóa. Thao tác này không hoàn tác được.`
              : ''
        }
        confirmLabel="Xóa"
        loading={isDeletingPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmPendingDelete}
      />
    </div>
  );
}
