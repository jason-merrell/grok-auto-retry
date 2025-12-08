import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { PostData, AttemptProgressEntry } from '../../src/hooks/useSessionStorage';

const GLOBAL_SETTINGS_KEY = 'grokRetry_globalSettings';
const PERSISTENT_PREFIX = 'grokRetryPost_';
const SESSION_PREFIX = 'grokRetrySession_';

interface StorageBacking {
    [key: string]: any;
}

const createStorageArea = (backing: StorageBacking) => ({
    get(keys: string | string[] | Record<string, any>, callback: (items: Record<string, any>) => void) {
        const result: Record<string, any> = {};
        const keyArray = Array.isArray(keys)
            ? keys
            : typeof keys === 'string'
                ? [keys]
                : keys && typeof keys === 'object'
                    ? Object.keys(keys)
                    : [];

        keyArray.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(backing, key)) {
                result[key] = backing[key];
            } else if (keys && typeof keys === 'object' && !Array.isArray(keys)) {
                result[key] = (keys as Record<string, any>)[key];
            } else {
                result[key] = undefined;
            }
        });

        callback(result);
    },
    set(items: Record<string, any>, callback?: () => void) {
        Object.entries(items).forEach(([key, value]) => {
            backing[key] = value;
        });
        callback?.();
    },
    remove(keys: string | string[], callback?: () => void) {
        const keyArray = Array.isArray(keys) ? keys : [keys];
        keyArray.forEach((key) => {
            delete backing[key];
        });
        callback?.();
    },
    clear(callback?: () => void) {
        Object.keys(backing).forEach((key) => delete backing[key]);
        callback?.();
    },
});

describe('usePostStorage', () => {
    const postId = 'post-coverage';
    const persistentKey = `${PERSISTENT_PREFIX}${postId}`;
    const sessionKey = `${SESSION_PREFIX}${postId}`;

    let localBacking: StorageBacking;
    let syncBacking: StorageBacking;
    let usePostStorage: (id: string | null) => {
        data: PostData;
        save: <K extends keyof PostData>(key: K, value: PostData[K]) => void;
        saveAll: (updates: Partial<PostData>) => void;
        clear: () => void;
        appendLog: (line: string, level?: 'info' | 'warn' | 'error') => void;
        isLoading: boolean;
    };

    beforeEach(async () => {
        vi.resetModules();
        sessionStorage.clear();

        localBacking = {};
        syncBacking = {
            [GLOBAL_SETTINGS_KEY]: {
                defaultMaxRetries: 6,
                defaultVideoGoal: 2,
                defaultAutoRetryEnabled: false,
            },
        };

        (globalThis as any).chrome = {
            storage: {
                local: createStorageArea(localBacking),
                sync: createStorageArea(syncBacking),
            },
            runtime: { lastError: null },
        };

        const mod = await import('../../src/hooks/useSessionStorage');
        usePostStorage = mod.usePostStorage;
    });

    afterEach(() => {
        delete (globalThis as any).chrome;
    });

    it('hydrates state from storage and defaults', async () => {
        sessionStorage.setItem(sessionKey, JSON.stringify({ retryCount: 2, canRetry: true, logs: ['existing log'] }));

        const { result } = renderHook(() => usePostStorage(postId));

        await act(async () => {
            await Promise.resolve();
        });

        expect(result.current.data.maxRetries).toBe(6);
        expect(result.current.data.autoRetryEnabled).toBe(false);
        expect(result.current.data.videoGoal).toBe(2);
        expect(result.current.data.retryCount).toBe(2);
        expect(result.current.data.canRetry).toBe(true);
        expect(result.current.data.logs?.length).toBe(1);
        expect(result.current.data.attemptProgress).toEqual([]);
        expect((window as any).__grok_test.__storageHydrated).toBe(true);
        expect((window as any).__grok_activePostId).toBe(postId);
    });

    it('persists updates across chrome storage and sessionStorage', async () => {
        const existingPersistent = {
            maxRetries: 5,
            autoRetryEnabled: true,
            lastPromptValue: 'old prompt',
            videoGoal: 4,
        };
        localBacking[persistentKey] = existingPersistent;

        const { result } = renderHook(() => usePostStorage(postId));
        await act(async () => {
            await Promise.resolve();
        });

        act(() => {
            result.current.save('maxRetries', 8);
        });

        expect(localBacking[persistentKey].maxRetries).toBe(8);

        act(() => {
            result.current.saveAll({ retryCount: 3, canRetry: true, lastPromptValue: 'new prompt' });
        });

        const sessionPayload = JSON.parse(sessionStorage.getItem(sessionKey) || '{}');
        expect(sessionPayload.retryCount).toBe(3);
        expect(sessionPayload.canRetry).toBe(true);
        expect(localBacking[persistentKey].lastPromptValue).toBe('new prompt');
        expect(result.current.data.retryCount).toBe(3);
        expect(result.current.data.canRetry).toBe(true);

        const progressEntry: AttemptProgressEntry = { attempt: 3, percent: 42, recordedAt: 111 };
        act(() => {
            result.current.saveAll({ attemptProgress: [progressEntry] });
        });

        const attemptPayload = JSON.parse(sessionStorage.getItem(sessionKey) || '{}');
        expect(Array.isArray(attemptPayload.attemptProgress)).toBe(true);
        expect(attemptPayload.attemptProgress[0]).toMatchObject({ attempt: 3, percent: 42 });
    });

    it('appends logs and clears stored state', async () => {
        localBacking[persistentKey] = {
            maxRetries: 4,
            autoRetryEnabled: true,
            lastPromptValue: '',
            videoGoal: 3,
        };

        const { result } = renderHook(() => usePostStorage(postId));
        await act(async () => {
            await Promise.resolve();
        });

        const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

        act(() => {
            result.current.appendLog('line for coverage', 'warn');
        });

        expect(dispatchSpy).toHaveBeenCalledTimes(1);
        dispatchSpy.mockRestore();

        expect(result.current.data.logs?.some((line) => line.includes('line for coverage'))).toBe(true);

        act(() => {
            result.current.clear();
        });

        expect(sessionStorage.getItem(sessionKey)).toBeNull();
        expect(localBacking[persistentKey]).toBeUndefined();
    });
});
