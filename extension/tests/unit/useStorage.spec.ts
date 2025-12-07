import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { StorageData } from '../../src/hooks/useStorage';

const GLOBAL_SETTINGS_KEY = 'grokRetry_globalSettings';

type Backing = Record<string, any>;

const createStorageArea = (backing: Backing) => ({
  get(keys: string | string[] | Record<string, any>, callback: (items: Record<string, any>) => void) {
    if (Array.isArray(keys)) {
      const result: Record<string, any> = {};
      keys.forEach((key) => {
        result[key] = backing[key];
      });
      callback(result);
      return;
    }

    if (typeof keys === 'string') {
      callback({ [keys]: backing[keys] });
      return;
    }

    const defaults = keys ?? {};
    const merged = { ...defaults };
    Object.keys(backing).forEach((key) => {
      merged[key] = backing[key];
    });
    callback(merged);
  },
  set(items: Record<string, any>, callback?: () => void) {
    Object.entries(items).forEach(([key, value]) => {
      backing[key] = value;
    });
    callback?.();
  },
  remove(keys: string | string[], callback?: () => void) {
    const list = Array.isArray(keys) ? keys : [keys];
    list.forEach((key) => delete backing[key]);
    callback?.();
  },
  clear(callback?: () => void) {
    Object.keys(backing).forEach((key) => delete backing[key]);
    callback?.();
  },
});

describe('useStorage', () => {
  let localBacking: Backing;
  let syncBacking: Backing;
  let useStorage: () => { data: StorageData; save: any; saveAll: any; isLoading: boolean };

  beforeEach(async () => {
    vi.resetModules();
    localBacking = {};
    syncBacking = {
      [GLOBAL_SETTINGS_KEY]: {
        defaultPanelWidth: 420,
        defaultPanelHeight: 460,
        startMinimized: true,
      },
    };

    (globalThis as any).chrome = {
      storage: {
        local: createStorageArea(localBacking),
        sync: createStorageArea(syncBacking),
      },
    };

    const mod = await import('../../src/hooks/useStorage');
    useStorage = mod.useStorage;
  });

  afterEach(() => {
    delete (globalThis as any).chrome;
  });

  it('hydrates with global defaults and local overrides', async () => {
    localBacking.panelWidth = 500;
    localBacking.panelHeight = 600;
    localBacking.isMaximized = true;

    const { result } = renderHook(() => useStorage());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data.panelWidth).toBe(500);
    expect(result.current.data.panelHeight).toBe(600);
    expect(result.current.data.isMinimized).toBe(true);
    expect(result.current.data.isMaximized).toBe(true);
  });

  it('save updates chrome storage and local state', async () => {
    const { result } = renderHook(() => useStorage());

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.save('panelWidth', 380);
    });

    expect(localBacking.panelWidth).toBe(380);
    expect(result.current.data.panelWidth).toBe(380);
  });

  it('saveAll persists multiple keys', async () => {
    const { result } = renderHook(() => useStorage());

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.saveAll({ panelHeight: 520, isMaximized: true });
    });

    expect(localBacking.panelHeight).toBe(520);
    expect(localBacking.isMaximized).toBe(true);
    expect(result.current.data.panelHeight).toBe(520);
    expect(result.current.data.isMaximized).toBe(true);
  });
});
