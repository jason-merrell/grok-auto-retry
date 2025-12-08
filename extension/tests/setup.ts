import { vi } from 'vitest';

// JSDOM environment setup and chrome API mocks
declare global {
    interface Window {
        chrome: any;
    }
}

// Basic chrome.storage mocks
const memoryLocal: Record<string, any> = {};
const memorySync: Record<string, any> = {};
const storageListeners: Array<(changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void> = [];

const fireStorageChange = (areaName: string, changes: Record<string, chrome.storage.StorageChange>) => {
    for (const listener of storageListeners) {
        try {
            listener(changes, areaName);
        } catch {
            // ignore listener errors in tests
        }
    }
};

global.window.chrome = {
    runtime: {
        lastError: null,
    },
    storage: {
        local: {
            get: (keys: string[] | Record<string, any>, cb: (res: any) => void) => {
                const res: Record<string, any> = {};
                const list = Array.isArray(keys) ? keys : Object.keys(keys);
                for (const k of list) res[k] = memoryLocal[k];
                cb(res);
            },
            set: (obj: Record<string, any>, cb?: () => void) => {
                const changes: Record<string, chrome.storage.StorageChange> = {};
                for (const key of Object.keys(obj)) {
                    changes[key] = {
                        oldValue: memoryLocal[key],
                        newValue: obj[key],
                    } as chrome.storage.StorageChange;
                }
                Object.assign(memoryLocal, obj);
                cb?.();
                fireStorageChange('local', changes);
            },
            remove: (key: string, cb?: () => void) => {
                delete memoryLocal[key];
                cb?.();
            },
        },
        sync: {
            get: (keys: string[] | Record<string, any>, cb: (res: any) => void) => {
                const res: Record<string, any> = {};
                const list = Array.isArray(keys) ? keys : Object.keys(keys);
                for (const k of list) res[k] = memorySync[k];
                cb(res);
            },
            set: (obj: Record<string, any>, cb?: () => void) => {
                const changes: Record<string, chrome.storage.StorageChange> = {};
                for (const key of Object.keys(obj)) {
                    changes[key] = {
                        oldValue: memorySync[key],
                        newValue: obj[key],
                    } as chrome.storage.StorageChange;
                }
                Object.assign(memorySync, obj);
                cb?.();
                fireStorageChange('sync', changes);
            },
        },
        onChanged: {
            addListener: (listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) => {
                storageListeners.push(listener);
            },
            removeListener: (listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) => {
                const index = storageListeners.indexOf(listener);
                if (index >= 0) {
                    storageListeners.splice(index, 1);
                }
            },
            hasListener: (listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) => {
                return storageListeners.includes(listener);
            },
        },
    },
};

// Mock MutationObserver for deterministic triggering in unit tests
const __observers: MutationCallback[] = [];
class MockMutationObserver {
    private callback: MutationCallback;
    constructor(cb: MutationCallback) {
        this.callback = cb;
    }
    observe() {
        __observers.push(this.callback);
    }
    disconnect() { }
    takeRecords() { return []; }
}

// Assign global MutationObserver if not present
// @ts-ignore
global.MutationObserver = global.MutationObserver || (MockMutationObserver as any);

// Helper to trigger mutation callbacks in unit tests
(global as any).__triggerMutations = () => {
    const records: MutationRecord[] = [];
    for (const cb of __observers) cb(records, ({} as unknown) as MutationObserver);
};

// Enable fake timers by default in unit tests
vi.useFakeTimers();

