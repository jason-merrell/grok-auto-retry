import { useState, useCallback, useEffect } from 'react';

// Global settings that apply as defaults across all posts/sessions
export interface GlobalSettings {
    // Default values for new posts
    defaultMaxRetries: number;
    defaultVideoGoal: number;
    defaultAutoRetryEnabled: boolean;

    // Timing configuration
    retryClickCooldown: number; // milliseconds between retries
    videoGenerationDelay: number; // milliseconds between video goal generations
    rateLimitWaitTime: number; // milliseconds to wait when rate limited
    rapidFailureThreshold: number; // seconds to detect rapid failure

    // UI preferences
    defaultPanelWidth: number;
    defaultPanelHeight: number;
    startMinimized: boolean;

    // Feature toggles
    showRapidFailureWarning: boolean;
    autoSwitchToDebug: boolean; // Auto-switch to debug panel on session start
    
    // Selector overrides (for language differences or when selectors change)
    customSelectors?: {
        notificationSection?: string;
        makeVideoButton?: string;
        videoElement?: string;
        promptTextarea?: string;
    };
    
    // Import/Export
    lastExportDate?: string;
}

const DEFAULT_SETTINGS: GlobalSettings = {
    defaultMaxRetries: 3,
    defaultVideoGoal: 1,
    defaultAutoRetryEnabled: true,
    retryClickCooldown: 8000,
    videoGenerationDelay: 8000,
    rateLimitWaitTime: 60000,
    rapidFailureThreshold: 6,
    defaultPanelWidth: 320,
    defaultPanelHeight: 400,
    startMinimized: false,
    showRapidFailureWarning: true,
    autoSwitchToDebug: true,
    customSelectors: undefined,
};

const STORAGE_KEY = 'grokRetry_globalSettings';
const STORAGE_VERSION_KEY = 'grokRetry_settingsVersion';
const CURRENT_VERSION = 1;

export const useGlobalSettings = () => {
    const [settings, setSettings] = useState<GlobalSettings>(DEFAULT_SETTINGS);
    const [isLoading, setIsLoading] = useState(true);

    // Load settings from chrome.storage.sync (syncs across devices)
    useEffect(() => {
        chrome.storage.sync.get([STORAGE_KEY, STORAGE_VERSION_KEY], (result) => {
            const version = result[STORAGE_VERSION_KEY] || 0;
            
            if (result[STORAGE_KEY]) {
                // Merge with defaults to handle new settings in updates
                setSettings({ ...DEFAULT_SETTINGS, ...result[STORAGE_KEY] });
            }
            
            // Handle version migrations if needed
            if (version < CURRENT_VERSION) {
                chrome.storage.sync.set({ [STORAGE_VERSION_KEY]: CURRENT_VERSION });
            }
            
            setIsLoading(false);
        });

        // Listen for changes from other tabs/devices
        const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
            if (areaName === 'sync' && changes[STORAGE_KEY]) {
                setSettings({ ...DEFAULT_SETTINGS, ...changes[STORAGE_KEY].newValue });
            }
        };

        chrome.storage.onChanged.addListener(handleStorageChange);
        return () => chrome.storage.onChanged.removeListener(handleStorageChange);
    }, []);

    // Save a specific setting
    const saveSetting = useCallback(<K extends keyof GlobalSettings>(
        key: K,
        value: GlobalSettings[K]
    ) => {
        setSettings((prev) => {
            const updated = { ...prev, [key]: value };
            chrome.storage.sync.set({ [STORAGE_KEY]: updated });
            return updated;
        });
    }, []);

    // Save multiple settings at once
    const saveSettings = useCallback((updates: Partial<GlobalSettings>) => {
        setSettings((prev) => {
            const updated = { ...prev, ...updates };
            chrome.storage.sync.set({ [STORAGE_KEY]: updated });
            return updated;
        });
    }, []);

    // Reset to defaults
    const resetToDefaults = useCallback(() => {
        setSettings(DEFAULT_SETTINGS);
        chrome.storage.sync.set({ [STORAGE_KEY]: DEFAULT_SETTINGS });
    }, []);

    // Export settings as JSON
    const exportSettings = useCallback(() => {
        const exportData = {
            version: CURRENT_VERSION,
            exportDate: new Date().toISOString(),
            settings: settings,
        };
        return JSON.stringify(exportData, null, 2);
    }, [settings]);

    // Import settings from JSON
    const importSettings = useCallback((jsonString: string): { success: boolean; error?: string } => {
        try {
            const importData = JSON.parse(jsonString);
            
            if (!importData.settings) {
                return { success: false, error: 'Invalid settings format' };
            }

            // Validate and merge with defaults
            const imported = { ...DEFAULT_SETTINGS, ...importData.settings };
            
            setSettings(imported);
            chrome.storage.sync.set({ [STORAGE_KEY]: imported });
            
            return { success: true };
        } catch (error) {
            return { success: false, error: 'Failed to parse JSON' };
        }
    }, []);

    return {
        settings,
        isLoading,
        saveSetting,
        saveSettings,
        resetToDefaults,
        exportSettings,
        importSettings,
        defaults: DEFAULT_SETTINGS,
    };
};
