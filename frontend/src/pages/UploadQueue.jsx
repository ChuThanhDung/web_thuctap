import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  FileUp,
  ShoppingCart,
  PackageCheck,
  FileCode2,
} from 'lucide-react';
import { getUploadQueue, uploadDocument } from '../api.js';

const STATUS_STYLES = {
  completed: { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Hoàn tất' },
  processing: { icon: Loader2, color: 'text-brand-600', bg: 'bg-brand-50', label: 'Đang xử lý', spin: true },
  queued: { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Chờ xử lý' },
  error: { icon: AlertCircle, color: 'text-rose-600', bg: 'bg-rose-50', label: 'Lỗi' },
};

const DOC_TYPES = [
  { value: 'invoice', label: 'Hóa đơn (Invoice)', desc: 'Kích hoạt đối soát 3 bên chéo trực tiếp từ DB', icon: FileText },
  { value: 'po', label: 'Đơn đặt hàng (PO)', desc: 'Lưu thông tin thô đơn đặt hàng làm cơ sở đối chiếu', icon: ShoppingCart },
  { value: 'grn', label: 'Phiếu nhập kho (GRN)', desc: 'Lưu thông tin thực nhận làm cơ sở đối chiếu', icon: PackageCheck },
];

export default function UploadQueue({ token }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState('invoice');
  const fileInputRef = useRef(null);

  // Hàm load hàng đợi upload thực tế từ BE
  const fetchQueue = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      const data = await getUploadQueue(token);
      setFiles(data.items || []);
    } catch (err) {
      console.error('Không thể lấy danh sách hàng đợi upload:', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [token]);

  // Load danh sách lần đầu khi render
  useEffect(() => {
    fetchQueue(true);
  }, [fetchQueue]);

  // Thiết lập cơ chế tự động làm mới hàng đợi (polling) nếu có file đang xử lý
  useEffect(() => {
    const hasActiveFiles = files.some(
      (f) => f.status === 'processing' || f.status === 'queued'
    );
    
    if (!hasActiveFiles) return;

    const timer = setInterval(() => {
      fetchQueue(false);
    }, 3000);

    return () => clearInterval(timer);
  }, [files, fetchQueue]);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  // Upload file lên BE
  const uploadFiles = async (fileList) => {
    const filesArray = Array.from(fileList);
    
    // Thêm các file mới vào UI ngay lập tức với trạng thái 'queued' để tối ưu trải nghiệm
    const tempFiles = filesArray.map((f, i) => ({
      id: `temp-${Date.now()}-${i}`,
      filename: f.name,
      size: `${(f.size / 1024 / 1024).toFixed(1)} MB`,
      status: 'queued',
      progress: 0,
      created_at: new Date().toISOString(),
    }));
    
    setFiles((prev) => [...tempFiles, ...prev]);

    // Tiến hành upload từng file lên BE
    for (let i = 0; i < filesArray.length; i++) {
      const fileObj = filesArray[i];
      try {
        // Cập nhật trạng thái file local thành 'processing'
        setFiles((prev) =>
          prev.map((f, idx) =>
            f.id === tempFiles[i].id ? { ...f, status: 'processing', progress: 30 } : f
          )
        );

        // Gọi API thật, truyền kèm loại tài liệu đã chọn
        await uploadDocument(token, fileObj, selectedDocType);
        
        // Load lại danh sách thật từ BE để đồng bộ hóa
        await fetchQueue(false);
      } catch (err) {
        // Đánh dấu lỗi nếu upload thất bại
        setFiles((prev) =>
          prev.map((f) =>
            f.id === tempFiles[i].id
              ? { ...f, status: 'error', progress: 0, error_message: err.message || 'Lỗi tải lên' }
              : f
          )
        );
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(e.target.files);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Nạp & Đối soát chứng từ</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Tải lên hóa đơn, đơn đặt hàng PO, hoặc phiếu nhập kho dưới định dạng XML, PDF hoặc hình ảnh để quản lý và đối soát chéo tự động.
        </p>
      </div>

      {/* Select Document Type to Upload */}
      <div className="grid gap-3 sm:grid-cols-3">
        {DOC_TYPES.map((type) => {
          const Icon = type.icon;
          const isSelected = selectedDocType === type.value;
          return (
            <button
              key={type.value}
              onClick={() => setSelectedDocType(type.value)}
              className={`flex flex-col items-start text-left p-4 rounded-xl border transition-all ${
                isSelected
                  ? 'border-brand-500 bg-brand-50/50 shadow-[0_2px_8px_rgba(var(--color-brand-600),0.08)]'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className={`p-2 rounded-lg ${isSelected ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                <Icon size={18} />
              </div>
              <span className="mt-3 font-semibold text-sm text-slate-900">{type.label}</span>
              <span className="mt-1 text-xs text-slate-500 leading-relaxed">{type.desc}</span>
            </button>
          );
        })}
      </div>

      {/* Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`card flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 transition-all ${
          isDragOver
            ? 'border-brand-500 bg-brand-50'
            : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50/50'
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
        <p className="mt-1 text-xs text-slate-500 text-center">
          hoặc <span className="font-medium text-brand-600">bấm để chọn file từ máy tính</span>
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-400">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">.XML</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">.PDF</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">.PNG / .JPG</span>
          <span>·</span>
          <span>Dung lượng tối đa 25 MB</span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".xml,.pdf,.png,.jpg,.jpeg"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Queue */}
      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">
            Hàng đợi xử lý ({files.length} file)
          </h3>
          {files.length > 0 && (
            <button
              onClick={() => fetchQueue(true)}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium"
            >
              Làm mới
            </button>
          )}
        </div>
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="animate-spin text-brand-600" size={24} />
            <span className="text-xs text-slate-400 ml-2">Đang tải danh sách...</span>
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs">
            Chưa có tệp nào được tải lên trong phiên làm việc này.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
            {files.map((file) => {
              const st = STATUS_STYLES[file.status] || STATUS_STYLES.queued;
              const StatusIcon = st.icon;
              
              // Nhận diện icon biểu tượng tương ứng với đuôi file
              const ext = file.filename.split('.').pop()?.toLowerCase();
              let fileIconColor = 'text-brand-600';
              if (ext === 'pdf') fileIconColor = 'text-rose-600';
              else if (['png', 'jpg', 'jpeg'].includes(ext)) fileIconColor = 'text-amber-600';

              return (
                <div
                  key={file.id}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${st.bg}`}>
                    <FileText size={18} className={fileIconColor} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {file.filename}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-400">{file.size}</span>
                      {file.error_message && (
                        <span className="text-xs text-rose-600 truncate max-w-[400px]" title={file.error_message}>
                          Lỗi: {file.error_message}
                        </span>
                      )}
                      {file.case_id && (
                        <a
                          href={`/case/${file.case_id}`}
                          className="text-xs text-brand-600 hover:underline font-medium"
                        >
                          Xem kết quả đối soát
                        </a>
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
        )}
      </div>
    </div>
  );
}
