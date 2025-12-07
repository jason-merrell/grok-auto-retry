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

const DEFAULT_STORAGE: StorageData = {
    panelWidth: 320,
    panelHeight: 400,
    isMinimized: false,
    isMaximized: false,
    imaginePromptValue: "",
};

export const useStorage = () => {
    const [data, setData] = useState<StorageData>(DEFAULT_STORAGE);
    const [isLoading, setIsLoading] = useState(true);

    // Load from chrome.storage on mount
    useEffect(() => {
        chrome.storage.local.get(DEFAULT_STORAGE, (result) => {
            setData({ ...DEFAULT_STORAGE, ...(result as StorageData) });
            setIsLoading(false);
        });
    }, []);

    // Save a specific key to storage
    const save = useCallback(<K extends keyof StorageData>(
        key: K,
        value: StorageData[K]
    ) => {
        setData((prev) => {
            const updated = { ...prev, [key]: value };
            chrome.storage.local.set({ [key]: value });
            return updated;
        });
    }, []);

    // Save multiple keys at once
    const saveAll = useCallback((updates: Partial<StorageData>) => {
        setData((prev) => {
            const updated = { ...prev, ...updates };
            chrome.storage.local.set(updates);
            return updated;
        });
    }, []);

    return { data, save, saveAll, isLoading };
};
