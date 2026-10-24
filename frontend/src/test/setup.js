import '@testing-library/jest-dom/vitest';

// jsdom không có các API trình duyệt mà Headless UI và Tooltip cần.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;

if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
}

Element.prototype.scrollIntoView ??= function scrollIntoView() {};
