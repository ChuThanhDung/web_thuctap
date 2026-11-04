import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { getLegalInfo } from '../api.js';
import { LEGAL_DOCUMENTS, fillLegalText } from '../legal/content.js';
import { ROUTES } from '../routes.js';

const DOCUMENT_LINKS = [
  ['terms', ROUTES.terms],
  ['privacy', ROUTES.privacyPolicy],
  ['dpa', ROUTES.dpa],
];

function formatVersion(version) {
  const [year, month, day] = (version || '').split('-');
  return day ? `${day}/${month}/${year}` : version;
}

/** Trang văn bản pháp lý công khai (xem được cả khi chưa đăng nhập). */
export default function LegalPage({ document: documentKey, backTo = ROUTES.login }) {
  const [info, setInfo] = useState(null);
  const doc = LEGAL_DOCUMENTS[documentKey];

  useEffect(() => {
    getLegalInfo()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${doc.title} - DocuSync AI`;
    document.documentElement.scrollTop = 0;
    return () => {
      document.title = previousTitle;
    };
  }, [doc.title]);

  return (
    <div className="min-h-dvh bg-canvas text-fg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link to={backTo} className="inline-flex items-center gap-2 text-sm font-semibold text-fg">
            <span className="flex h-8 w-8 items-center justify-center rounded-control bg-sidebar-accent text-sidebar" aria-hidden="true">
              <Check size={18} strokeWidth={3} />
            </span>
            DocuSync AI
          </Link>
          <Link to={backTo} className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
            <ArrowLeft size={15} aria-hidden="true" /> Quay lại
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <nav aria-label="Văn bản pháp lý" className="mb-6 flex flex-wrap gap-2 text-sm">
          {DOCUMENT_LINKS.map(([key, to]) => (
            <Link
              key={key}
              to={to}
              aria-current={key === documentKey ? 'page' : undefined}
              className={
                key === documentKey
                  ? 'rounded-control bg-primary px-3 py-1.5 font-semibold text-primary-fg'
                  : 'rounded-control border border-line bg-surface px-3 py-1.5 text-fg-muted hover:text-fg'
              }
            >
              {LEGAL_DOCUMENTS[key].title}
            </Link>
          ))}
        </nav>

        <article className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-8">
          <h1 className="text-2xl font-bold text-fg">{doc.title}</h1>
          <p className="mt-1 text-sm text-fg-subtle">Phiên bản {formatVersion(info?.terms_version) || '…'}</p>
          <p className="mt-4 text-pretty leading-7 text-fg-muted">{fillLegalText(doc.intro, info)}</p>
          {doc.sections.map((section) => (
            <section key={section.heading} className="mt-6">
              <h2 className="text-base font-semibold text-fg">{fillLegalText(section.heading, info)}</h2>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-7 text-fg-muted">
                {section.items.map((item) => (
                  <li key={item}>{fillLegalText(item, info)}</li>
                ))}
              </ul>
            </section>
          ))}
          {info?.contact_email && (
            <p className="mt-8 border-t border-line pt-4 text-sm text-fg-muted">
              Liên hệ về dữ liệu cá nhân và điều khoản: <a className="font-semibold text-primary" href={`mailto:${info.contact_email}`}>{info.contact_email}</a>
            </p>
          )}
        </article>
      </main>
    </div>
  );
}
