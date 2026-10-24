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
        tone: toneColors,
        sidebar: {
          DEFAULT: token('sidebar'),
          hover: token('sidebar-hover'),
          active: token('sidebar-active'),
          line: token('sidebar-line'),
          fg: token('sidebar-fg'),
          muted: token('sidebar-muted'),
          accent: token('sidebar-accent'),
        },
        // Thang màu cũ, còn dùng ở các màn hình chưa chuyển sang token (sẽ bỏ khi hoàn tất giai đoạn 6).
        // Đã đổi sang cùng dải xanh với token primary để trang cũ không lệch màu với khung mới.
        brand: {
          50: '#ebf3fc',
          100: '#d6e6f8',
          200: '#b3d0f1',
          300: '#85b3e8',
          400: '#5490dc',
          500: '#2f72c6',
          600: '#1e5aa8',
          700: '#164687',
          800: '#123868',
          900: '#0f2c50',
          950: '#091b33',
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
