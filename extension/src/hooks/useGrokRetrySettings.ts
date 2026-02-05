import { useState, useCallback, useEffect } from 'react';
import {
    HookStore,
    createStore,
    extractState,
    isHookStore,
    ENABLE_MIGRATION_CLEANUP,
    MigrationConfig,
    applyMigrations
} from '@/types/storage';

// Global settings that apply as defaults across all posts/sessions
export interface KeyboardShortcutSettings {
    startStop: string;
    muteUnmute: string;
    toggleMinimize: string;
    toggleFullscreen: string;
    openSettings: string;
}

export interface GlobalSettings {
    // Default values for new posts
    defaultMaxRetries: number;
    defaultVideoGoal: number;
    defaultAutoRetryEnabled: boolean;

    // Prompt history
    promptHistoryLimit: number;

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
    autoSwitchToResultsOnComplete: boolean; // Auto-open results after a session finishes

    // Selector overrides (for language differences or when selectors change)
    customSelectors?: {
        notificationSection?: string;
        makeVideoButton?: string;
        videoElement?: string;
        promptTextarea?: string;
    };
    keyboardShortcuts: KeyboardShortcutSettings;

    // Import/Export
    lastExportDate?: string;
}

const PROMPT_HISTORY_LIMIT_MIN = 1;
const PROMPT_HISTORY_LIMIT_MAX = 200;
const DEFAULT_PROMPT_HISTORY_LIMIT = 30;

const clampPromptHistoryLimit = (value: unknown): number => {
    const numeric =
        typeof value === 'number'
            ? value
            : parseInt(typeof value === 'string' ? value : String(value ?? DEFAULT_PROMPT_HISTORY_LIMIT), 10);

    if (!Number.isFinite(numeric)) {
        return DEFAULT_PROMPT_HISTORY_LIMIT;
    }

    return Math.max(
        PROMPT_HISTORY_LIMIT_MIN,
        Math.min(PROMPT_HISTORY_LIMIT_MAX, Math.round(numeric))
    );
};

const DEFAULT_SHORTCUTS: KeyboardShortcutSettings = {
    startStop: "Alt+Shift+S",
    muteUnmute: "Alt+Shift+M",
    toggleMinimize: "Alt+Shift+N",
    toggleFullscreen: "Alt+Shift+F",
    openSettings: "Alt+Shift+O",
};

const normalizeShortcuts = (shortcuts: GlobalSettings["keyboardShortcuts"] | undefined): KeyboardShortcutSettings => {
    const source = shortcuts ?? DEFAULT_SHORTCUTS;
    return {
        startStop: typeof source.startStop === "string" ? source.startStop : DEFAULT_SHORTCUTS.startStop,
        muteUnmute: typeof source.muteUnmute === "string" ? source.muteUnmute : DEFAULT_SHORTCUTS.muteUnmute,
        toggleMinimize: typeof source.toggleMinimize === "string" ? source.toggleMinimize : DEFAULT_SHORTCUTS.toggleMinimize,
        toggleFullscreen: typeof source.toggleFullscreen === "string" ? source.toggleFullscreen : DEFAULT_SHORTCUTS.toggleFullscreen,
        openSettings: typeof source.openSettings === "string" ? source.openSettings : DEFAULT_SHORTCUTS.openSettings,
    };
};

const normalizeSettings = (settings: GlobalSettings): GlobalSettings => ({
    ...settings,
    promptHistoryLimit: clampPromptHistoryLimit(settings.promptHistoryLimit),
    keyboardShortcuts: normalizeShortcuts(settings.keyboardShortcuts),
});

const DEFAULT_SETTINGS: GlobalSettings = {
    defaultMaxRetries: 3,
    defaultVideoGoal: 1,
    defaultAutoRetryEnabled: true,
    promptHistoryLimit: DEFAULT_PROMPT_HISTORY_LIMIT,
    retryClickCooldown: 8000,
    videoGenerationDelay: 8000,
    rateLimitWaitTime: 60000,
    rapidFailureThreshold: 6,
    defaultPanelWidth: 320,
    defaultPanelHeight: 400,
    startMinimized: false,
    showRapidFailureWarning: true,
    autoSwitchToDebug: false,
    autoSwitchToResultsOnComplete: false,
    customSelectors: undefined,
    keyboardShortcuts: { ...DEFAULT_SHORTCUTS },
};

export type SettingsStore = HookStore<GlobalSettings>;

const STORAGE_KEY = 'useGrokRetrySettings_store';
const OLD_STORAGE_KEY = 'grokRetry_globalSettings'; // Version 0
const CURRENT_VERSION = 1;

/**
 * Migration chain for useGrokRetrySettings.
 * Each migration transforms data from version N to N+1.
 */
const MIGRATION_CONFIG: MigrationConfig<GlobalSettings> = {
    migrations: [
        // v0 -> v1: Migrate from old key format to HookStore
        (v0Data: any): GlobalSettings => {
            console.log('[useGrokRetrySettings] Applying migration v0 -> v1');
            return { ...DEFAULT_SETTINGS, ...v0Data };
        },
        // v1 -> v2: Future migration placeholder
        // (v1Data: GlobalSettings): GlobalSettings => {
        //     return { ...v1Data, newField: 'default' };
        // },
    ],
    oldKeys: [OLD_STORAGE_KEY], // Clean up old key from v0
};

/**
 * Manages user configuration and preferences that sync across devices.
 * 
 * Provides centralized settings for:
 * - Default retry limits and video goals
 * - Timing configurations (cooldowns, delays, rate limits)
 * - UI default dimensions
 * - Feature toggles (warnings, auto-switches)
 * - Keyboard shortcuts
 * - Custom selector overrides
 * - Import/export functionality
 * 
 * Settings are synced across browser instances via chrome.storage.sync and include
 * validation, normalization, and version migration support.
 * 
 * Storage: chrome.storage.sync (synced across devices)
 * Key: 'useGrokRetrySettings_store'
 * Structure: HookStore<GlobalSettings> with version tracking
 * 
 * Migration Strategy:
 * - Version 0 → 1: Migrate from 'grokRetry_globalSettings' to HookStore wrapper
 *   - Removes old key after successful migration
 * 
 * @returns Settings object with save functions, import/export, and reset capability
 * 
 * @example
 * ```tsx
 * const { settings, saveSetting, exportSettings } = useGrokRetrySettings();
 * 
 * // Update single setting
 * saveSetting('defaultMaxRetries', 5);
 * 
 * // Export all settings
 * const json = exportSettings();
 * ```
 */
export const useGrokRetrySettings = () => {
    const [settings, setSettings] = useState<GlobalSettings>(() => ({ ...DEFAULT_SETTINGS }));
    const [isLoading, setIsLoading] = useState(true);

    // Load settings from chrome.storage.sync (syncs across devices)
    useEffect(() => {
        chrome.storage.sync.get([STORAGE_KEY, OLD_STORAGE_KEY], (result) => {
            const rawData = result[STORAGE_KEY];
            const oldData = result[OLD_STORAGE_KEY];
            let state: GlobalSettings;
            let currentVersion = 0;
            const keysToRemove: string[] = [];

            // Determine current version and data source
            if (oldData) {
                // Version 0: Old key exists
                state = oldData;
                currentVersion = 0;
                keysToRemove.push(...(MIGRATION_CONFIG.oldKeys || []));
            } else if (rawData && isHookStore<GlobalSettings>(rawData)) {
                // Already in HookStore format
                state = rawData.state;
                currentVersion = rawData.version;
            } else if (rawData) {
                // Raw data without HookStore (shouldn't happen)
                state = rawData;
                currentVersion = 0;
            } else {
                // No data exists
                state = DEFAULT_SETTINGS;
                currentVersion = CURRENT_VERSION; // Skip migration
            }

            // Apply migrations if needed
            if (currentVersion < CURRENT_VERSION) {
                console.log(`[useGrokRetrySettings] Migrating from v${currentVersion} to v${CURRENT_VERSION}`);
                state = applyMigrations(
                    state,
                    currentVersion,
                    CURRENT_VERSION,
                    MIGRATION_CONFIG
                );
            }

            const mergedSettings = normalizeSettings(state);
            setSettings(mergedSettings);
            setIsLoading(false);

            // Save in new format and clean up old keys if we migrated
            if (currentVersion < CURRENT_VERSION) {
                const store = createStore(mergedSettings, CURRENT_VERSION);
                chrome.storage.sync.set({ [STORAGE_KEY]: store });

                if (ENABLE_MIGRATION_CLEANUP && keysToRemove.length > 0) {
                    chrome.storage.sync.remove(keysToRemove);
                    console.log('[useGrokRetrySettings] Migration complete, removed old keys:', keysToRemove);
                } else if (keysToRemove.length > 0) {
                    console.log('[useGrokRetrySettings] Migration complete (cleanup disabled, old keys preserved):', keysToRemove);
                } else {
                    console.log('[useGrokRetrySettings] Migration complete');
                }
            }
        });

        // Listen for changes from other tabs/devices
        const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
            if (areaName === 'sync' && changes[STORAGE_KEY]) {
                const newStore = changes[STORAGE_KEY].newValue as SettingsStore | undefined;
                const state = extractState(newStore, DEFAULT_SETTINGS);
                setSettings(
                    normalizeSettings({
                        ...DEFAULT_SETTINGS,
                        ...state,
                    } as GlobalSettings)
                );
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
            const updated = normalizeSettings({ ...prev, [key]: value } as GlobalSettings);
            const store = createStore(updated, CURRENT_VERSION);
            chrome.storage.sync.set({ [STORAGE_KEY]: store });
            return updated;
        });
    }, []);

    // Save multiple settings at once
    const saveSettings = useCallback((updates: Partial<GlobalSettings>) => {
        setSettings((prev) => {
            const updated = normalizeSettings({ ...prev, ...updates } as GlobalSettings);
            const store = createStore(updated, CURRENT_VERSION);
            chrome.storage.sync.set({ [STORAGE_KEY]: store });
            return updated;
        });
    }, []);

    // Reset to defaults
    const resetToDefaults = useCallback(() => {
        const defaultsClone = normalizeSettings({ ...DEFAULT_SETTINGS });
        setSettings(defaultsClone);
        const store = createStore(defaultsClone, CURRENT_VERSION);
        chrome.storage.sync.set({ [STORAGE_KEY]: store });
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
            const imported = normalizeSettings({ ...DEFAULT_SETTINGS, ...importData.settings } as GlobalSettings);

            setSettings(imported);
            const store = createStore(imported, CURRENT_VERSION);
            chrome.storage.sync.set({ [STORAGE_KEY]: store });

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
