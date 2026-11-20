import "@testing-library/jest-dom/vitest";

// Newer Node versions ship an experimental global `localStorage` that shadows jsdom's and
// has no methods unless --localstorage-file is set. Install a plain in-memory Storage
// when the one on hand is unusable.
if (typeof globalThis.localStorage?.getItem !== "function") {
  const data = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => Array.from(data.keys())[index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
  Object.defineProperty(globalThis, "localStorage", { value: memoryStorage, configurable: true });
}
