import { useState, useCallback, useEffect } from 'react';

// Global UI preferences (shared across tabs)
export interface StorageData {
    panelWidth: number;
    panelHeight: number;
    miniTogglePosition?: { x: number; y: number };
    isMinimized: boolean;
    isMaximized: boolean;
    imaginePromptValue: string;
}

const GLOBAL_SETTINGS_KEY = 'grokRetry_globalSettings';

export const useStorage = () => {
    const [data, setData] = useState<StorageData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Load from chrome.storage on mount, using global settings as defaults
    useEffect(() => {
        chrome.storage.sync.get([GLOBAL_SETTINGS_KEY], (globalResult) => {
            const globalSettings = globalResult[GLOBAL_SETTINGS_KEY] || {};
            
            const DEFAULT_STORAGE: StorageData = {
                panelWidth: globalSettings.defaultPanelWidth ?? 320,
                panelHeight: globalSettings.defaultPanelHeight ?? 400,
                isMinimized: globalSettings.startMinimized ?? false,
                isMaximized: false,
                imaginePromptValue: "",
            };

            chrome.storage.local.get(DEFAULT_STORAGE, (result) => {
                setData({ ...DEFAULT_STORAGE, ...(result as StorageData) });
                setIsLoading(false);
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
    const save = useCallback(<K extends keyof StorageData>(
        key: K,
        value: StorageData[K]
    ) => {
        setData((prev) => {
            const current = prev || storageData;
            const updated = { ...current, [key]: value };
            chrome.storage.local.set({ [key]: value });
            return updated;
        });
    }, [storageData]);

    // Save multiple keys at once
    const saveAll = useCallback((updates: Partial<StorageData>) => {
        setData((prev) => {
            const current = prev || storageData;
            const updated = { ...current, ...updates };
            chrome.storage.local.set(updates);
            return updated;
        });
    }, [storageData]);

    return { data: storageData, save, saveAll, isLoading };
};
