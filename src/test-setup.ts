import '@testing-library/jest-dom/vitest'
// MP-03: PeerEventStore uses IndexedDB, and usePeerEventCache is mounted
// inside AppInner. Any test that renders <App /> needs indexedDB in the
// environment; jsdom doesn't ship it. Installing the polyfill globally
// keeps individual test files from having to remember the import.
import 'fake-indexeddb/auto'

// Mock window.matchMedia for components using useBreakpoint.
//
// IMPORTANT: we report "mobile" by default so that GameBoard renders via
// `MobileTabView` instead of the dockview layout engine. Dockview does not
// render panel CONTENT in jsdom (it gates content mounting on real viewport
// geometry and ResizeObserver callbacks), which broke every test that
// asserts on widget output (narration text, character sheet, etc.). The
// mobile tab view renders all widget content in a flat structure that jsdom
// handles natively, which is closer to what the tests were originally
// written against (react-grid-layout). Tests that specifically need the
// desktop dockview path should override matchMedia per-test.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: query.includes('max-width: 767px'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// jsdom may not properly initialize localStorage. Add a polyfill if needed.
if (!globalThis.localStorage || typeof localStorage.clear !== 'function') {
  const storage: Record<string, string> = {};
  globalThis.localStorage = {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => { storage[key] = value; },
    removeItem: (key: string) => { delete storage[key]; },
    clear: () => { Object.keys(storage).forEach(k => delete storage[k]); },
    key: (index: number) => Object.keys(storage)[index] ?? null,
    length: Object.keys(storage).length,
  } as Storage;
}

// App.tsx persists an HMR snapshot to sessionStorage so hot-reloads don't
// lose game state. Tests that render <App /> in a loop leak that snapshot
// across tests — the second test sees a fully-hydrated App skipping the
// ConnectScreen. Wipe both storages before every test.
import { beforeEach } from 'vitest';
beforeEach(() => {
  try { sessionStorage.clear(); } catch { /* jsdom may not have it */ }
  try { localStorage.clear(); } catch { /* jsdom may not have it */ }
});

// jsdom has no ResizeObserver; DockviewComponent (imported by GameBoard)
// constructs one even on the mobile code path because the module loads
// eagerly. Without the polyfill the constructor throws during import and
// every test that pulls in GameBoard crashes at the error boundary.
// A no-op stub is sufficient since tests force MobileTabView, so dockview
// never actually measures anything.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;

// jsdom does not implement Element.prototype.scrollIntoView. The reference TOC
// (ReferenceDocument.handleTocNavigate) calls it after opening a collapsed
// section so the target scrolls into view; without the stub jsdom throws inside
// the rAF callback ("scrollIntoView is not a function"). A no-op is sufficient —
// real browsers ship the API; tests only assert the section/chapter opened.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
