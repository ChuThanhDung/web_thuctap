import { useEffect, useState } from 'react';

const TOKENS = {
  success: 'chart-success',
  danger: 'chart-danger',
  warning: 'chart-warning',
  neutral: 'chart-neutral',
  primary: 'primary',
  grid: 'line',
  axis: 'fg-muted',
  surface: 'surface',
  text: 'fg',
};

function readColors() {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    Object.entries(TOKENS).map(([key, token]) => [
      key,
      `rgb(${style.getPropertyValue(`--c-${token}`).trim().split(/\s+/).join(', ')})`,
    ]),
  );
}

/**
 * Màu cho biểu đồ (recharts cần giá trị màu cụ thể, không dùng được class Tailwind), lấy từ design token
 * và tự cập nhật khi đổi giao diện sáng/tối để biểu đồ luôn cùng bảng màu với phần còn lại.
 */
export default function useChartColors() {
  const [colors, setColors] = useState(readColors);

  useEffect(() => {
    const observer = new MutationObserver(() => setColors(readColors()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return colors;
}
