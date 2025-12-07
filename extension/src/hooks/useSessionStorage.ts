import { useState, useCallback, useEffect } from 'react';

// Persistent preferences (chrome.storage.local)
interface PersistentData {
    maxRetries: number;
    autoRetryEnabled: boolean;
    lastPromptValue: string;
    videoGoal: number;
}

// Session-specific state (sessionStorage)
interface SessionData {
    retryCount: number;
    isSessionActive: boolean;
    videosGenerated: number;
    lastAttemptTime: number;
    lastFailureTime: number;
    canRetry: boolean;
    logs?: string[];
}

// Combined interface for external API
export interface PostData extends PersistentData, SessionData { }

const PERSISTENT_STORAGE_PREFIX = 'grokRetryPost_';
const SESSION_STORAGE_PREFIX = 'grokRetrySession_';
const GLOBAL_SETTINGS_KEY = 'grokRetry_globalSettings';

export const usePostStorage = (postId: string | null) => {
    const [data, setData] = useState<PostData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Load from both chrome.storage.local (persistent) and sessionStorage (session) when postId changes
    useEffect(() => {
        if (!postId) {
            setIsLoading(false);
            return;
        }

        const persistentKey = `${PERSISTENT_STORAGE_PREFIX}${postId}`;
        const sessionKey = `${SESSION_STORAGE_PREFIX}${postId}`;

        // Load global settings first to use as defaults
        chrome.storage.sync.get([GLOBAL_SETTINGS_KEY], (globalResult) => {
            const globalSettings = globalResult[GLOBAL_SETTINGS_KEY] || {};
            
            // Create defaults from global settings
            const DEFAULT_PERSISTENT_DATA: PersistentData = {
                maxRetries: globalSettings.defaultMaxRetries ?? 3,
                autoRetryEnabled: globalSettings.defaultAutoRetryEnabled ?? true,
                lastPromptValue: '',
                videoGoal: globalSettings.defaultVideoGoal ?? 1,
            };

            const DEFAULT_SESSION_DATA: SessionData = {
                retryCount: 0,
                isSessionActive: false,
                videosGenerated: 0,
                lastAttemptTime: 0,
                lastFailureTime: 0,
                canRetry: false,
                logs: [],
            };

            // Load persistent data from chrome.storage.local
            chrome.storage.local.get([persistentKey], (result) => {
                const persistentData = result[persistentKey] || DEFAULT_PERSISTENT_DATA;

            // Load session data from sessionStorage
            let sessionData = DEFAULT_SESSION_DATA;
            try {
                const stored = sessionStorage.getItem(sessionKey);
                if (stored) {
                    sessionData = { ...DEFAULT_SESSION_DATA, ...JSON.parse(stored) };
                }
            } catch (error) {
                console.error('[Grok Retry] Failed to load session storage:', error);
            }

                setData({ ...persistentData, ...sessionData });
                console.log('[Grok Retry] Loaded state for post:', postId, { persistentData, sessionData });
                setIsLoading(false);
            });
        });
    }, [postId]);

    // Listen for log append events to update state in realtime
    useEffect(() => {
        const handler = (e: Event) => {
            try {
                const custom = e as CustomEvent<{ postId: string | null; line: string }>;
                if (!postId || custom.detail?.postId !== postId) return;
                const sessionKey = `${SESSION_STORAGE_PREFIX}${postId}`;
                const stored = sessionStorage.getItem(sessionKey);
                const existing = stored ? JSON.parse(stored) : {};
                const logs = Array.isArray(existing.logs) ? existing.logs : [];
                setData(prev => prev ? { ...prev, logs } : null);
            } catch { }
        };
        window.addEventListener('grok:log', handler as EventListener);
        return () => window.removeEventListener('grok:log', handler as EventListener);
    }, [postId]);

    // Save to appropriate storage based on key type
    const saveToPost = useCallback((updates: Partial<PostData>) => {
        if (!postId) return;

        // Split updates into persistent and session data
        const persistentKeys: (keyof PersistentData)[] = ['maxRetries', 'autoRetryEnabled', 'lastPromptValue', 'videoGoal'];
        const sessionKeys: (keyof SessionData)[] = ['retryCount', 'isSessionActive', 'videosGenerated', 'lastAttemptTime', 'lastFailureTime', 'canRetry', 'logs'];

        const persistentUpdates: Partial<PersistentData> = {};
        const sessionUpdates: Partial<SessionData> = {};

        Object.keys(updates).forEach(key => {
            if (persistentKeys.includes(key as keyof PersistentData)) {
                (persistentUpdates as any)[key] = updates[key as keyof PostData];
            }
            if (sessionKeys.includes(key as keyof SessionData)) {
                (sessionUpdates as any)[key] = updates[key as keyof PostData];
            }
        });

        // Update React state immediately
        setData((prev) => prev ? { ...prev, ...updates } : null);

        // Save persistent data to chrome.storage.local
        if (Object.keys(persistentUpdates).length > 0) {
            const persistentKey = `${PERSISTENT_STORAGE_PREFIX}${postId}`;
            chrome.storage.local.get([persistentKey], (result) => {
                const existing = result[persistentKey] || {};
                chrome.storage.local.set({ [persistentKey]: { ...existing, ...persistentUpdates } }, () => {
                    if (chrome.runtime.lastError) {
                        console.error('[Grok Retry] Failed to save persistent storage:', chrome.runtime.lastError);
                    }
                });
            });
        }

        // Save session data to sessionStorage
        if (Object.keys(sessionUpdates).length > 0) {
            const sessionKey = `${SESSION_STORAGE_PREFIX}${postId}`;
            try {
                const stored = sessionStorage.getItem(sessionKey);
                const existing = stored ? JSON.parse(stored) : {};
                sessionStorage.setItem(sessionKey, JSON.stringify({ ...existing, ...sessionUpdates }));
            } catch (error) {
                console.error('[Grok Retry] Failed to save session storage:', error);
            }
        }
    }, [postId]);

    // Provide default data if not loaded yet
    const postData = data || {
        maxRetries: 3,
        autoRetryEnabled: true,
        lastPromptValue: '',
        videoGoal: 1,
        retryCount: 0,
        isSessionActive: false,
        videosGenerated: 0,
        lastAttemptTime: 0,
        lastFailureTime: 0,
        canRetry: false,
        logs: [],
    };

    // Save a specific key
    const save = useCallback(<K extends keyof PostData>(
        key: K,
        value: PostData[K]
    ) => {
        saveToPost({ [key]: value });
    }, [saveToPost]);

    // Append a log line to session logs
    const appendLog = useCallback((line: string, level: 'info' | 'warn' | 'error' = 'info') => {
        if (!postId) return;
        const sessionKey = `${SESSION_STORAGE_PREFIX}${postId}`;
        try {
            const stored = sessionStorage.getItem(sessionKey);
            const existing = stored ? JSON.parse(stored) : {};
            const logs = Array.isArray(existing.logs) ? existing.logs : [];
            const next = [...logs, `${new Date().toLocaleTimeString()} — ${level.toUpperCase()} — ${line}`].slice(-200);
            sessionStorage.setItem(sessionKey, JSON.stringify({ ...existing, logs: next }));
            // reflect in state
            setData(prev => prev ? { ...prev, logs: next } : null);
            // also dispatch event for live listeners
            try {
                window.dispatchEvent(new CustomEvent('grok:log', { detail: { postId, line, level } }));
            } catch { }
        } catch (error) {
            console.error('[Grok Retry] Failed to append log:', error);
        }
    }, [postId]);

    // Clear post data (both persistent and session)
    const clear = useCallback(() => {
        if (!postId) return;

        setData(postData);

        // Clear persistent storage
        const persistentKey = `${PERSISTENT_STORAGE_PREFIX}${postId}`;
        chrome.storage.local.remove(persistentKey, () => {
            if (chrome.runtime.lastError) {
                console.error('[Grok Retry] Failed to clear persistent storage:', chrome.runtime.lastError);
            } else {
                console.log('[Grok Retry] Cleared persistent state for post:', postId);
            }
        });

        // Clear session storage
        const sessionKey = `${SESSION_STORAGE_PREFIX}${postId}`;
        try {
            sessionStorage.removeItem(sessionKey);
            console.log('[Grok Retry] Cleared session state for post:', postId);
        } catch (error) {
            console.error('[Grok Retry] Failed to clear session storage:', error);
        }
    }, [postId, postData]);

    return { data: postData, save, saveAll: saveToPost, clear, isLoading, appendLog };
};
