import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDisplayName } from '../useDisplayName';

describe('useDisplayName', () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch { /* jsdom may not have it */ }
  });

  it('returns null when unset', () => {
    const { result } = renderHook(() => useDisplayName());
    expect(result.current.name).toBeNull();
  });

  it('persists name to localStorage', () => {
    const { result } = renderHook(() => useDisplayName());
    act(() => result.current.setName('alice'));
    expect(localStorage.getItem('sq:display-name')).toBe('alice');
    expect(result.current.name).toBe('alice');
  });

  it('restores name on rerender', () => {
    localStorage.setItem('sq:display-name', 'bob');
    const { result } = renderHook(() => useDisplayName());
    expect(result.current.name).toBe('bob');
  });

  it('syncs across hook instances in the same tab', () => {
    // AppInner and ConnectScreen both mount useDisplayName; when ConnectScreen
    // calls setName, AppInner's instance must see it without a remount.
    const a = renderHook(() => useDisplayName());
    const b = renderHook(() => useDisplayName());
    expect(a.result.current.name).toBeNull();
    expect(b.result.current.name).toBeNull();
    act(() => a.result.current.setName('alice'));
    expect(a.result.current.name).toBe('alice');
    expect(b.result.current.name).toBe('alice');
  });

  it('keeps the typed name when localStorage writes fail (storage-blocked browser)', () => {
    // Playtest 2026-06-07 flickering_reach blocking bug: on browsers where
    // localStorage.setItem throws (Safari private/Lockdown, site data blocked
    // for a tunnel domain), the old same-tab sync READ the name back from
    // localStorage and synchronously wiped the just-typed name to null. The
    // slug-route connect effect then blocked forever — POST /api/games 201
    // but no GET, no WebSocket, four zero-turn sessions. The same-tab event
    // must carry the name; never read it back from storage.
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError');
      });
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
    try {
      const a = renderHook(() => useDisplayName());
      const b = renderHook(() => useDisplayName());
      act(() => a.result.current.setName('alice'));
      // Both instances hold the in-memory name even though persistence failed.
      expect(a.result.current.name).toBe('alice');
      expect(b.result.current.name).toBe('alice');
    } finally {
      setItem.mockRestore();
      getItem.mockRestore();
    }
  });

  it('keeps the typed name when localStorage holds a stale value the write could not replace', () => {
    // Safari legacy private mode shape: getItem works (returns the stale
    // cached name) but setItem throws. The old read-back sync replaced the
    // typed name with the stale one — the silent-rebind bug class
    // (Lenny/Laverne). The event-carried name must win in this tab.
    localStorage.setItem('sq:display-name', 'stale-bob');
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('quota', 'QuotaExceededError');
      });
    try {
      const a = renderHook(() => useDisplayName());
      const b = renderHook(() => useDisplayName());
      expect(a.result.current.name).toBe('stale-bob');
      act(() => a.result.current.setName('alice'));
      expect(a.result.current.name).toBe('alice');
      expect(b.result.current.name).toBe('alice');
    } finally {
      setItem.mockRestore();
    }
  });

  it('syncs cross-tab via the native storage event payload', () => {
    const a = renderHook(() => useDisplayName());
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'sq:display-name', newValue: 'carol' }),
      );
    });
    expect(a.result.current.name).toBe('carol');
  });

  it('ignores storage events for other keys', () => {
    localStorage.setItem('sq:display-name', 'dave');
    const a = renderHook(() => useDisplayName());
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'sq:other', newValue: 'mallory' }),
      );
    });
    expect(a.result.current.name).toBe('dave');
  });
});
