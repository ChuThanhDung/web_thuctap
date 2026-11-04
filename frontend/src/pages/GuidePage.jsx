import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { GUIDE_SECTIONS } from '../guide/content.js';
import { ROUTES } from '../routes.js';
import BrandMark from '../components/BrandMark.jsx';

function Block({ block }) {
  switch (block.type) {
    case 'steps':
      return (
        <ol className="mt-3 space-y-2">
          {block.items.map((item, index) => (
            <li key={item} className="flex gap-3 leading-7 text-fg-muted">
              <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-primary tabular-nums">
                {index + 1}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      );
    case 'list':
      return (
        <ul className="mt-3 max-w-[68ch] list-disc space-y-1.5 pl-5 leading-7 text-fg-muted">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case 'table':
      return (
        <div className="mt-3 overflow-x-auto rounded-card border border-line">
          <table className="w-full border-collapse text-sm">
            <thead className="border-b-2 border-primary">
              <tr>
                {block.head.map((cell) => (
                  <th key={cell} scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-fg-muted">{cell}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {block.rows.map(([term, meaning]) => (
                <tr key={term}>
                  <th scope="row" className="whitespace-nowrap px-4 py-3 text-left font-semibold text-fg">{term}</th>
                  <td className="px-4 py-3 text-fg-muted">{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'faq':
      return (
        <div className="mt-3 divide-y divide-line border-y border-line">
          {block.items.map(([question, answer]) => (
            <details key={question} className="group py-3">
              <summary className="cursor-pointer list-none font-semibold text-fg marker:hidden">
                <ChevronRight size={16} className="mr-1.5 inline-block align-[-3px] text-primary transition-transform group-open:rotate-90" aria-hidden="true" />
                {question}
              </summary>
              <p className="mt-2 pl-5 leading-7 text-fg-muted">{answer}</p>
            </details>
          ))}
        </div>
      );
    default:
      return <p className="mt-3 max-w-[68ch] leading-7 text-fg-muted">{block.text}</p>;
  }
}

/** Hướng dẫn sử dụng: trang đọc, mục lục cố định bên trái trên màn hình rộng, mỗi mục có liên kết riêng. */
export default function GuidePage({ backTo = ROUTES.login }) {
  // Đã đăng nhập thì App truyền backTo='/' (về ứng dụng), chưa thì về trang đăng nhập.
  const signedIn = backTo !== ROUTES.login;
  const [active, setActive] = useState(GUIDE_SECTIONS[0].id);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Hướng dẫn sử dụng - DocuSync AI';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length) setActive(visible[0].target.id);
      },
      { rootMargin: '0px 0px -70% 0px' },
    );
    GUIDE_SECTIONS.forEach((section) => {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-dvh bg-canvas text-fg">
      <header className="sticky top-0 z-10 border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link to={backTo} aria-label="DocuSync AI" className="inline-flex items-center gap-2 text-sm font-semibold text-fg">
            <BrandMark />
            <span className="hidden sm:inline">DocuSync AI</span>
          </Link>
          <nav aria-label="Trang" className="flex items-center gap-4 whitespace-nowrap text-sm sm:gap-5">
            <Link to={ROUTES.pricing} className="text-fg-muted hover:text-fg hover:underline">Bảng giá</Link>
            {signedIn ? (
              <Link to={backTo} className="whitespace-nowrap font-semibold text-primary hover:underline">Về ứng dụng</Link>
            ) : (
              <>
                <Link to={ROUTES.login} className="text-fg-muted hover:text-fg hover:underline">Đăng nhập</Link>
                <Link to={ROUTES.signup} className="whitespace-nowrap font-semibold text-primary hover:underline">Dùng thử</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 lg:grid-cols-[200px_1fr]">
        <nav aria-label="Mục lục" className="lg:sticky lg:top-20 lg:self-start">
          <p className="mb-2 text-xs font-semibold text-fg-subtle">Mục lục</p>
          <ul className="flex flex-wrap gap-1 lg:flex-col">
            {GUIDE_SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  aria-current={active === section.id ? 'location' : undefined}
                  className={
                    active === section.id
                      ? 'block rounded-control bg-accent-soft px-3 py-1.5 text-sm font-semibold text-primary'
                      : 'block rounded-control px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-muted hover:text-fg'
                  }
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0">
          <h1 className="text-2xl font-bold text-fg">Hướng dẫn sử dụng</h1>
          <p className="mt-2 max-w-2xl leading-7 text-fg-muted">
            Cách tải chứng từ, đọc kết quả đối soát, duyệt hai cấp và quản lý công ty trên DocuSync AI.
          </p>
          {GUIDE_SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="mt-8 scroll-mt-20 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
              <h2 className="text-lg font-semibold text-fg">{section.title}</h2>
              {section.blocks.map((block, index) => (
                <Block key={index} block={block} />
              ))}
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
