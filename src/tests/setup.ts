/**
 * Vitest global setup
 * Runs before every test file.
 */
import { vi } from "vitest";

// ── Mock IndexedDB ───────────────────────────────────────────────
// happy-dom doesn't ship a full IDB implementation
// We mock the parts our sync engine uses
const mockIDB = {
  open: vi.fn(() => ({
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    result: {
      transaction: vi.fn(() => ({
        objectStore: vi.fn(() => ({
          add: vi.fn(() => ({ onsuccess: null, onerror: null })),
          get: vi.fn(() => ({ onsuccess: null, onerror: null, result: null })),
          put: vi.fn(() => ({ onsuccess: null, onerror: null })),
          delete: vi.fn(() => ({ onsuccess: null, onerror: null })),
          getAll: vi.fn(() => ({ onsuccess: null, onerror: null, result: [] })),
          index: vi.fn(() => ({
            getAll: vi.fn(() => ({ onsuccess: null, onerror: null, result: [] })),
          })),
        })),
        oncomplete: null,
        onerror: null,
      })),
      objectStoreNames: { contains: vi.fn(() => false) },
      createObjectStore: vi.fn(() => ({
        createIndex: vi.fn(),
      })),
      close: vi.fn(),
    },
  })),
  deleteDatabase: vi.fn(() => ({
    onsuccess: null,
    onerror: null,
    onblocked: null,
  })),
};

Object.defineProperty(global, "indexedDB", {
  value: mockIDB,
  writable: true,
});

// ── Mock navigator.onLine ────────────────────────────────────────
Object.defineProperty(global.navigator, "onLine", {
  value: true,
  writable: true,
});

// ── Mock localStorage ────────────────────────────────────────────
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(global, "localStorage", { value: localStorageMock });

// ── Suppress console.log in tests ────────────────────────────────
vi.spyOn(console, "log").mockImplementation(() => {});