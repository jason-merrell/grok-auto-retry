import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

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
});

describe('Prompt Queue', () => {
    const postId = 'test-post';
    const persistentKey = `${PERSISTENT_PREFIX}${postId}`;

    let localBacking: StorageBacking;
    let syncBacking: StorageBacking;
    let usePostStorage: any;

    beforeEach(async () => {
        vi.resetModules();
        sessionStorage.clear();

        localBacking = {};
        syncBacking = {
            [GLOBAL_SETTINGS_KEY]: {},
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

    it('initializes with empty prompt queue', async () => {
        const { result } = renderHook(() => usePostStorage(postId, null));

        await vi.waitFor(() => !result.current.isLoading);

        expect(result.current.data.promptQueue).toEqual([]);
        expect(result.current.data.currentPromptIndex).toBe(0);
    });

    it('adds prompts to queue', async () => {
        const { result } = renderHook(() => usePostStorage(postId, null));

        await vi.waitFor(() => !result.current.isLoading);

        act(() => {
            result.current.save('promptQueue', ['Prompt 1', 'Prompt 2', 'Prompt 3']);
        });

        expect(result.current.data.promptQueue).toEqual(['Prompt 1', 'Prompt 2', 'Prompt 3']);
    });

    it('tracks current prompt index', async () => {
        const { result } = renderHook(() => usePostStorage(postId, null));

        await vi.waitFor(() => !result.current.isLoading);

        act(() => {
            result.current.saveAll({
                promptQueue: ['Prompt 1', 'Prompt 2', 'Prompt 3'],
                currentPromptIndex: 1,
            });
        });

        expect(result.current.data.currentPromptIndex).toBe(1);
    });

    it('persists prompt queue to chrome storage', async () => {
        const { result } = renderHook(() => usePostStorage(postId, null));

        await vi.waitFor(() => !result.current.isLoading);

        act(() => {
            result.current.save('promptQueue', ['Prompt A', 'Prompt B']);
        });

        expect(localBacking[persistentKey]).toBeDefined();
        expect(localBacking[persistentKey].promptQueue).toEqual(['Prompt A', 'Prompt B']);
    });

    it('resets current prompt index on session start', async () => {
        const { result } = renderHook(() => usePostStorage(postId, null));

        await vi.waitFor(() => !result.current.isLoading);

        // Set up some state
        act(() => {
            result.current.saveAll({
                currentPromptIndex: 2,
                isSessionActive: false,
            });
        });

        expect(result.current.data.currentPromptIndex).toBe(2);

        // Start session should reset index to 0
        act(() => {
            result.current.saveAll({
                currentPromptIndex: 0,
                isSessionActive: true,
            });
        });

        expect(result.current.data.currentPromptIndex).toBe(0);
    });
});
