import { useState, useCallback, useEffect, useRef } from 'react';
import { useGrokRetryGrokStorage } from './useGrokRetryGrokStorage';

const TEST_BRIDGE_VERSION = 'storage-hook@1';

// Persistent preferences (chrome.storage.local)
interface PersistentData {
    maxRetries: number;
    autoRetryEnabled: boolean;
    lastPromptValue: string;
    videoGoal: number;
    videoGroup: string[]; // Array of related post IDs in this video generation session
    originalMediaId: string | null; // Original image ID that started the video generation session
}

export type SessionOutcome = 'idle' | 'pending' | 'success' | 'failure' | 'cancelled';

export interface SessionSummary {
    outcome: SessionOutcome;
    completedVideos: number;
    videoGoal: number;
    retriesAttempted: number;
    maxRetries: number;
    creditsUsed: number;
    layer1Failures: number;
    layer2Failures: number;
    layer3Failures: number;
    endedAt: number;
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
    lastSessionOutcome: SessionOutcome;
    lastSessionSummary: SessionSummary | null;
    sessionMediaId: string | null;
}

// Combined interface for external API
export interface PostData extends PersistentData, SessionData { }

const PERSISTENT_STORAGE_PREFIX = 'grokRetryPost_';
const SESSION_STORAGE_PREFIX = 'grokRetrySession_';
const GLOBAL_SETTINGS_KEY = 'grokRetry_globalSettings';
const PERSISTENT_KEYS: (keyof PersistentData)[] = ['maxRetries', 'autoRetryEnabled', 'lastPromptValue', 'videoGoal', 'videoGroup'];
const SESSION_KEYS: (keyof SessionData)[] = ['retryCount', 'isSessionActive', 'videosGenerated', 'lastAttemptTime', 'lastFailureTime', 'canRetry', 'logs', 'attemptProgress', 'lastSessionOutcome', 'lastSessionSummary', 'sessionMediaId'];
const SESSION_COUNTER_KEYS: (keyof SessionData)[] = ['creditsUsed', 'layer1Failures', 'layer2Failures', 'layer3Failures'];
const ALL_SESSION_KEYS: (keyof SessionData)[] = [...SESSION_KEYS, ...SESSION_COUNTER_KEYS];

const createDefaultPostData = (): PostData => ({
    maxRetries: 3,
    autoRetryEnabled: true,
    lastPromptValue: '',
    videoGoal: 1,
    videoGroup: [],
    originalMediaId: null,
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
    lastSessionOutcome: 'idle',
    lastSessionSummary: null,
    sessionMediaId: null,
});

export const useGrokRetryPostStorage = (postId: string | null, mediaId: string | null) => {
    const [data, setData] = useState<PostData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const lastLoadedPostIdRef = useRef<string | null>(null);
    const lastLoadedSessionKeyRef = useRef<string | null>(null);
    const sessionKeyId = mediaId ?? postId;

    // Load from both chrome.storage.local (persistent) and sessionStorage (session) when postId changes
    useEffect(() => {
        if (!sessionKeyId) {
            setIsLoading(false);
            lastLoadedPostIdRef.current = null;
            lastLoadedSessionKeyRef.current = null;
            try {
                (window as any).__grok_test = (window as any).__grok_test || {};
                (window as any).__grok_test.__storageHydrated = true;
            } catch { }
            return;
        }

        // Skip reload if we're already loaded for this session key and post combination
        if (lastLoadedPostIdRef.current === postId && lastLoadedSessionKeyRef.current === sessionKeyId) {
            console.log(`[Grok Retry] Skipping redundant reload for session: post=${postId} sessionKey=${sessionKeyId}`);
            return;
        }

        console.log(`[Grok Retry] Loading storage for post: ${postId} (sessionKey: ${sessionKeyId})`);

        const persistentKey = postId ? `${PERSISTENT_STORAGE_PREFIX}${postId}` : null;
        const sessionKey = `${SESSION_STORAGE_PREFIX}${sessionKeyId}`;

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
                videoGroup: [],
                originalMediaId: null,
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
                lastSessionOutcome: 'idle',
                lastSessionSummary: null,
                sessionMediaId: null,
            };

            // Load persistent data from chrome.storage.local
            const handlePersistentResult = (persistentData: PersistentData) => {

                // Load session data from sessionStorage
                let sessionData = DEFAULT_SESSION_DATA;
                try {
                    const stored = sessionStorage.getItem(sessionKey);
                    if (stored) {
                        sessionData = { ...DEFAULT_SESSION_DATA, ...JSON.parse(stored) };
                    } else if (postId) {
                        // Legacy fallback: copy session data stored under the postId key before mediaId adoption
                        const legacyKey = `${SESSION_STORAGE_PREFIX}${postId}`;
                        const legacyStored = sessionStorage.getItem(legacyKey);
                        if (legacyStored) {
                            sessionStorage.setItem(sessionKey, legacyStored);
                            sessionData = { ...DEFAULT_SESSION_DATA, ...JSON.parse(legacyStored) };
                            console.log('[Grok Retry] Migrated legacy session data to media-based key');
                        }
                    }
                } catch (error) {
                    console.error('[Grok Retry] Failed to load session storage:', error);
                }

                const combined = { ...persistentData, ...sessionData };
                setData(combined);
                lastLoadedPostIdRef.current = postId; // Mark this postId as loaded
                lastLoadedSessionKeyRef.current = sessionKeyId;
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
            };

            if (persistentKey && typeof chrome !== 'undefined' && chrome?.storage?.local) {
                chrome.storage.local.get([persistentKey], (result) => {
                    const persistentData = result[persistentKey] || DEFAULT_PERSISTENT_DATA;
                    handlePersistentResult(persistentData);
                });
            } else {
                handlePersistentResult(DEFAULT_PERSISTENT_DATA);
            }
        });
    }, [postId, sessionKeyId]);

    // Grok storage validation - monitor for discrepancies between our tracking and Grok's data
    const grokData = useGrokRetryGrokStorage(data?.originalMediaId ?? null, {
        pollInterval: 500, // Less frequent for validation only
        debug: false
    });

    useEffect(() => {
        if (!grokData || !data || !data.originalMediaId) return;

        // Validate videos generated
        if (data.videosGenerated !== grokData.videosGenerated) {
            console.warn('[Storage Validation] Video count mismatch:', {
                ours: data.videosGenerated,
                grok: grokData.videosGenerated,
                difference: grokData.videosGenerated - data.videosGenerated,
                originalMediaId: data.originalMediaId
            });
        }

        // Validate credits used
        if (data.creditsUsed !== grokData.creditsUsed) {
            console.warn('[Storage Validation] Credits count mismatch:', {
                ours: data.creditsUsed,
                grok: grokData.creditsUsed,
                difference: grokData.creditsUsed - data.creditsUsed,
                originalMediaId: data.originalMediaId
            });
        }

        // Validate video group - check for videos we're missing
        const ourVideoSet = new Set(data.videoGroup);
        const missing = grokData.videoIds.filter(id => !ourVideoSet.has(id));

        if (missing.length > 0) {
            console.warn('[Storage Validation] Missing videos in our tracking:', {
                missing,
                ourCount: data.videoGroup.length,
                grokCount: grokData.videoIds.length,
                originalMediaId: data.originalMediaId
            });
        }

        // Log successful videos (we currently don't track these separately)
        if (grokData.successfulCount > 0) {
            console.log('[Storage Validation] Successful videos detected:', {
                count: grokData.successfulCount,
                videoIds: grokData.successfulVideoIds,
                originalMediaId: data.originalMediaId
            });
        }
    }, [grokData, data]);

    // Listen for log append events to update state in realtime
    useEffect(() => {
        const handler = (e: Event) => {
            try {
                if (!sessionKeyId) return;
                const custom = e as CustomEvent<{ key?: string | null; postId?: string | null; line: string }>;
                const targetKey = custom.detail?.key ?? custom.detail?.postId ?? null;
                if (targetKey !== sessionKeyId && custom.detail?.postId !== postId) return;
                const sessionKey = `${SESSION_STORAGE_PREFIX}${sessionKeyId}`;
                const stored = sessionStorage.getItem(sessionKey);
                const existing = stored ? JSON.parse(stored) : {};
                const logs = Array.isArray(existing.logs) ? existing.logs : [];
                setData(prev => prev ? { ...prev, logs } : null);
            } catch { }
        };
        window.addEventListener('grok:log', handler as EventListener);
        return () => window.removeEventListener('grok:log', handler as EventListener);
    }, [postId, sessionKeyId]);

    const applyUpdates = useCallback((updates: Partial<PostData>, target?: { postId?: string | null; sessionKey?: string | null }) => {
        const targetPostId = target?.postId ?? postId;
        const targetSessionKey = target?.sessionKey ?? sessionKeyId;

        if (!targetPostId && !targetSessionKey) return;

        try {
            const w: any = window;
            w.__grok_lastSave = {
                targetPostId,
                targetSessionKey,
                updates,
                hookPostId: postId,
                hookSessionKey: sessionKeyId,
            };
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

        const shouldUpdateState = (targetSessionKey && targetSessionKey === sessionKeyId) || (targetPostId && targetPostId === postId);
        if (shouldUpdateState) {
            setData((prev) => {
                const base = prev ?? createDefaultPostData();
                const next = { ...base, ...updates } as PostData;
                try {
                    const w: any = window;
                    if (targetPostId) w.__grok_activePostId = targetPostId;
                    if (typeof next.retryCount === 'number') w.__grok_retryCount = next.retryCount;
                    if (typeof next.canRetry === 'boolean') w.__grok_canRetry = next.canRetry;
                    w.__grok_lastSetState = { prev, updates, next };
                    w.__grok_lastSetStateCount = (w.__grok_lastSetStateCount || 0) + 1;
                } catch { }
                return next;
            });
        }

        if (Object.keys(persistentUpdates).length > 0 && targetPostId && typeof chrome !== 'undefined' && chrome?.storage?.local) {
            const persistentKey = `${PERSISTENT_STORAGE_PREFIX}${targetPostId}`;
            chrome.storage.local.get([persistentKey], (result) => {
                const existing = result[persistentKey] || {};
                chrome.storage.local.set({ [persistentKey]: { ...existing, ...persistentUpdates } }, () => {
                    if (chrome.runtime.lastError) {
                        console.error('[Grok Retry] Failed to save persistent storage:', chrome.runtime.lastError);
                    }
                });
            });
        }

        if (Object.keys(sessionUpdates).length > 0 && targetSessionKey) {
            const sessionKey = `${SESSION_STORAGE_PREFIX}${targetSessionKey}`;
            try {
                const stored = sessionStorage.getItem(sessionKey);
                const existing = stored ? JSON.parse(stored) : {};
                sessionStorage.setItem(sessionKey, JSON.stringify({ ...existing, ...sessionUpdates }));
            } catch (error) {
                console.error('[Grok Retry] Failed to save session storage:', error);
            }
        }
    }, [postId, sessionKeyId]);

    // Save to appropriate storage based on key type
    const saveToPost = useCallback((updates: Partial<PostData>) => {
        applyUpdates(updates);
    }, [applyUpdates]);

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
        if (!sessionKeyId) return;
        const sessionKey = `${SESSION_STORAGE_PREFIX}${sessionKeyId}`;
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
                window.dispatchEvent(new CustomEvent('grok:log', { detail: { key: sessionKeyId, postId, line, level } }));
            } catch { }
        } catch (error) {
            console.error('[Grok Retry] Failed to append log:', error);
        }
    }, [postId, sessionKeyId]);

    // Clear post data (both persistent and session)
    const clear = useCallback(() => {
        if (!sessionKeyId) return;

        setData(postData);

        // Clear persistent storage
        if (postId) {
            const persistentKey = `${PERSISTENT_STORAGE_PREFIX}${postId}`;
            chrome.storage.local.remove(persistentKey, () => {
                if (chrome.runtime.lastError) {
                    console.error('[Grok Retry] Failed to clear persistent storage:', chrome.runtime.lastError);
                } else {
                    console.log('[Grok Retry] Cleared persistent state for post:', postId);
                }
            });
        }

        // Clear session storage
        const sessionKey = `${SESSION_STORAGE_PREFIX}${sessionKeyId}`;
        try {
            sessionStorage.removeItem(sessionKey);
            console.log('[Grok Retry] Cleared session state for session key:', sessionKeyId);
        } catch (error) {
            console.error('[Grok Retry] Failed to clear session storage:', error);
        }
    }, [postId, postData, sessionKeyId]);

    // Migrate state from one post to another (used during route changes)
    const migrateState = useCallback((fromPostId: string, toPostId: string, options?: { fromSessionKey?: string | null; toSessionKey?: string | null }) => {
        console.log(`[Grok Retry] Migrating state from ${fromPostId} to ${toPostId}`);

        const fromSessionKey = options?.fromSessionKey ?? fromPostId;
        const toSessionKey = options?.toSessionKey ?? toPostId;

        // Load state from the old post
        const fromPersistentKey = `${PERSISTENT_STORAGE_PREFIX}${fromPostId}`;
        const legacyFromSessionKey = `${SESSION_STORAGE_PREFIX}${fromPostId}`;
        const resolvedFromSessionKey = fromSessionKey ? `${SESSION_STORAGE_PREFIX}${fromSessionKey}` : legacyFromSessionKey;

        if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
            chrome.storage.local.get([fromPersistentKey], (result) => {
                const persistentData = result[fromPersistentKey];
                if (persistentData) {
                    // Add the new post to the videoGroup if not already present
                    const videoGroup = Array.isArray(persistentData.videoGroup) ? persistentData.videoGroup : [fromPostId];
                    if (!videoGroup.includes(fromPostId)) {
                        videoGroup.unshift(fromPostId); // Add original post at start if missing
                    }
                    if (!videoGroup.includes(toPostId)) {
                        videoGroup.push(toPostId); // Add new post at end
                    }

                    // Copy to new post with updated videoGroup
                    const toPersistentKey = `${PERSISTENT_STORAGE_PREFIX}${toPostId}`;
                    const updatedData = { ...persistentData, videoGroup };
                    chrome.storage.local.set({ [toPersistentKey]: updatedData }, () => {
                        console.log('[Grok Retry] Migrated persistent data to new post with videoGroup:', videoGroup);
                    });

                    // Also update the original post's videoGroup to include the new post
                    chrome.storage.local.set({ [fromPersistentKey]: { ...persistentData, videoGroup } }, () => {
                        console.log('[Grok Retry] Updated original post videoGroup');
                    });
                }
            });
        }

        try {
            const sessionData = sessionStorage.getItem(resolvedFromSessionKey);
            if (sessionData && toSessionKey) {
                const resolvedToSessionKey = `${SESSION_STORAGE_PREFIX}${toSessionKey}`;
                if (resolvedFromSessionKey !== resolvedToSessionKey) {
                    sessionStorage.setItem(resolvedToSessionKey, sessionData);
                    console.log('[Grok Retry] Migrated session data to new session key');
                }

                // Also persist under legacy post-based key for backward compatibility
                const legacyToSessionKey = `${SESSION_STORAGE_PREFIX}${toPostId}`;
                if (legacyToSessionKey !== resolvedToSessionKey) {
                    sessionStorage.setItem(legacyToSessionKey, sessionData);
                }

                lastLoadedPostIdRef.current = null;
                lastLoadedSessionKeyRef.current = null;
            }
        } catch (error) {
            console.error('[Grok Retry] Failed to migrate session storage:', error);
        }
    }, []);

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
                    const resolvedKey = sessionKeyId || id;
                    try {
                        const sessionKey = `${SESSION_STORAGE_PREFIX}${resolvedKey}`;
                        const stored = sessionStorage.getItem(sessionKey);
                        if (!stored) {
                            sessionStorage.setItem(sessionKey, JSON.stringify({ retryCount: 0, canRetry: false, isSessionActive: false }));
                        }
                    } catch { }
                }
            };
            w.__grok_test.getSessionSnapshot = () => {
                const targetId = postId || w.__grok_forcedPostId || w.__grok_activePostId || null;
                const targetSessionKey = sessionKeyId || w.__grok_test.__retrySessionKey || targetId;
                if (!targetSessionKey) return null;
                const sessionKey = `${SESSION_STORAGE_PREFIX}${targetSessionKey}`;
                try {
                    const stored = sessionStorage.getItem(sessionKey);
                    return stored ? JSON.parse(stored) : null;
                } catch {
                    return null;
                }
            };
            w.__grok_test.activateSession = (id?: string | null) => {
                const targetId = id || postId || w.__grok_forcedPostId || w.__grok_activePostId || null;
                const targetSessionKey = sessionKeyId || w.__grok_test.__retrySessionKey || targetId;
                applyUpdates({ isSessionActive: true }, { postId: targetId, sessionKey: targetSessionKey });
            };
            w.__grok_test.enableRetry = (id?: string | null) => {
                const targetId = id || postId || w.__grok_forcedPostId || w.__grok_activePostId || null;
                const targetSessionKey = sessionKeyId || w.__grok_test.__retrySessionKey || targetId;
                applyUpdates({ canRetry: true }, { postId: targetId, sessionKey: targetSessionKey });
            };
            w.__grok_test.disableRetry = (id?: string | null) => {
                const targetId = id || postId || w.__grok_forcedPostId || w.__grok_activePostId || null;
                const targetSessionKey = sessionKeyId || w.__grok_test.__retrySessionKey || targetId;
                applyUpdates({ canRetry: false }, { postId: targetId, sessionKey: targetSessionKey });
            };
            w.__grok_test.mergeSession = (updates: Partial<PostData>, id?: string | null) => {
                const targetId = id || postId || w.__grok_forcedPostId || w.__grok_activePostId || null;
                const targetSessionKey = sessionKeyId || w.__grok_test.__retrySessionKey || targetId;
                applyUpdates(updates, { postId: targetId, sessionKey: targetSessionKey });
            };
            w.__grok_test.__bridgeVersion = TEST_BRIDGE_VERSION;
        } catch { }
    }, [applyUpdates, postId, save, sessionKeyId]);

    return { data: postData, save, saveAll: saveToPost, clear, migrateState, isLoading, appendLog };
};
