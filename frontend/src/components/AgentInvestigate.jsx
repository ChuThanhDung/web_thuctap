import React, { useState } from 'react';
import { ArrowLeftRight, Search } from 'lucide-react';
import { investigateBatch, swapBatchCopy } from '../api.js';
import { Button, ConfirmDialog } from '../ui/index.js';
import { useToast } from '../ui/Toast.jsx';

// Trợ lý điều tra một bộ lệch: chỉ ra liên lạc loài và liên đúng đang ở đâu. Đổi chỗ chỉ khi người dùng xác nhận.

const UNLOCKED = ['incomplete', 'ready'];

export function canInvestigate(batch) {
  if (!batch || !UNLOCKED.includes(batch.rawStatus)) return false;
  return Boolean(batch.foreignCopy) || batch.reconciliationStatus === 'major_diff';
}

function describeIncoming(file) {
  return [file.document_number, file.supplier_name].filter(Boolean).join(' · ') || file.filename;
}

export default function AgentInvestigate({ token, batch, onChanged }) {
  const toast = useToast();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(null);
  const [swapping, setSwapping] = useState(false);

  if (!canInvestigate(batch)) return null;

  const run = async () => {
    setLoading(true);
    try {
      setReport(await investigateBatch(token, batch.id));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const confirmSwap = async () => {
    setSwapping(true);
    try {
      const result = await swapBatchCopy(token, batch.id, pending.doc_type, pending.incoming.id);
      toast.success(
        result.other
          ? `Đã đổi liên ${pending.label} với ${result.other.batch_number}; hai bộ đã được đối soát lại.`
          : `Đã đưa liên ${pending.label} vào bộ; liên cũ về hộp chờ xếp.`,
      );
      setPending(null);
      setReport(null);
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSwapping(false);
    }
  };

  if (!report) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line bg-surface-muted px-4 py-3 text-sm">
        <p className="text-fg-muted">Trợ lý có thể tìm xem chứng từ đúng có đang nằm ở bộ khác không.</p>
        <Button size="sm" variant="secondary" leadingIcon={Search} loading={loading} onClick={run}>
          Điều tra
        </Button>
      </div>
    );
  }

  return (
    <section aria-label="Kết quả điều tra của trợ lý" className="rounded-control border border-line bg-surface px-4 py-3 text-sm">
      <p className="font-semibold text-fg">{report.summary.conclusion}</p>
      <p className="mt-1 text-fg-muted">{report.summary.next_step}</p>
      {report.proposals.length > 0 && (
        <ul className="mt-3 space-y-2">
          {report.proposals.map((proposal) => (
            <li
              key={proposal.incoming.id}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-2"
            >
              <div className="min-w-0">
                <p className="text-fg">
                  Liên {proposal.label}: {describeIncoming(proposal.incoming)}
                  <span className="text-fg-muted">
                    {' '}
                    — ở {proposal.source_batch ? proposal.source_batch.batch_number : 'hộp chờ xếp'}
                  </span>
                </p>
                <p className="text-xs text-fg-muted">Vì sao: {proposal.incoming_reasons.join('; ')}</p>
              </div>
              <Button size="sm" variant="primary" leadingIcon={ArrowLeftRight} onClick={() => setPending(proposal)}>
                {proposal.kind === 'swap' ? 'Đổi chỗ hai liên' : 'Dùng liên này'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-fg-subtle">
        {report.ai_used ? 'Kết luận do AI viết từ kết quả so khớp.' : 'Kết luận từ quy tắc so khớp, không gọi AI.'}
      </p>
      <ConfirmDialog
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        onConfirm={confirmSwap}
        loading={swapping}
        title={pending?.kind === 'swap' ? `Đổi chỗ liên ${pending?.label}?` : `Dùng liên ${pending?.label} này?`}
        description={
          pending
            ? pending.source_batch
              ? `Liên ${pending.label} của bộ này chuyển sang ${pending.source_batch.batch_number}, liên ${describeIncoming(pending.incoming)} chuyển vào bộ này. Cả hai bộ được đối soát lại.`
              : `Liên ${describeIncoming(pending.incoming)} chuyển từ hộp chờ xếp vào bộ này; liên hiện tại về hộp chờ xếp. Bộ được đối soát lại.`
            : ''
        }
        confirmLabel={pending?.kind === 'swap' ? 'Đổi chỗ' : 'Chuyển vào bộ'}
      />
    </section>
  );
}
