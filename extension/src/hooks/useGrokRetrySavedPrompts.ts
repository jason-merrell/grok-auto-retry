import { useEffect, useState, useCallback } from "react";
import { HookStore, createStore, extractState, isHookStore } from '@/types/storage';

/**
 * Saved prompt entry.
 * 
 * @property name - Display name for the saved prompt
 * @property text - Full prompt text content
 */
export interface SavedPrompt {
    name: string;
    text: string;
}

const STORAGE_KEY = "useGrokRetrySavedPrompts_store";
const CURRENT_VERSION = 1;

export type SavedPromptsStore = HookStore<Record<string, string>>;

/**
 * Manages saved/favorite prompts for quick reuse.
 * 
 * Provides:
 * - Storage of named prompts as key-value pairs
 * - Real-time sync across tabs/windows via storage events
 * - Add, update, and delete operations
 * - Automatic persistence to chrome.storage.local
 * 
 * Prompts are stored as a flat object where keys are prompt
 * names and values are the prompt text.
 * 
 * Storage: chrome.storage.local
 * Key: 'useGrokRetrySavedPrompts_store'
 * Structure: HookStore<Record<string, string>> with version tracking
 * 
 * Migration Strategy:
 * - Version 0 → 1: Migrate from flat object to HookStore wrapper
 *   - In-place structure change (same key)
 * 
 * @returns Prompts map and CRUD functions
 * 
 * @example
 * ```tsx
 * const { prompts, savePrompt, deletePrompt } = useGrokRetrySavedPrompts();
 * 
 * // Save a prompt
 * savePrompt('Favorite', 'A cinematic shot of...');
 * 
 * // Load a saved prompt
 * const text = prompts['Favorite'];
 * ```
 */
export const useGrokRetrySavedPrompts = () => {
    const [prompts, setPrompts] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        try {
            chrome.storage.local.get(STORAGE_KEY, (result) => {
                const rawData = result?.[STORAGE_KEY];
                let state: Record<string, string>;
                let needsMigration = false;

                if (!rawData) {
                    // No data - use empty object
                    state = {};
                } else if (isHookStore<Record<string, string>>(rawData)) {
                    // Already in HookStore format
                    state = extractState(rawData, {});
                } else {
                    // Version 0 - flat object, migrate to HookStore
                    console.log('[useGrokRetrySavedPrompts] Migrating from version 0 to version 1');
                    state = typeof rawData === 'object' ? rawData : {};
                    needsMigration = true;
                }

                setPrompts(state);
                setIsLoading(false);

                if (needsMigration) {
                    const store = createStore(state, CURRENT_VERSION);
                    chrome.storage.local.set({ [STORAGE_KEY]: store });
                    console.log('[useGrokRetrySavedPrompts] Migration complete');
                }
            });
            // Keep in sync when other components/pages update saved prompts
            const handleChange = (
                changes: { [key: string]: chrome.storage.StorageChange },
                areaName: string
            ) => {
                if (areaName !== "local") return;
                if (STORAGE_KEY in changes) {
                    const newStore = changes[STORAGE_KEY].newValue as SavedPromptsStore | undefined;
                    const next = extractState(newStore, {});
                    setPrompts(next);
                }
            };
            chrome.storage.onChanged.addListener(handleChange);
            return () => {
                chrome.storage.onChanged.removeListener(handleChange);
            };
        } catch {
            // Fallback to window.localStorage when chrome.storage is unavailable
            const raw = window.localStorage.getItem(STORAGE_KEY);
            setPrompts(raw ? JSON.parse(raw) : {});
            setIsLoading(false);
        }
    }, []);

    const persist = useCallback((next: Record<string, string>) => {
        setPrompts(next);
        try {
            const store = createStore(next, CURRENT_VERSION);
            chrome.storage.local.set({ [STORAGE_KEY]: store });
        } catch {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        }
    }, []);

    const savePrompt = useCallback((name: string, text: string) => {
        const trimmed = name.trim();
        if (!trimmed) return false;
        const next = { ...prompts, [trimmed]: text };
        persist(next);
        return true;
    }, [prompts, persist]);

    const deletePrompt = useCallback((name: string) => {
        const next = { ...prompts };
        delete next[name];
        persist(next);
    }, [prompts, persist]);

    const renamePrompt = useCallback((oldName: string, newName: string) => {
        const trimmed = newName.trim();
        if (!prompts[oldName] || !trimmed) return false;
        const next = { ...prompts };
        next[trimmed] = next[oldName];
        delete next[oldName];
        persist(next);
        return true;
    }, [prompts, persist]);

    const loadPrompt = useCallback((name: string) => prompts[name] || "", [prompts]);

    const listPrompts = useCallback((): SavedPrompt[] => {
        return Object.keys(prompts)
            .sort((a, b) => a.localeCompare(b))
            .map((name) => ({ name, text: prompts[name] }));
    }, [prompts]);

    return { prompts, isLoading, savePrompt, deletePrompt, renamePrompt, loadPrompt, listPrompts };
};
