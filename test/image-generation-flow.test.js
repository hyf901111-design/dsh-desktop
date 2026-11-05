import { JSDOM } from "jsdom";
import { expect, it, vi } from "vitest";
import { mountImageGenerationFlow } from "../src/preload/image-generation-flow";
it("animates the shared grayscale field, pauses hidden/reduced surfaces, and releases completed cards", async () => {
  const dom = new JSDOM("<body data-ds-dark-theme><canvas data-odyssey-image-flow></canvas></body>");
  const win = dom.window, doc = win.document;
  let intersection, motion, sequence = 0;
  const frames = /* @__PURE__ */ new Map(), reduced = { matches: false, addEventListener: (_, fn) => {
    motion = fn;
  }, removeEventListener: vi.fn() };
  Object.assign(win, {
    matchMedia: () => reduced,
    requestAnimationFrame: (fn) => {
      frames.set(++sequence, fn);
      return sequence;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    ResizeObserver: class {
      observe() {
      }
      unobserve() {
      }
      disconnect() {
      }
    },
    IntersectionObserver: class {
      constructor(fn) {
        intersection = fn;
      }
      observe() {
      }
      unobserve() {
      }
      disconnect() {
      }
    }
  });
  let last = new Uint8ClampedArray();
  const put = vi.fn((pixels) => {
    last = new Uint8ClampedArray(pixels.data);
  });
  vi.spyOn(win.HTMLCanvasElement.prototype, "getContext").mockReturnValue({ createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }), putImageData: put });
  vi.spyOn(win.HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 440, height: 440 });
  Object.defineProperty(doc, "hidden", { configurable: true, value: false });
  const stop = mountImageGenerationFlow(doc), canvas = doc.querySelector("canvas");
  intersection([{ target: canvas, isIntersecting: true }]);
  const before = new Uint8ClampedArray(last);
  for (let now = 1; now <= 2001; now += 50) {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((fn) => fn(now));
  }
  expect(last.some((value, index) => index % 4 === 0 && Math.abs(value - before[index]) > 20)).toBe(true);
  expect(last.every((value, index) => index % 4 > 1 || value === last[index - index % 4])).toBe(true);
  expect(canvas.width).toBeLessThanOrEqual(256);
  reduced.matches = true;
  motion();
  expect(frames.size).toBe(0);
  expect(canvas.dataset.flowState).toBe("paused");
  reduced.matches = false;
  motion();
  expect(frames.size).toBe(1);
  intersection([{ target: canvas, isIntersecting: false }]);
  expect(frames.size).toBe(0);
  intersection([{ target: canvas, isIntersecting: true }]);
  canvas.remove();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(frames.size).toBe(0);
  stop();
  dom.window.close();
});
