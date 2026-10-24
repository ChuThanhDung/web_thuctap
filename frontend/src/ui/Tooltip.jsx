import React, { cloneElement, useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn.js';

const HOVER_DELAY_MS = 250;
const GAP = 8;

/**
 * Tooltip cho một phần tử con duy nhất: hiện khi rê chuột (có độ trễ nhẹ) hoặc focus bàn phím, ẩn khi rời đi
 * hoặc nhấn Esc. Nội dung gắn vào con qua aria-describedby. Vẽ trong portal nên không bị cắt bởi bảng/overflow.
 * Dùng để hiện tên file đầy đủ khi bị cắt, nhãn cho nút icon khi sidebar thu gọn.
 */
export default function Tooltip({ content, children, side = 'top', className }) {
  const id = useId();
  const triggerRef = useRef(null);
  const timerRef = useRef(null);
  const [position, setPosition] = useState(null);

  const reveal = useCallback(() => {
    const element = triggerRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    if (side === 'right') {
      setPosition({ top: rect.top + rect.height / 2, left: rect.right + GAP });
      return;
    }
    setPosition({
      top: side === 'bottom' ? rect.bottom + GAP : rect.top - GAP,
      left: rect.left + rect.width / 2,
    });
  }, [side]);

  const hide = useCallback(() => {
    clearTimeout(timerRef.current);
    setPosition(null);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  useEffect(() => {
    if (!position) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') hide();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [position, hide]);

  if (!content) return children;

  const child = React.Children.only(children);
  const trigger = cloneElement(child, {
    ref: (node) => {
      triggerRef.current = node;
      const { ref } = child;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    'aria-describedby': position ? id : child.props['aria-describedby'],
    onMouseEnter: (event) => {
      child.props.onMouseEnter?.(event);
      timerRef.current = setTimeout(reveal, HOVER_DELAY_MS);
    },
    onMouseLeave: (event) => {
      child.props.onMouseLeave?.(event);
      hide();
    },
    onFocus: (event) => {
      child.props.onFocus?.(event);
      reveal();
    },
    onBlur: (event) => {
      child.props.onBlur?.(event);
      hide();
    },
  });

  return (
    <>
      {trigger}
      {position &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            style={{ top: position.top, left: position.left }}
            className={cn(
              'pointer-events-none fixed z-[70] max-w-xs rounded-control bg-fg px-2.5 py-1.5 text-xs font-medium text-canvas shadow-pop',
              side === 'right' ? '-translate-y-1/2' : '-translate-x-1/2',
              side === 'top' && '-translate-y-full',
              className,
            )}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
