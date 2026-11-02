/** @type {import('tailwindcss').Config} */

// Màu ngữ nghĩa lấy từ biến CSS trong src/index.css (kênh RGB) để light/dark chỉ đổi giá trị biến,
// không phải nhân đôi class `dark:` ở từng component.
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

const TONES = ['success', 'warning', 'danger', 'info', 'neutral', 'brand'];
const toneColors = Object.fromEntries(
  TONES.map((tone) => [
    tone,
    { bg: token(`tone-${tone}-bg`), fg: token(`tone-${tone}-fg`), line: token(`tone-${tone}-line`) },
  ]),
);

export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        canvas: token('canvas'),
        surface: {
          DEFAULT: token('surface'),
          muted: token('surface-muted'),
          sunken: token('surface-sunken'),
        },
        line: { DEFAULT: token('line'), input: token('line-input') },
        fg: { DEFAULT: token('fg'), muted: token('fg-muted'), subtle: token('fg-subtle') },
        primary: { DEFAULT: token('primary'), hover: token('primary-hover'), fg: token('primary-fg') },
        accent: { DEFAULT: token('accent'), soft: token('accent-soft') },
        focus: token('focus'),
        // Lớp phủ sau hộp thoại: luôn tối ở cả hai giao diện (không dùng fg, vì fg đảo màu ở chế độ tối).
        scrim: token('scrim'),
        tone: toneColors,
        // Màu đặc cho thanh tỉ lệ, vạch trạng thái và biểu đồ (đậm hơn tone-*-fg để nhìn rõ trên nền sáng/tối).
        chart: {
          success: token('chart-success'),
          danger: token('chart-danger'),
          warning: token('chart-warning'),
          neutral: token('chart-neutral'),
        },
        sidebar: {
          DEFAULT: token('sidebar'),
          hover: token('sidebar-hover'),
          active: token('sidebar-active'),
          line: token('sidebar-line'),
          fg: token('sidebar-fg'),
          muted: token('sidebar-muted'),
          accent: token('sidebar-accent'),
          end: token('sidebar-end'),
        },
        // Thang màu cũ, còn dùng ở các màn hình chưa chuyển sang token (sẽ bỏ khi hoàn tất giai đoạn 6).
        // Cùng dải xanh mẫu biểu với token primary (#1f4fa3 ở mức 600) để trang cũ không lệch màu với khung mới.
        brand: {
          50: '#eef3fb',
          100: '#dde7f7',
          200: '#b9cbea',
          300: '#8eaadb',
          400: '#5f85c8',
          500: '#3a67b6',
          600: '#1f4fa3',
          700: '#173d80',
          800: '#132f63',
          900: '#0f244b',
          950: '#0a1730',
        },
      },
      borderRadius: {
        control: 'var(--radius-control)',
        card: 'var(--radius-card)',
        modal: 'var(--radius-modal)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
      },
      animation: {
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
