import { useState, useCallback, useEffect } from 'react';

const TEST_BRIDGE_VERSION = 'storage-hook@1';

// Persistent preferences (chrome.storage.local)
interface PersistentData {
    maxRetries: number;
    autoRetryEnabled: boolean;
    lastPromptValue: string;
    videoGoal: number;
}

// Session-specific state (sessionStorage)
export interface AttemptProgressEntry {
    attempt: number;
    percent: number;
    recordedAt: number;
}

interface SessionData {
    retryCount: number;
    isSessionActive: boolean;
    videosGenerated: number;
    lastAttemptTime: number;
    lastFailureTime: number;
    canRetry: boolean;
    logs?: string[];
    attemptProgress: AttemptProgressEntry[];
    creditsUsed: number;
    layer1Failures: number;
    layer2Failures: number;
    layer3Failures: number;
}

// Combined interface for external API
export interface PostData extends PersistentData, SessionData { }

const PERSISTENT_STORAGE_PREFIX = 'grokRetryPost_';
const SESSION_STORAGE_PREFIX = 'grokRetrySession_';
const GLOBAL_SETTINGS_KEY = 'grokRetry_globalSettings';
const PERSISTENT_KEYS: (keyof PersistentData)[] = ['maxRetries', 'autoRetryEnabled', 'lastPromptValue', 'videoGoal'];
const SESSION_KEYS: (keyof SessionData)[] = ['retryCount', 'isSessionActive', 'videosGenerated', 'lastAttemptTime', 'lastFailureTime', 'canRetry', 'logs', 'attemptProgress'];
const SESSION_COUNTER_KEYS: (keyof SessionData)[] = ['creditsUsed', 'layer1Failures', 'layer2Failures', 'layer3Failures'];
const ALL_SESSION_KEYS: (keyof SessionData)[] = [...SESSION_KEYS, ...SESSION_COUNTER_KEYS];

const createDefaultPostData = (): PostData => ({
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
    attemptProgress: [],
    creditsUsed: 0,
    layer1Failures: 0,
    layer2Failures: 0,
    layer3Failures: 0,
});

export const usePostStorage = (postId: string | null) => {
    const [data, setData] = useState<PostData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Load from both chrome.storage.local (persistent) and sessionStorage (session) when postId changes
    useEffect(() => {
        if (!postId) {
            setIsLoading(false);
            try {
                (window as any).__grok_test = (window as any).__grok_test || {};
                (window as any).__grok_test.__storageHydrated = true;
            } catch { }
            return;
        }

        const persistentKey = `${PERSISTENT_STORAGE_PREFIX}${postId}`;
        const sessionKey = `${SESSION_STORAGE_PREFIX}${postId}`;

        try {
            const w: any = window;
            w.__grok_test = w.__grok_test || {};
            w.__grok_test.__storageHydrated = false;
        } catch { }

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
                attemptProgress: [],
                creditsUsed: 0,
                layer1Failures: 0,
                layer2Failures: 0,
                layer3Failures: 0,
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

                const combined = { ...persistentData, ...sessionData };
                setData(combined);
                try {
                    const w: any = window;
                    w.__grok_activePostId = postId;
                    w.__grok_retryCount = combined.retryCount;
                    w.__grok_canRetry = combined.canRetry;
                } catch { }
                console.log('[Grok Retry] Loaded state for post:', postId, { persistentData, sessionData });
                setIsLoading(false);
                try {
                    const w: any = window;
                    w.__grok_test = w.__grok_test || {};
                    w.__grok_test.__storageHydrated = true;
                } catch { }
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

    const applyUpdatesToId = useCallback((targetId: string | null, updates: Partial<PostData>) => {
        if (!targetId) return;

        try {
            const w: any = window;
            w.__grok_lastSave = { targetId, updates, hookPostId: postId, matches: targetId === postId };
        } catch { }

        const persistentUpdates: Partial<PersistentData> = {};
        const sessionUpdates: Partial<SessionData> = {};

        Object.keys(updates).forEach((key) => {
            if (PERSISTENT_KEYS.includes(key as keyof PersistentData)) {
                (persistentUpdates as any)[key] = updates[key as keyof PostData];
            }
            if (ALL_SESSION_KEYS.includes(key as keyof SessionData)) {
                (sessionUpdates as any)[key] = updates[key as keyof PostData];
            }
        });

        // Update state when operating on the active hook post
        if (targetId === postId) {
            console.log('[Grok Retry][Test] applyUpdatesToId setData', { targetId, updates, postId });
            setData((prev) => {
                const base = prev ?? createDefaultPostData();
                const next = { ...base, ...updates } as PostData;
                try {
                    const w: any = window;
                    w.__grok_activePostId = targetId;
                    if (typeof next.retryCount === 'number') w.__grok_retryCount = next.retryCount;
                    if (typeof next.canRetry === 'boolean') w.__grok_canRetry = next.canRetry;
                    w.__grok_lastSetState = { prev, updates, next };
                    console.log('[Grok Retry][Test] setData count before', w.__grok_lastSetStateCount || 0);
                    w.__grok_lastSetStateCount = (w.__grok_lastSetStateCount || 0) + 1;
                    console.log('[Grok Retry][Test] setData count after', w.__grok_lastSetStateCount);
                } catch { }
                return next;
            });
        } else {
            try {
                const w: any = window;
                w.__grok_activePostId = targetId;
                if (typeof updates.retryCount === 'number') w.__grok_retryCount = updates.retryCount;
                if (typeof updates.canRetry === 'boolean') w.__grok_canRetry = updates.canRetry;
            } catch { }
        }

        if (Object.keys(persistentUpdates).length > 0 && typeof chrome !== 'undefined' && chrome?.storage?.local) {
            const persistentKey = `${PERSISTENT_STORAGE_PREFIX}${targetId}`;
            chrome.storage.local.get([persistentKey], (result) => {
                const existing = result[persistentKey] || {};
                chrome.storage.local.set({ [persistentKey]: { ...existing, ...persistentUpdates } }, () => {
                    if (chrome.runtime.lastError) {
                        console.error('[Grok Retry] Failed to save persistent storage:', chrome.runtime.lastError);
                    }
                });
            });
        }

        if (Object.keys(sessionUpdates).length > 0) {
            const sessionKey = `${SESSION_STORAGE_PREFIX}${targetId}`;
            try {
                const stored = sessionStorage.getItem(sessionKey);
                const existing = stored ? JSON.parse(stored) : {};
                sessionStorage.setItem(sessionKey, JSON.stringify({ ...existing, ...sessionUpdates }));
            } catch (error) {
                console.error('[Grok Retry] Failed to save session storage:', error);
            }
        }
    }, [postId]);

    // Save to appropriate storage based on key type
    const saveToPost = useCallback((updates: Partial<PostData>) => {
        applyUpdatesToId(postId, updates);
    }, [applyUpdatesToId, postId]);

    // Provide default data if not loaded yet
    const postData = data || createDefaultPostData();

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

    // Test bridge: expose methods that call the same storage helpers used in production
    useEffect(() => {
        try {
            const w: any = window;
            w.__grok_test = w.__grok_test || {};
            w.__grok_test.getActivePostId = () => w.__grok_activePostId || null;
            w.__grok_test.getForcedPostId = () => w.__grok_forcedPostId || null;
            w.__grok_test.getHookPostId = () => postId;
            w.__grok_test.setActivePostId = (id: string | null) => {
                if (typeof id === 'string') {
                    w.__grok_forcedPostId = id;
                    w.__grok_activePostId = id;
                    try {
                        const sessionKey = `${SESSION_STORAGE_PREFIX}${id}`;
                        const stored = sessionStorage.getItem(sessionKey);
                        if (!stored) {
                            sessionStorage.setItem(sessionKey, JSON.stringify({ retryCount: 0, canRetry: false, isSessionActive: false }));
                        }
                    } catch { }
                }
            };
            w.__grok_test.getSessionSnapshot = () => {
                const targetId = postId || w.__grok_forcedPostId || w.__grok_activePostId || null;
                if (!targetId) return null;
                const sessionKey = `${SESSION_STORAGE_PREFIX}${targetId}`;
                try {
                    const stored = sessionStorage.getItem(sessionKey);
                    return stored ? JSON.parse(stored) : null;
                } catch {
                    return null;
                }
            };
            w.__grok_test.activateSession = (id?: string | null) => {
                const targetId = id || postId || w.__grok_forcedPostId || w.__grok_activePostId || null;
                applyUpdatesToId(targetId, { isSessionActive: true });
            };
            w.__grok_test.enableRetry = (id?: string | null) => {
                const targetId = id || postId || w.__grok_forcedPostId || w.__grok_activePostId || null;
                applyUpdatesToId(targetId, { canRetry: true });
            };
            w.__grok_test.disableRetry = (id?: string | null) => {
                const targetId = id || postId || w.__grok_forcedPostId || w.__grok_activePostId || null;
                applyUpdatesToId(targetId, { canRetry: false });
            };
            w.__grok_test.mergeSession = (updates: Partial<PostData>, id?: string | null) => {
                const targetId = id || postId || w.__grok_forcedPostId || w.__grok_activePostId || null;
                applyUpdatesToId(targetId, updates);
            };
            w.__grok_test.__bridgeVersion = TEST_BRIDGE_VERSION;
        } catch { }
    }, [applyUpdatesToId, postId, save]);

    return { data: postData, save, saveAll: saveToPost, clear, isLoading, appendLog };
};
