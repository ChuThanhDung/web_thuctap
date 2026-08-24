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

const DOC_TYPES = [
  { value: 'po', label: 'Đơn đặt hàng (PO)', icon: ShoppingCart },
  { value: 'invoice', label: 'Hóa đơn (Invoice)', icon: FileText },
  { value: 'grn', label: 'Phiếu nhập kho (GRN)', icon: PackageCheck },
];
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
  const [searchParams] = useSearchParams();
  const requestedBatchId = searchParams.get('batchId');
  const isSupplementMode = Boolean(requestedBatchId && searchParams.get('mode') === 'supplement');
  const cached = getCachedBatches();
  const [batches, setBatches] = useState(() => cached?.items || []);
  const [loading, setLoading] = useState(() => !cached);
  const [inFlightFiles, setInFlightFiles] = useState([]);
  const [activeDropType, setActiveDropType] = useState(null);
  const [selectedDocType, setSelectedDocType] = useState('po');
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

      // In-flight files take visual precedence or appear alongside completed
      acc[type.value] = inFlight.length > 0 ? inFlight : completed;
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
          throw new Error('Không tìm thấy batch cần tải bổ sung hoặc bạn không còn quyền truy cập.');
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
      alert(err.message || 'Không thể tạo bộ đối soát mới.');
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
          ...(batch.files || []).filter((file) => file.id !== uploadedFile.id && file.doc_type !== uploadedFile.doc_type),
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
          rejection_note: batch.status === 'rejected' ? null : batch.rejection_note,
          rejectionNote: batch.status === 'rejected' ? null : batch.rejectionNote,
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

    // Tiến hành upload từng file lên BE
    for (let i = 0; i < filesArray.length; i++) {
      const fileObj = filesArray[i];
      const trackingItem = newTrackingItems[i];

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
        
        // Đồng bộ lại với backend
        await fetchBatches(false, true);
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
    }
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
      alert(err.message || 'Không thể xóa batch này. Vui lòng thử lại.');
    } finally {
      setDeletingBatchIds((prev) => prev.filter((id) => id !== batch.id));
    }
  };

  // Navigating to audit-trail marks the batch as viewed, moving it to "Đã hoàn tất"
  const handleViewReconciliation = (batch) => {
    if (!batch?.id) return;
    setViewedBatchIds((prev) => new Set([...prev, batch.id]));
    navigate(`/audit-trail?batchId=${batch.id}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Tải lên & Xử lý chứng từ</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Tải lên đơn đặt hàng PO, hóa đơn (.xml, .pdf, .png) hoặc phiếu nhập kho GRN để AI tự động bóc tách và đối soát.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => initializeUploadWorkspace({ force: true })}
            disabled={!uploadWorkspaceReady && !uploadWorkspaceError}
            className="btn-secondary inline-flex items-center gap-1.5 text-xs py-2 px-3"
            title="Làm mới dữ liệu"
          >
            <RefreshCw size={13} />
            Làm mới
          </button>
          <button
            type="button"
            onClick={handleCreateBatch}
            disabled={!uploadWorkspaceReady}
            className="btn-primary inline-flex items-center gap-1.5 text-xs py-2 px-3.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus size={14} />
            Tạo bộ mới
          </button>
        </div>
      </div>

      {!uploadWorkspaceReady && (
        <div
          role={uploadWorkspaceError ? 'alert' : 'status'}
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            uploadWorkspaceError
              ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300'
              : 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-900 dark:bg-brand-950/30 dark:text-brand-300'
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">
            Đang tải cho bộ:
          </span>
          <span className="rounded-md bg-brand-50 px-2.5 py-1 font-mono text-sm font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
            {selectedBatch?.batch_number || 'Chưa chọn bộ'}
          </span>
          {selectedBatch && (
            isBatchReady(selectedBatch) ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <CheckCircle2 size={12} />
                Đã đủ chứng từ & hoàn tất bóc tách
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
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
              className="btn-primary inline-flex items-center gap-1.5 text-xs py-2 px-4 font-semibold shadow-sm"
            >
              <Eye size={14} />
              Xem đối soát ngay
              <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>
      )}

      {/* Select Document Type with Drop Zones */}
      <div ref={documentTypesRef} className="highlight-box-info grid grid-cols-1 md:grid-cols-3 gap-3.5 scroll-mt-6">
        {DOC_TYPES.map((type) => {
          const isSelected = selectedDocType === type.value;
          const isDropActive = activeDropType === type.value;
          const Icon = type.icon;
          const uploadedFiles = uploadedFilesByType[type.value] || [];
          const isReadingThisType = uploadedFiles.some((f) => isFileBeingRead(f));

          return (
            <div
              key={type.value}
              role="button"
              tabIndex={uploadWorkspaceReady ? 0 : -1}
              aria-disabled={!uploadWorkspaceReady}
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
              className={`flex flex-col items-start text-left p-4 rounded-xl border-2 transition-all cursor-pointer ${
                !uploadWorkspaceReady ? 'pointer-events-none opacity-60 ' : ''
              }${
                isDropActive
                  ? 'border-brand-500 bg-brand-50 shadow-md ring-4 ring-brand-100 dark:border-brand-400 dark:bg-brand-950/30 dark:ring-brand-950'
                  : isReadingThisType
                  ? 'border-brand-400 bg-brand-50/50 shadow-sm ring-2 ring-brand-100 dark:border-brand-500 dark:bg-brand-950/20 dark:ring-brand-950'
                  : isSelected
                  ? 'border-brand-500 bg-white shadow-md dark:bg-slate-800 dark:border-brand-400'
                  : 'border-slate-200/80 bg-white/70 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <div className={`p-2 rounded-lg transition-colors ${
                  isReadingThisType
                    ? 'bg-brand-600 text-white dark:bg-brand-500 animate-pulse'
                    : isSelected || isDropActive
                    ? 'bg-brand-600 text-white dark:bg-brand-500'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  <Icon size={18} />
                </div>
                {isReadingThisType && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                    <Loader2 size={11} className="animate-spin" />
                    Đang đọc file
                  </span>
                )}
              </div>

              <span className="mt-3 font-bold text-sm text-slate-900 dark:text-slate-100">{type.label}</span>

              {uploadedFiles.length > 0 && (
                <div className="mt-3 w-full border-t border-slate-200/80 pt-2.5 dark:border-slate-700">
                  <div className="space-y-1.5">
                    {uploadedFiles.map((file, index) => {
                      const fileBeingRead = isFileBeingRead(file);

                      if (fileBeingRead) {
                        return (
                          <div
                            key={file.id || `${file.filename}-${index}`}
                            className="flex w-full flex-col gap-1.5 rounded-lg border border-brand-200 bg-brand-50/90 p-2.5 dark:border-brand-800 dark:bg-brand-950/40"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <Loader2 size={13} className="shrink-0 animate-spin text-brand-600 dark:text-brand-400" />
                                <span className="truncate text-xs font-semibold text-brand-950 dark:text-brand-100" title={file.filename}>
                                  {file.filename}
                                </span>
                              </div>
                              {file.size && (
                                <span className="shrink-0 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-900/60 dark:text-brand-300">
                                  {file.size}
                                </span>
                              )}
                            </div>
                            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-700 dark:text-brand-300">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-500 animate-ping" />
                              Đang đọc và bóc tách dữ liệu AI...
                            </p>
                          </div>
                        );
                      }

                      if (file.status === 'error') {
                        return (
                          <div
                            key={file.id || `${file.filename}-${index}`}
                            className="flex w-full flex-col gap-1 rounded-lg border border-rose-200 bg-rose-50 p-2.5 dark:border-rose-900 dark:bg-rose-950/30"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-xs font-semibold text-rose-800 dark:text-rose-200">{file.filename}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDismissInFlightError(file.id);
                                }}
                                className="text-rose-600 hover:text-rose-800"
                                title="Đóng thông báo"
                              >
                                <X size={13} />
                              </button>
                            </div>
                            <p className="text-[11px] font-medium text-rose-600 dark:text-rose-300">
                              {file.error_message || 'Tải lên hoặc đọc file thất bại'}
                            </p>
                          </div>
                        );
                      }

                      // Completed file
                      return (
                        <div
                          key={file.id || `${file.filename}-${index}`}
                          className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/90 px-2.5 py-2 dark:border-slate-800 dark:bg-slate-900"
                        >
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleOpenUploadedFile(file);
                            }}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs font-semibold text-slate-800 transition-colors hover:text-brand-600 dark:text-slate-200 dark:hover:text-brand-400"
                            title="Bấm để mở xem file"
                          >
                            <CheckCircle2 size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                            <span className="truncate">{file.filename}</span>
                            <ExternalLink size={12} className="shrink-0 text-slate-400" />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteUploadedFile(file);
                            }}
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                            title="Xóa file"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {uploadedFiles.length === 0 && (
                <div className="mt-3 w-full border-t border-slate-200/80 pt-2.5 dark:border-slate-700">
                  <p className="rounded-md bg-amber-50/80 px-2.5 py-1.5 text-xs font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                    Chưa có chứng từ (kéo thả file vào đây)
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
          disabled={!uploadWorkspaceReady}
          className="hidden"
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-2">
          <div>
            <label htmlFor="batch-note" className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Note
            </label>
          </div>
          <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
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
          placeholder="Ví dụ: Batch đối chiếu hóa đơn công ty A..."
          className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-brand-500 dark:focus:bg-slate-900 dark:focus:ring-brand-950"
        />
        <div className="mt-2 min-h-[18px] text-xs">
          {batchNoteError ? (
            <span className="font-semibold text-rose-600 dark:text-rose-300">{batchNoteError}</span>
          ) : batchNoteSaving ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-brand-600 dark:text-brand-300">
              <Loader2 size={12} className="animate-spin" />
              Đang lưu ghi chú...
            </span>
          ) : selectedBatch && batchNoteDraft === lastSavedBatchNote ? (
            <span className="font-medium text-slate-400 dark:text-slate-500">Ghi chú được tự động lưu.</span>
          ) : null}
        </div>
      </div>

      {/* Batches Queue Table */}
      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Danh sách bộ đối soát ({batches.length} bộ)
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Chọn một bộ để bổ sung PO, hóa đơn hoặc phiếu nhập kho còn thiếu.
            </p>
          </div>
          <div className="flex items-center gap-1.5 self-start sm:self-center bg-slate-100 p-1 rounded-lg dark:bg-slate-800">
            <button
              type="button"
              onClick={() => { setBatchFilterTab('incomplete'); setBatchPage(1); }}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                batchFilterTab === 'incomplete'
                  ? 'bg-white text-brand-700 shadow-sm dark:bg-slate-900 dark:text-brand-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Chờ xử lý ({activeBatches.length})
            </button>
            <button
              type="button"
              onClick={() => { setBatchFilterTab('ready'); setBatchPage(1); }}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                batchFilterTab === 'ready'
                  ? 'bg-white text-brand-700 shadow-sm dark:bg-slate-900 dark:text-brand-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Đã hoàn tất ({readyBatches.length})
            </button>
            <button
              type="button"
              onClick={() => { setBatchFilterTab('all'); setBatchPage(1); }}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                batchFilterTab === 'all'
                  ? 'bg-white text-brand-700 shadow-sm dark:bg-slate-900 dark:text-brand-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Tất cả ({batches.length})
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="animate-spin text-brand-600 dark:text-brand-400" size={24} />
            <span className="text-xs text-slate-400 dark:text-slate-500 ml-2">Đang tải danh sách...</span>
          </div>
        ) : filteredBatches.length === 0 ? (
          <div className="text-center py-12 text-slate-400 dark:text-slate-500 text-xs">
            {batchFilterTab === 'incomplete'
              ? 'Không có bộ nào đang chờ bổ sung chứng từ.'
              : batchFilterTab === 'ready'
              ? 'Chưa có bộ nào hoàn tất đủ 3 chứng từ.'
              : 'Chưa có bộ đối soát nào. Hãy kéo file vào ô PO, Invoice hoặc GRN để tạo bộ đầu tiên.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto dark:divide-slate-800">
            {paginatedBatches.map((batch) => {
              const isSelectedBatch = selectedBatch?.id === batch.id;
              const filesByType = (batch.files || []).reduce((acc, file) => {
                if (!file.doc_type) return acc;
                if (!acc[file.doc_type]) {
                  acc[file.doc_type] = file;
                }
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
                  className={`block w-full px-5 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset ${
                    isSelectedBatch
                      ? 'bg-brand-50/80 ring-1 ring-inset ring-brand-300 shadow-[inset_4px_0_0_#4f46e5] dark:bg-brand-950/30 dark:ring-brand-700/80 dark:shadow-[inset_4px_0_0_#818cf8]'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'
                  } group relative cursor-pointer pr-14`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 shrink-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {batch.batch_number}
                        </p>
                        {!isReady && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              hasInFlight
                                ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300'
                                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                            }`}
                          >
                            {hasInFlight ? 'Đang đọc file...' : `Cần bổ sung ${missingCount} chứng từ`}
                          </span>
                        )}
                        {isReady && batchFilterTab !== 'incomplete' && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            Đã hoàn tất
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                        Cập nhật: {batch.updated_at || batch.created_at}
                      </p>
                      {batch.note && (
                        <p className="mt-1 max-w-sm truncate text-xs font-medium text-slate-600 dark:text-slate-300" title={batch.note}>
                          {batch.note}
                        </p>
                      )}
                    </div>

                    <div className="grid min-w-0 flex-1 grid-cols-1 gap-2.5 sm:grid-cols-3">
                      {DOC_TYPES.map((type) => {
                        const file = filesByType[type.value];
                        const typeInFlight = batchInFlight.find((inf) => inf.docType === type.value && inf.status === 'processing');
                        const fileBeingRead = Boolean(typeInFlight) || isFileBeingRead(file) || batchDocState.pendingExtractionDocTypes.includes(type.value);
                        const isWrongType = Boolean(file?.ai_extraction && !file.ai_extraction.is_correct_type);

                        return (
                          <span
                            key={type.value}
                            className={`min-w-0 rounded-lg border px-3 py-2 text-xs transition-colors ${
                              fileBeingRead
                                ? 'border-brand-200 bg-brand-50 text-brand-800 dark:border-brand-900 dark:bg-brand-950/30 dark:text-brand-300'
                                : isWrongType
                                ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300'
                                : file
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
                                : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                            }`}
                            title={typeInFlight?.filename || file?.filename || 'Chưa có chứng từ'}
                          >
                            <span className="block font-semibold whitespace-nowrap truncate">{type.label}</span>
                            <span className="mt-0.5 block truncate text-[11px]">
                              {typeInFlight?.filename || file?.filename || (fileBeingRead ? 'Đã nhận file' : 'Chưa có chứng từ')}
                            </span>
                            {fileBeingRead ? (
                              <span className="mt-1 flex items-center gap-1 font-semibold text-brand-600 dark:text-brand-300 whitespace-nowrap">
                                <Loader2 size={11} className="animate-spin" />
                                Đang đọc file
                              </span>
                            ) : isWrongType ? (
                              <span className="mt-1 flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400 whitespace-nowrap">
                                <AlertCircle size={11} />
                                Sai loại file
                              </span>
                            ) : file ? (
                              <span className="mt-1 flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
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

        {filteredBatches.length > BATCHES_PER_PAGE && (
          <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Hiển thị {batchStartIndex}-{batchEndIndex} / {filteredBatches.length} bộ
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
