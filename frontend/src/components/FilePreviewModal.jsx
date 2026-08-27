import React from 'react';
import { FileText, X } from 'lucide-react';

function getFileExt(filename = '') {
  return filename.split('.').pop()?.toLowerCase() || '';
}

function getPreviewKind(filename = '') {
  const ext = getFileExt(filename);
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) return 'image';
  if (['pdf', 'xml', 'txt', 'csv', 'json'].includes(ext)) return 'iframe';
  return 'unsupported';
}

export default function FilePreviewModal({ filePreview, onClose }) {
  if (!filePreview) return null;

  const kind = getPreviewKind(filePreview.filename);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-stretch justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="file-preview-title"
      onClick={onClose}
    >
      <div
        className="flex h-dvh w-full max-w-6xl flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-950 sm:h-[92vh] sm:rounded-xl sm:border sm:border-slate-200 sm:dark:border-slate-800"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex min-h-10 items-center justify-between gap-3 border-b border-slate-200 px-3 py-1.5 dark:border-slate-800 sm:px-4">
          <div className="min-w-0">
            <h2 id="file-preview-title" className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
              {filePreview.filename}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Đóng xem file"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-white dark:bg-slate-950">
          {kind === 'image' && (
            <div className="flex h-full items-center justify-center overflow-auto p-4">
              <img src={filePreview.previewUrl} alt={filePreview.filename} className="max-h-full max-w-full object-contain" />
            </div>
          )}
          {kind === 'iframe' && (
            <iframe
              src={filePreview.previewUrl}
              title={filePreview.filename}
              className="h-full w-full border-0 bg-white"
            />
          )}
          {kind === 'unsupported' && (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <FileText size={32} className="mx-auto text-slate-400" />
                <p className="mt-3 text-sm font-bold text-slate-900 dark:text-slate-100">Không thể xem trước định dạng này</p>
                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Trình duyệt không hỗ trợ xem trực tiếp file này trong popup. Bạn vẫn có thể tải file gốc để kiểm tra.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
