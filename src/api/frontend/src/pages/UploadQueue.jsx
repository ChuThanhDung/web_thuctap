import React, { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  X,
  FileUp,
} from 'lucide-react';
import { uploadQueue } from '../mockData';

const STATUS_STYLES = {
  completed: { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Hoàn tất' },
  processing: { icon: Loader2, color: 'text-brand-600', bg: 'bg-brand-50', label: 'Đang xử lý', spin: true },
  queued: { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Chờ xử lý' },
  error: { icon: AlertCircle, color: 'text-rose-600', bg: 'bg-rose-50', label: 'Lỗi' },
};

export default function UploadQueue() {
  const [files, setFiles] = useState(uploadQueue);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    // Mock — in real app would upload
    const newFiles = Array.from(e.dataTransfer.files).map((f, i) => ({
      id: `UQ-new-${Date.now()}-${i}`,
      filename: f.name,
      size: `${(f.size / 1024 / 1024).toFixed(1)} MB`,
      uploadedAt: new Date().toISOString(),
      status: 'queued',
      progress: 0,
    }));
    setFiles((prev) => [...newFiles, ...prev]);
  };

  const handleFileSelect = (e) => {
    const newFiles = Array.from(e.target.files).map((f, i) => ({
      id: `UQ-new-${Date.now()}-${i}`,
      filename: f.name,
      size: `${(f.size / 1024 / 1024).toFixed(1)} MB`,
      uploadedAt: new Date().toISOString(),
      status: 'queued',
      progress: 0,
    }));
    setFiles((prev) => [...newFiles, ...prev]);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Tải lên hóa đơn</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Kéo thả hoặc chọn file hóa đơn, PO, phiếu nhập kho để bắt đầu đối soát
        </p>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`card flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-all ${
          isDragOver
            ? 'border-brand-500 bg-brand-50'
            : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50'
        }`}
      >
        <div
          className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl transition-colors ${
            isDragOver ? 'bg-brand-100' : 'bg-slate-100'
          }`}
        >
          <FileUp
            size={28}
            className={isDragOver ? 'text-brand-600' : 'text-slate-400'}
          />
        </div>
        <p className="text-sm font-semibold text-slate-700">
          {isDragOver ? 'Thả file tại đây' : 'Kéo thả file vào đây'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          hoặc <span className="font-medium text-brand-600">bấm để chọn file</span>
        </p>
        <p className="mt-3 text-[11px] text-slate-400">
          Hỗ trợ: PDF, XLSX, JPG, PNG · Tối đa 25 MB/file
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Queue */}
      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-700">
            Hàng đợi xử lý ({files.length} file)
          </h3>
        </div>
        <div className="divide-y divide-slate-100">
          {files.map((file) => {
            const st = STATUS_STYLES[file.status] || STATUS_STYLES.queued;
            const StatusIcon = st.icon;
            return (
              <div
                key={file.id}
                className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50 transition-colors"
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${st.bg}`}>
                  <FileText size={18} className={st.color} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {file.filename}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-400">{file.size}</span>
                    {file.error && (
                      <span className="text-xs text-rose-600">{file.error}</span>
                    )}
                  </div>
                  {file.status === 'processing' && (
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-brand-500 transition-all"
                        style={{ width: `${file.progress}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`flex items-center gap-1 text-xs font-medium ${st.color}`}>
                    <StatusIcon size={14} className={st.spin ? 'animate-spin' : ''} />
                    {st.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
