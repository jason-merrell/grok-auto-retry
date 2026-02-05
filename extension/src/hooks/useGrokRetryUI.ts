import { useState, useCallback, useEffect } from 'react';
import { HookStore, createStore, extractState, isHookStore } from '@/types/storage';

// Global UI preferences (shared across tabs)
// Stored in a single centralized key in chrome.storage.local
export interface UIState {
    panelWidth: number;
    panelHeight: number;
    miniTogglePosition?: { x: number; y: number };
    isMinimized: boolean;
    isMaximized: boolean;
    imaginePromptValue: string;
}

export type UIStore = HookStore<UIState>;

const STORE_KEY = 'useGrokRetryUI_store';
const GLOBAL_SETTINGS_KEY = 'useGrokRetrySettings_store';
const CURRENT_VERSION = 1;

/**
 * Manages runtime UI state for the extension panel.
 * 
 * Stores transient, device-specific UI preferences in chrome.storage.local:
 * - Panel dimensions (width/height)
 * - Panel state (minimized/maximized)
 * - Mini toggle position
 * - Current imagine prompt value
 * 
 * This hook manages what the UI looks like RIGHT NOW, while useGrokRetrySettings
 * manages what the defaults SHOULD BE. On mount, this hook reads from settings
 * to establish initial values.
 * 
 * Storage: chrome.storage.local (device-specific, not synced)
 * Key: 'useGrokRetryUI_store'
 * Structure: HookStore<UIState> with version tracking
 * 
 * Migration Strategy:
 * - Version 0 → 1: Migrate from flat object to HookStore wrapper
 * 
 * @returns UI state data and functions to update individual or multiple values
 * 
 * @example
 * ```tsx
 * const { data, save, saveAll } = useGrokRetryUI();
 * 
 * // Update single value
 * save('panelWidth', 400);
 * 
 * // Update multiple values
 * saveAll({ isMinimized: false, panelHeight: 500 });
 * ```
 */
export const useGrokRetryUI = () => {
    const [data, setData] = useState<UIState | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Load from chrome.storage on mount, using global settings as defaults
    useEffect(() => {
        chrome.storage.sync.get([GLOBAL_SETTINGS_KEY], (globalResult) => {
            const globalSettings = globalResult[GLOBAL_SETTINGS_KEY]?.state || {};

            const DEFAULT_STATE: UIState = {
                panelWidth: globalSettings.defaultPanelWidth ?? 320,
                panelHeight: globalSettings.defaultPanelHeight ?? 400,
                isMinimized: globalSettings.startMinimized ?? false,
                isMaximized: false,
                imaginePromptValue: "",
            };

            chrome.storage.local.get([STORE_KEY], (result) => {
                const rawData = result[STORE_KEY];
                let state: UIState;
                let needsMigration = false;

                if (!rawData) {
                    // No data exists
                    state = DEFAULT_STATE;
                } else if (isHookStore<UIState>(rawData)) {
                    // Already in new format
                    state = extractState(rawData, DEFAULT_STATE);
                } else {
                    // Old format (version 0) - migrate
                    console.log('[useGrokRetryUI] Migrating from version 0 to version 1');
                    state = { ...DEFAULT_STATE, ...rawData };
                    needsMigration = true;
                }

                setData(state);
                setIsLoading(false);

                // Save in new format if we migrated
                if (needsMigration) {
                    const store = createStore(state, CURRENT_VERSION);
                    chrome.storage.local.set({ [STORE_KEY]: store });
                    console.log('[useGrokRetryUI] Migration complete');
                }
            });
        });
    }, []);

    // Provide default data if not loaded yet
    const storageData = data || {
        panelWidth: 320,
        panelHeight: 400,
        isMinimized: false,
        isMaximized: false,
        imaginePromptValue: "",
    };

    // Save a specific key to storage
    const save = useCallback(<K extends keyof UIState>(
        key: K,
        value: UIState[K]
    ) => {
        setData((prev) => {
            const current = prev || storageData;
            const updated = { ...current, [key]: value };
            const store = createStore(updated, CURRENT_VERSION);
            chrome.storage.local.set({ [STORE_KEY]: store });
            return updated;
        });
    }, [storageData]);

    // Save multiple keys at once
    const saveAll = useCallback((updates: Partial<UIState>) => {
        setData((prev) => {
            const current = prev || storageData;
            const updated = { ...current, ...updates };
            const store = createStore(updated, CURRENT_VERSION);
            chrome.storage.local.set({ [STORE_KEY]: store });
            return updated;
        });
    }, [storageData]);

    return { data: storageData, save, saveAll, isLoading };
};
