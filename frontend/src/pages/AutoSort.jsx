import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Sparkles, Trash2, UploadCloud } from 'lucide-react';
import { applySort, deleteUploadedFile, getSortInbox, proposeSort, uploadDocument } from '../api.js';
import { ROUTES, batchDetail } from '../routes.js';
import { Button, PageHeader } from '../ui/index.js';
import { useToast } from '../ui/Toast.jsx';
import { cn } from '../ui/cn.js';

// Thả nhiều chứng từ lẫn lộn → trợ lý đề xuất các bộ PO · HĐ · GRN kèm lý do → người dùng sửa nếu cần → tạo bộ.
// Trợ lý chỉ đề xuất: chưa bấm "Tạo bộ" thì không có bộ nào được tạo.

const SLOTS = [
  { key: 'po', label: 'PO', name: 'Đơn đặt hàng' },
  { key: 'invoice', label: 'HĐ', name: 'Hóa đơn' },
  { key: 'grn', label: 'GRN', name: 'Phiếu nhập kho' },
];
const MAX_PARALLEL = 3;
const ACCEPT = '.xml,.pdf,.png,.jpg,.jpeg,.webp';

const formatMoney = (value) =>
  value === null || value === undefined || value === '' ? '' : `${Number(value).toLocaleString('vi-VN')} đ`;

function fileLine(file) {
  if (!file) return '';
  return [file.document_number, file.supplier_name, formatMoney(file.total_amount)].filter(Boolean).join(' · ');
}

export default function AutoSort({ token }) {
  const navigate = useNavigate();
  const toast = useToast();
  const inputRef = useRef(null);
  const [inbox, setInbox] = useState(null);
  const [uploading, setUploading] = useState([]);
  const [errors, setErrors] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [sorting, setSorting] = useState(false);
  const [proposal, setProposal] = useState(null);
  const [groups, setGroups] = useState([]);
  const [applying, setApplying] = useState(false);
  const [created, setCreated] = useState(null);

  const loadInbox = useCallback(async () => {
    try {
      setInbox(await getSortInbox(token));
    } catch (err) {
      toast.error(err.message);
    }
  }, [token, toast]);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  const files = useMemo(() => {
    const map = {};
    (inbox?.files || []).forEach((file) => {
      map[file.id] = file;
    });
    Object.entries(proposal?.files || {}).forEach(([id, file]) => {
      map[id] = file;
    });
    return map;
  }, [inbox, proposal]);

  const uploadFiles = async (fileList) => {
    if (!inbox) return;
    const queue = Array.from(fileList);
    if (!queue.length) return;
    setProposal(null);
    setCreated(null);
    setUploading((current) => [...current, ...queue.map((file) => file.name)]);
    const failed = [];
    let next = 0;
    const worker = async () => {
      while (next < queue.length) {
        const file = queue[next];
        next += 1;
        try {
          await uploadDocument(token, file, 'auto', inbox.batch_id);
        } catch (err) {
          failed.push({ name: file.name, message: err.message });
        } finally {
          setUploading((current) => {
            const index = current.indexOf(file.name);
            return index === -1 ? current : [...current.slice(0, index), ...current.slice(index + 1)];
          });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, queue.length) }, worker));
    setErrors(failed);
    await loadInbox();
  };

  const removeFile = async (fileId) => {
    try {
      await deleteUploadedFile(token, fileId);
      setProposal(null);
      await loadInbox();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const runSort = async () => {
    setSorting(true);
    try {
      const result = await proposeSort(token);
      setProposal(result);
      setGroups(result.groups.map((group) => ({ ...group, files: { ...group.files } })));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSorting(false);
    }
  };

  // Đổi file ở một ô: file đó rời nhóm cũ (nếu có), file đang ở ô này trở về "chưa xếp".
  const assign = (groupIndex, slot, value) => {
    const fileId = value ? Number(value) : null;
    setGroups((current) =>
      current.map((group, index) => {
        const nextFiles = { ...group.files };
        if (fileId && index !== groupIndex && nextFiles[slot] === fileId) nextFiles[slot] = null;
        if (index === groupIndex) nextFiles[slot] = fileId;
        return { ...group, files: nextFiles, edited: index === groupIndex ? true : group.edited };
      }),
    );
  };

  const placedIds = new Set(groups.flatMap((group) => Object.values(group.files).filter(Boolean)));
  const allIds = Object.keys(files).map(Number);
  const unplaced = allIds.filter((id) => !placedIds.has(id));
  const usableGroups = groups.filter((group) => Object.values(group.files).filter(Boolean).length >= 1);

  const createBatches = async () => {
    setApplying(true);
    try {
      const result = await applySort(
        token,
        usableGroups.map((group) => group.files),
      );
      setCreated(result.batches);
      setProposal(null);
      setGroups([]);
      await loadInbox();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setApplying(false);
    }
  };

  const inboxFiles = inbox?.files || [];
  const busy = uploading.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <PageHeader
        title="Tự xếp bộ"
        description="Thả cùng lúc chứng từ của nhiều giao dịch. Trợ lý đọc số đơn hàng, MST, mặt hàng để ghép thành từng bộ PO · HĐ · GRN; bạn xem lại rồi mới tạo bộ."
        actions={
          <Button variant="secondary" leadingIcon={ArrowLeft} onClick={() => navigate(ROUTES.upload)}>
            Tải từng bộ
          </Button>
        }
      />

      {created && (
        <div role="status" className="rounded-card border border-tone-success-line bg-tone-success-bg px-4 py-3 text-sm text-tone-success-fg">
          <p className="font-semibold">Đã tạo {created.length} bộ đối soát.</p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {created.map((batch) => (
              <li key={batch.id}>
                <button type="button" className="underline underline-offset-2" onClick={() => navigate(batchDetail(batch.id))}>
                  {batch.batch_number}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <section aria-labelledby="sort-files" className="rounded-card border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 id="sort-files" className="text-sm font-semibold text-fg">
            Chứng từ chờ xếp <span className="font-normal text-fg-muted">({inboxFiles.length})</span>
          </h2>
          <Button
            variant="primary"
            leadingIcon={Sparkles}
            loading={sorting}
            disabled={inboxFiles.length < 2 || busy}
            onClick={runSort}
          >
            Xếp bộ
          </Button>
        </div>

        <label
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            uploadFiles(event.dataTransfer.files);
          }}
          className={cn(
            'm-4 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-control border border-dashed px-4 py-6 text-center text-sm transition-colors focus-within:ring-2 focus-within:ring-focus',
            dragging ? 'border-primary bg-tone-brand-bg' : 'border-line-input bg-surface-muted hover:border-primary',
          )}
        >
          <UploadCloud size={20} className="text-fg-subtle" aria-hidden="true" />
          <span className="font-semibold text-fg">Kéo thả hoặc chọn nhiều file</span>
          <span className="text-xs text-fg-muted">XML đọc ngay trên máy chủ; PDF và ảnh được AI đọc như khi tải từng bộ.</span>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            disabled={!inbox}
            onChange={(event) => {
              uploadFiles(event.target.files);
              event.target.value = '';
            }}
          />
        </label>

        {(busy || errors.length > 0) && (
          <div className="mx-4 mb-3 space-y-1 text-sm">
            {busy && (
              <p role="status" className="flex items-center gap-2 text-fg-muted">
                <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Đang đọc {uploading.length} file…
              </p>
            )}
            {errors.map((error) => (
              <p key={error.name} role="alert" className="flex items-start gap-2 text-tone-danger-fg">
                <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  <span className="font-semibold">{error.name}</span>: {error.message}
                </span>
              </p>
            ))}
          </div>
        )}

        {inboxFiles.length > 0 && !proposal && (
          <ul className="divide-y divide-line border-t border-line">
            {inboxFiles.map((file) => (
              <li key={file.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="w-10 shrink-0 text-xs font-semibold text-fg-muted">{file.doc_label}</span>
                <span className="min-w-0 flex-1 truncate text-fg">{fileLine(file) || file.filename}</span>
                <button
                  type="button"
                  aria-label={`Bỏ file ${file.filename}`}
                  onClick={() => removeFile(file.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-fg-subtle hover:text-tone-danger-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {proposal && (
        <section aria-labelledby="sort-proposal" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="sort-proposal" className="text-base font-semibold text-fg">
                Đề xuất {groups.length} bộ
              </h2>
              <p className="text-sm text-fg-muted">
                {proposal.ai_used
                  ? 'Phần lớn ghép bằng quy tắc; AI phân xử các file khớp với nhiều bộ.'
                  : 'Ghép bằng quy tắc (số đơn hàng, MST, mặt hàng), không cần gọi AI.'}{' '}
                Đổi file ở từng ô nếu thấy sai.
              </p>
              {proposal.ai_note && <p className="mt-1 text-sm text-fg-muted">{proposal.ai_note}</p>}
            </div>
            <Button variant="primary" loading={applying} disabled={!usableGroups.length} onClick={createBatches}>
              Tạo {usableGroups.length} bộ
            </Button>
          </div>

          <ol className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {groups.map((group, groupIndex) => (
              <li key={groupIndex} className="rounded-card border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold text-fg">Bộ {groupIndex + 1}</h3>
                  {Object.values(group.files).filter(Boolean).length === 3 && !group.needs_review ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-tone-success-fg">
                      <CheckCircle2 size={13} aria-hidden="true" /> Đủ 3 liên
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-fg-muted">Cần bạn kiểm tra</span>
                  )}
                </div>
                <dl className="mt-3 space-y-2">
                  {SLOTS.map((slot) => {
                    const current = group.files[slot.key];
                    const options = allIds.filter(
                      (id) => files[id]?.doc_type === slot.key && (id === current || !placedIds.has(id)),
                    );
                    return (
                      <div key={slot.key} className="grid grid-cols-[2.5rem_1fr] items-center gap-2">
                        <dt className="text-xs font-semibold text-fg-muted">
                          <abbr title={slot.name} className="no-underline">
                            {slot.label}
                          </abbr>
                        </dt>
                        <dd className="min-w-0">
                          <select
                            aria-label={`${slot.name} của bộ ${groupIndex + 1}`}
                            value={current || ''}
                            onChange={(event) => assign(groupIndex, slot.key, event.target.value)}
                            className="h-9 w-full truncate rounded-control border border-line bg-surface px-2 text-sm text-fg focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                          >
                            <option value="">— Chưa có —</option>
                            {options.map((id) => (
                              <option key={id} value={id}>
                                {fileLine(files[id]) || files[id]?.filename}
                              </option>
                            ))}
                          </select>
                        </dd>
                      </div>
                    );
                  })}
                </dl>
                {!group.edited && (group.reasons.length > 0 || group.ai_reasons?.length > 0) && (
                  <p className="mt-3 text-xs text-fg-muted">
                    <span className="font-semibold text-fg">Vì sao: </span>
                    {[...group.reasons, ...(group.ai_reasons || []).map((reason) => `AI: ${reason}`)].join('; ')}
                  </p>
                )}
              </li>
            ))}
          </ol>

          {unplaced.length > 0 && (
            <div className="rounded-card border border-line bg-surface p-4">
              <h3 className="text-sm font-semibold text-fg">Chưa xếp được ({unplaced.length})</h3>
              <p className="mt-0.5 text-xs text-fg-muted">
                Không khớp đủ với bộ nào. Chọn vào một bộ ở trên, hoặc để lại trong hộp chờ.
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {unplaced.map((id) => (
                  <li key={id} className="flex gap-3">
                    <span className="w-10 shrink-0 text-xs font-semibold text-fg-muted">{files[id]?.doc_label}</span>
                    <span className="min-w-0 truncate text-fg">{fileLine(files[id]) || files[id]?.filename}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
