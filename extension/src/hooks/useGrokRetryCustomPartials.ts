import { useState, useEffect, useCallback } from 'react';
import { PromptPartial } from '@/config/promptPartials';
import { HookStore, createStore, extractState, isHookStore } from '@/types/storage';

const STORAGE_KEY = 'useGrokRetryCustomPartials_store';
const CURRENT_VERSION = 1;

export type CustomPartialsStore = HookStore<PromptPartial[]>;

/**
 * Manages user-created custom prompt partials.
 * 
 * Provides CRUD operations for custom prompt snippets:
 * - Load custom partials from storage
 * - Add new partials with auto-generated IDs
 * - Update existing partials
 * - Delete partials
 * - Save entire partial array
 * 
 * Custom partials are stored alongside built-in partials and
 * can be used in the prompt builder interface.
 * 
 * Storage: chrome.storage.local
 * Key: 'useGrokRetryCustomPartials_store'
 * Structure: HookStore<PromptPartial[]> with version tracking
 * 
 * Migration Strategy:
 * - Version 0 → 1: Migrate from flat array to HookStore wrapper
 *   - In-place structure change (same key)
 * 
 * @returns Custom partials array and CRUD functions
 * 
 * @example
 * ```tsx
 * const { customPartials, addPartial, updatePartial, deletePartial } = useGrokRetryCustomPartials();
 * 
 * // Add new partial
 * addPartial({
 *   name: 'Style',
 *   value: 'cinematic, 4k',
 *   category: 'visual'
 * });
 * ```
 */
export const useGrokRetryCustomPartials = () => {
    const [customPartials, setCustomPartials] = useState<PromptPartial[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Load custom partials from chrome.storage.local
    useEffect(() => {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
            const rawData = result[STORAGE_KEY];
            let state: PromptPartial[];
            let needsMigration = false;

            if (!rawData) {
                // No data - use empty array
                state = [];
            } else if (isHookStore<PromptPartial[]>(rawData)) {
                // Already in HookStore format
                state = extractState(rawData, []);
            } else {
                // Version 0 - flat array, migrate to HookStore
                console.log('[useGrokRetryCustomPartials] Migrating from version 0 to version 1');
                state = Array.isArray(rawData) ? rawData : [];
                needsMigration = true;
            }

            setCustomPartials(state);
            setIsLoading(false);

            if (needsMigration) {
                const store = createStore(state, CURRENT_VERSION);
                chrome.storage.local.set({ [STORAGE_KEY]: store });
                console.log('[useGrokRetryCustomPartials] Migration complete');
            }
        });
    }, []);

    // Save custom partials to chrome.storage.local
    const savePartials = useCallback((partials: PromptPartial[]) => {
        setCustomPartials(partials);
        const store = createStore(partials, CURRENT_VERSION);
        chrome.storage.local.set({ [STORAGE_KEY]: store });
    }, []);

    // Add a new custom partial
    const addPartial = useCallback((partial: Omit<PromptPartial, 'id'>) => {
        const newPartial: PromptPartial = {
            ...partial,
            id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        };
        const updated = [...customPartials, newPartial];
        savePartials(updated);
        return newPartial;
    }, [customPartials, savePartials]);

    // Update an existing custom partial
    const updatePartial = useCallback((id: string, updates: Partial<PromptPartial>) => {
        const updated = customPartials.map(p =>
            p.id === id ? { ...p, ...updates } : p
        );
        savePartials(updated);
    }, [customPartials, savePartials]);

    // Delete a custom partial
    const deletePartial = useCallback((id: string) => {
        const updated = customPartials.filter(p => p.id !== id);
        savePartials(updated);
    }, [customPartials, savePartials]);

    return {
        customPartials,
        isLoading,
        addPartial,
        updatePartial,
        deletePartial,
    };
};
