import { useState, useCallback, useEffect, useRef } from 'react';
import { HookStore, createStore, extractState, isHookStore, ENABLE_MIGRATION_CLEANUP } from '@/types/storage';
import { useGrokRetryGrokStorage } from './useGrokRetryGrokStorage';
import { CLICK_COOLDOWN_MS, DEFAULT_MODERATION_RETRY_DELAY_MS } from '../lib/retryConstants';

/**
 * Centralized storage hook using mediaId-based architecture (matches Grok's useMediaStore).
 * Uses originalMediaId as the primary key to avoid race conditions during route changes.
 * 
 * Storage Structure (sessionStorage):
 * {
 *   sessionByMediaId: {
 *     [originalMediaId]: {
 *       // Session-specific data (cleared on new session)
 *       isActive: boolean;
 *       retryCount: number;
 *       videosGenerated: number;
 *       currentPostId: string | null;          // Current attempt's postId
 *       processedAttemptIds: string[];         // Prevents double-counting
 *       lastAttemptTime: number;
 *       lastFailureTime: number;
 *       canRetry: boolean;
 *       attemptProgress: AttemptProgressEntry[];
 *       creditsUsed: number;
 *       layer1Failures: number;
 *       layer2Failures: number;
 *       layer3Failures: number;
 *       outcome: SessionOutcome;
 *       logs: string[];
 *       lastSessionSummary: SessionSummary | null;
 *     }
 *   },
 *   persistentByMediaId: {
 *     [originalMediaId]: {
 *       // Persistent data (survives page reloads)
 *       maxRetries: number;
 *       autoRetryEnabled: boolean;
 *       lastPromptValue: string;
 *       videoGoal: number;
 *     }
 *   }
 * }
 * 
 * Migration Strategy:
 * - Version 0 → 1: Migrate from 'grokRetrySession_*' keys to mediaId-based storage
 *   - Scans all old per-post keys
 *   - Looks up originalMediaId from Grok's useMediaStore
 *   - Consolidates by mediaId, merging data from related posts
 *   - Removes old scattered keys (if ENABLE_MIGRATION_CLEANUP = true)
 * 
 * Load Flow:
 * 1. Get postId from URL
 * 2. Lookup originalMediaId from Grok's videoByMediaId
 * 3. Load sessionByMediaId[originalMediaId]
 * 4. Process new attempts from Grok (increment counts)
 * 5. Update storage and UI
 * 
 * Benefits:
 * - No race conditions (mediaId doesn't change during retries)
 * - No migration logic needed (same key throughout session)
 * - Matches Grok's architecture
 * - Auto-Retry OFF applies to all attempts from same image
 */

const STORE_KEY = 'useGrokRetryVideoSessions_store';
const CURRENT_VERSION = 1;

// Old storage key prefixes (version 0)
const OLD_SESSION_PREFIX = 'grokRetrySession_';
// const OLD_POST_PREFIX = 'grokRetryPost_'; // For future migration from chrome.storage.local

export type SessionOutcome = 'idle' | 'pending' | 'success' | 'failure' | 'cancelled';

export interface AttemptProgressEntry {
    attempt: number;
    percent: number;
    recordedAt: number;
}

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

// Session-specific state (cleared when starting new session)
export interface SessionData {
    isActive: boolean;
    retryCount: number;
    videosGenerated: number;

    // Track current attempt and processed attempts
    currentPostId: string | null;
    processedAttemptIds: string[];

    lastAttemptTime: number;
    lastFailureTime: number;
    canRetry: boolean;
    attemptProgress: AttemptProgressEntry[];
    creditsUsed: number;
    layer1Failures: number;
    layer2Failures: number;
    layer3Failures: number;
    outcome: SessionOutcome;
    logs: string[];
    lastSessionSummary: SessionSummary | null;

    // Pending retry orchestration
    pendingRetryAt: number | null;
    pendingRetryPrompt: string | null;
    pendingRetryOverride: boolean;
}

// Persistent preferences (survive page reloads)
export interface PersistentData {
    maxRetries: number;
    autoRetryEnabled: boolean;
    lastPromptValue: string;
    videoGoal: number;
}

// Combined interface for external API
export interface PostData extends SessionData, PersistentData { }

interface StoreState {
    sessionByMediaId: Record<string, SessionData>;
    persistentByMediaId: Record<string, PersistentData>;
    activeSessionMediaId: string | null;  // Track the mediaId of the active session
    promptBuffer: Record<string, string>;  // Buffer for prompt updates before mediaId is available (keyed by postId)
}

export type VideoSessionsStore = HookStore<StoreState>;

// Create default data
const createDefaultSessionData = (): SessionData => ({
    isActive: false,
    retryCount: 0,
    videosGenerated: 0,
    currentPostId: null,
    processedAttemptIds: [],
    lastAttemptTime: 0,
    lastFailureTime: 0,
    canRetry: false,
    attemptProgress: [],
    creditsUsed: 0,
    layer1Failures: 0,
    layer2Failures: 0,
    layer3Failures: 0,
    outcome: 'idle',
    logs: [],
    lastSessionSummary: null,
    pendingRetryAt: null,
    pendingRetryPrompt: null,
    pendingRetryOverride: false,
});

const applySessionDefaults = (session?: Partial<SessionData>): SessionData => ({
    ...createDefaultSessionData(),
    ...(session ?? {}),
});

const createDefaultPersistentData = (globalSettings: any = {}): PersistentData => ({
    maxRetries: globalSettings.defaultMaxRetries ?? 3,
    autoRetryEnabled: globalSettings.defaultAutoRetryEnabled ?? true,
    lastPromptValue: '',
    videoGoal: globalSettings.defaultVideoGoal ?? 1,
});

const selectPersistentData = (data?: Partial<PostData>): PersistentData => ({
    maxRetries: data?.maxRetries ?? 3,
    autoRetryEnabled: data?.autoRetryEnabled ?? true,
    lastPromptValue: data?.lastPromptValue ?? '',
    videoGoal: data?.videoGoal ?? 1,
});

/**
 * Find the originalMediaId for a given postId by searching Grok's videoByMediaId
 * 
 * Handles two cases:
 * 1. PostId is a video attempt - search through videoByMediaId arrays
 * 2. PostId is the original image with no video attempts yet - postId IS the mediaId
 * 
 * @param postId - The post ID to search for
 * @param videoByMediaId - Grok's videoByMediaId object from useMediaStore
 * @returns The originalMediaId if found, null otherwise
 */
const findOriginalMediaId = (postId: string, videoByMediaId: Record<string, any[]>): string | null => {
    // Case 1: Check if postId exists as a key in videoByMediaId (original image)
    if (postId in videoByMediaId) {
        return postId;
    }

    // Case 2: Search through video attempts to find which mediaId contains this postId
    for (const [mediaId, attempts] of Object.entries(videoByMediaId)) {
        if (Array.isArray(attempts) && attempts.some(attempt => attempt.id === postId)) {
            return mediaId;
        }
    }

    return null;
};

/**
 * Validate session data against Grok's useMediaStore to detect stale sessions.
 * 
 * A session is considered stale if:
 * - mediaId no longer exists in Grok's useMediaStore
 * - This indicates Grok has cleared the media (page refresh, new session, etc.)
 * 
 * @param mediaId - The media ID to validate
 * @param sessionData - The session data to validate
 * @returns true if session is valid, false if stale/invalid
 */
const validateSessionAgainstGrokStore = (mediaId: string, sessionData: SessionData): boolean => {
    // If session is not active, no need to validate
    if (!sessionData.isActive) {
        return true;
    }

    try {
        const grokStoreRaw = sessionStorage.getItem('useMediaStore');
        if (!grokStoreRaw) {
            // Grok store not yet initialised (common immediately after reload) - defer validation
            console.log('[useGrokRetryVideoSessions] Grok useMediaStore not found, deferring session validation');
            return true;
        }

        const grokStore = JSON.parse(grokStoreRaw);
        const videoByMediaId = grokStore?.state?.videoByMediaId;

        if (!videoByMediaId || typeof videoByMediaId !== 'object') {
            // Grok store structure not ready; assume session valid so we can retry validation later
            console.log('[useGrokRetryVideoSessions] Grok store has no videoByMediaId, deferring session validation');
            return true;
        }

        // Check if our mediaId exists in Grok's store
        const mediaExists = mediaId in videoByMediaId;

        if (!mediaExists) {
            console.warn(
                '[useGrokRetryVideoSessions] Session is stale - mediaId not in Grok store:',
                mediaId
            );
            return false;
        }

        return true;
    } catch (error) {
        console.error('[useGrokRetryVideoSessions] Error validating against Grok store:', error);
        // On error, assume valid to avoid false positives
        return true;
    }
};

/**
 * Clean stale session data by validating against Grok's useMediaStore.
 * Removes any session data that references media IDs no longer in Grok's store.
 * 
 * @param store - The store state to clean
 * @returns Cleaned store state
 */
const cleanStaleSessionData = (store: StoreState): StoreState => {
    const cleanedSessionByMediaId: Record<string, SessionData> = {};
    let staleCount = 0;

    for (const [mediaId, sessionData] of Object.entries(store.sessionByMediaId)) {
        if (validateSessionAgainstGrokStore(mediaId, sessionData)) {
            // Valid session, keep it
            cleanedSessionByMediaId[mediaId] = sessionData;
        } else {
            // Stale session, clear it but keep default state
            console.log('[useGrokRetryVideoSessions] Clearing stale session for mediaId:', mediaId);
            cleanedSessionByMediaId[mediaId] = createDefaultSessionData();
            staleCount++;
        }
    }

    if (staleCount > 0) {
        console.log(`[useGrokRetryVideoSessions] Cleaned ${staleCount} stale session(s)`);
    }

    return {
        sessionByMediaId: cleanedSessionByMediaId,
        persistentByMediaId: store.persistentByMediaId, // Keep persistent data unchanged
        activeSessionMediaId: store.activeSessionMediaId || null, // Preserve active session tracker
        promptBuffer: store.promptBuffer || {}, // Preserve prompt buffer
    };
};

// Parse store from sessionStorage
const parseStore = (): StoreState => {
    try {
        const raw = sessionStorage.getItem(STORE_KEY);

        if (!raw) {
            // Check for old format data (version 0)
            const migratedState = migrateFromV0();
            if (migratedState) {
                console.log('[useGrokRetryVideoSessions] Migrated from version 0');
                saveStore(migratedState);
                return migratedState;
            }
            return { sessionByMediaId: {}, persistentByMediaId: {}, activeSessionMediaId: null, promptBuffer: {} };
        }

        const parsed = JSON.parse(raw);

        if (isHookStore<StoreState>(parsed)) {
            // Already in new format - extract and validate
            let state = extractState(parsed, { sessionByMediaId: {}, persistentByMediaId: {}, activeSessionMediaId: null, promptBuffer: {} });

            // Ensure promptBuffer exists (for backward compatibility)
            if (!state.promptBuffer) {
                state.promptBuffer = {};
            }

            // Validate and clean stale session data
            state = cleanStaleSessionData(state);

            return state;
        } else {
            // Raw data without HookStore wrapper (shouldn't happen but handle it)
            console.log('[useGrokRetryVideoSessions] Data exists but not in HookStore format, wrapping...');
            let state = parsed as StoreState;

            // Validate and clean stale session data
            state = cleanStaleSessionData(state);

            saveStore(state);
            return state;
        }
    } catch (error) {
        console.error('[Grok Retry Store] Parse error:', error);
        return { sessionByMediaId: {}, persistentByMediaId: {}, activeSessionMediaId: null, promptBuffer: {} };
    }
};

// Migrate from version 0 (old scattered keys) to version 1 (centralized mediaId-based)
const migrateFromV0 = (): StoreState | null => {
    try {
        const sessionByMediaId: Record<string, SessionData> = {};
        const persistentByMediaId: Record<string, PersistentData> = {};
        const keysToRemove: string[] = [];
        let foundOldData = false;

        // Get Grok's videoByMediaId for mediaId lookup
        const grokStoreRaw = sessionStorage.getItem('useMediaStore');
        if (!grokStoreRaw) {
            console.log('[useGrokRetryVideoSessions] No Grok store found, cannot migrate v0 data');
            return null;
        }

        const grokStore = JSON.parse(grokStoreRaw);
        const videoByMediaId = grokStore?.state?.videoByMediaId || {};

        // Scan sessionStorage for old keys
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (!key || !key.startsWith(OLD_SESSION_PREFIX)) continue;

            foundOldData = true;
            keysToRemove.push(key);

            try {
                // Extract postId from key: "grokRetrySession_[postId]"
                const postId = key.replace(OLD_SESSION_PREFIX, '');
                const oldDataRaw = sessionStorage.getItem(key);
                if (!oldDataRaw) continue;

                const oldData = JSON.parse(oldDataRaw);

                // Find the originalMediaId for this postId
                const mediaId = findOriginalMediaId(postId, videoByMediaId);
                if (!mediaId) {
                    console.warn('[useGrokRetryVideoSessions] Could not find mediaId for postId:', postId);
                    continue;
                }

                // Consolidate session data by mediaId
                if (!sessionByMediaId[mediaId]) {
                    // First session for this mediaId - convert old format to new
                    sessionByMediaId[mediaId] = applySessionDefaults({
                        isActive: oldData.isActive ?? false,
                        retryCount: oldData.retryCount ?? 0,
                        videosGenerated: oldData.videosGenerated ?? 0,
                        currentPostId: postId,
                        processedAttemptIds: [postId], // Mark this attempt as processed
                        lastAttemptTime: oldData.lastAttemptTime ?? 0,
                        lastFailureTime: oldData.lastFailureTime ?? 0,
                        canRetry: oldData.canRetry ?? false,
                        attemptProgress: oldData.attemptProgress ?? [],
                        creditsUsed: oldData.creditsUsed ?? 0,
                        layer1Failures: oldData.layer1Failures ?? 0,
                        layer2Failures: oldData.layer2Failures ?? 0,
                        layer3Failures: oldData.layer3Failures ?? 0,
                        outcome: oldData.outcome ?? 'idle',
                        logs: oldData.logs ?? [],
                        lastSessionSummary: oldData.lastSessionSummary ?? null,
                        pendingRetryAt: oldData.pendingRetryAt ?? null,
                        pendingRetryPrompt: oldData.pendingRetryPrompt ?? null,
                    });
                } else {
                    // Merge with existing session for this mediaId
                    const existing = sessionByMediaId[mediaId];

                    if (existing.pendingRetryAt == null && oldData.pendingRetryAt) {
                        existing.pendingRetryAt = oldData.pendingRetryAt;
                    }
                    if (!existing.pendingRetryPrompt && oldData.pendingRetryPrompt) {
                        existing.pendingRetryPrompt = oldData.pendingRetryPrompt;
                    }

                    // Add postId to processed list if not already there
                    if (!existing.processedAttemptIds.includes(postId)) {
                        existing.processedAttemptIds.push(postId);
                    }

                    // Accumulate counts (important: we're consolidating multiple attempts)
                    existing.retryCount = Math.max(existing.retryCount, oldData.retryCount ?? 0);
                    existing.videosGenerated = Math.max(existing.videosGenerated, oldData.videosGenerated ?? 0);

                    // Use most recent timestamps
                    existing.lastAttemptTime = Math.max(existing.lastAttemptTime, oldData.lastAttemptTime ?? 0);
                    existing.lastFailureTime = Math.max(existing.lastFailureTime, oldData.lastFailureTime ?? 0);

                    // Merge logs
                    if (oldData.logs && Array.isArray(oldData.logs)) {
                        existing.logs = [...existing.logs, ...oldData.logs];
                    }

                    // Merge attempt progress
                    if (oldData.attemptProgress && Array.isArray(oldData.attemptProgress)) {
                        existing.attemptProgress = [...existing.attemptProgress, ...oldData.attemptProgress];
                    }

                    // Accumulate credits and failures
                    existing.creditsUsed += (oldData.creditsUsed ?? 0);
                    existing.layer1Failures += (oldData.layer1Failures ?? 0);
                    existing.layer2Failures += (oldData.layer2Failures ?? 0);
                    existing.layer3Failures += (oldData.layer3Failures ?? 0);

                    // Update current post to most recent
                    existing.currentPostId = postId;

                    // Keep active state if any attempt was active
                    existing.isActive = existing.isActive || (oldData.isActive ?? false);
                    existing.canRetry = existing.canRetry || (oldData.canRetry ?? false);
                }

                // Migrate persistent data (use latest values, don't accumulate)
                if (!persistentByMediaId[mediaId]) {
                    persistentByMediaId[mediaId] = {
                        maxRetries: oldData.maxRetries ?? 3,
                        autoRetryEnabled: oldData.autoRetryEnabled ?? true,
                        lastPromptValue: oldData.lastPromptValue ?? '',
                        videoGoal: oldData.videoGoal ?? 1,
                    };
                } else {
                    // Update with latest values
                    persistentByMediaId[mediaId].lastPromptValue = oldData.lastPromptValue ?? persistentByMediaId[mediaId].lastPromptValue;
                }
            } catch (err) {
                console.error('[useGrokRetryVideoSessions] Error migrating key:', key, err);
            }
        }

        if (!foundOldData) {
            return null;
        }

        // Clean up old keys (if cleanup enabled)
        if (ENABLE_MIGRATION_CLEANUP) {
            keysToRemove.forEach(key => sessionStorage.removeItem(key));
            console.log('[useGrokRetryVideoSessions] Removed old session keys:', keysToRemove.length);
        } else {
            console.log('[useGrokRetryVideoSessions] Migration complete (cleanup disabled, old keys preserved):', keysToRemove.length);
        }

        console.log('[useGrokRetryVideoSessions] Migrated to mediaId-based storage:', {
            sessions: Object.keys(sessionByMediaId).length,
            persistent: Object.keys(persistentByMediaId).length
        });

        return { sessionByMediaId, persistentByMediaId, activeSessionMediaId: null, promptBuffer: {} };
    } catch (error) {
        console.error('[useGrokRetryVideoSessions] Migration error:', error);
        return null;
    }
};

// Save store to sessionStorage
const saveStore = (state: StoreState): void => {
    try {
        const store = createStore(state, CURRENT_VERSION);
        sessionStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (error) {
        console.error('[Grok Retry Store] Save error:', error);
    }
};

/**
 * Hook to manage video session retry data with centralized mediaId-based storage.
 * Uses originalMediaId as the primary key (matches Grok's useMediaStore architecture).
 * This eliminates race conditions from route changes during retry sessions.
 */
export const useGrokRetryVideoSessions = (postId: string | null) => {
    const [data, setData] = useState<PostData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [reloadSignal, setReloadSignal] = useState(0);
    const lastLoadedPostIdRef = useRef<string | null>(null);
    const currentMediaIdRef = useRef<string | null>(null);
    const storeRef = useRef<StoreState>({ sessionByMediaId: {}, persistentByMediaId: {}, activeSessionMediaId: null, promptBuffer: {} });
    const forceReloadRef = useRef<() => void>(() => { });

    // Force reload function - exposed via ref for external triggers
    const forceReload = useCallback(() => {
        if (!postId) return;
        console.log('[Grok Retry Store] Force reload triggered');
        lastLoadedPostIdRef.current = null;  // Clear cache to force reload
        setReloadSignal((value) => value + 1); // Bump signal to re-run loader effect
    }, [postId]);

    forceReloadRef.current = forceReload;

    // Grok storage polling: Watch for new videos (moderated or successful)
    // This ensures we detect and process attempts immediately after completion
    useGrokRetryGrokStorage(postId, {
        onVideoDetected: (video) => {
            console.log('[Grok Retry Store] New video detected in Grok storage, triggering reload:', video.videoId);
            forceReload();
        },
        pollInterval: 500,  // Check every 500ms
        debug: false,
    });

    // Load data when postId changes OR when force reload is triggered
    useEffect(() => {
        if (!postId) {
            setData(null);
            setIsLoading(false);
            lastLoadedPostIdRef.current = null;
            currentMediaIdRef.current = null;
            return;
        }

        // Skip reload if already loaded for this post
        if (lastLoadedPostIdRef.current === postId) {
            return;
        }

        console.log(`[Grok Retry Store] Loading data for post: ${postId}`);
        lastLoadedPostIdRef.current = postId;
        setIsLoading(true);

        // Load global settings for defaults
        chrome.storage.sync.get(['useGrokRetrySettings_store'], (globalResult) => {
            const runtimeError = chrome.runtime?.lastError;
            if (runtimeError) {
                if (runtimeError.message?.toLowerCase().includes('context invalidated')) {
                    console.warn('[Grok Retry Store] Storage fetch cancelled — extension context invalidated');
                } else {
                    console.error('[Grok Retry Store] Storage fetch error:', runtimeError);
                }
                setIsLoading(false);
                return;
            }

            const settingsStore = globalResult.useGrokRetrySettings_store as HookStore<any> | undefined;
            const globalSettings = settingsStore?.state || {};

            // Get Grok's videoByMediaId for mediaId lookup
            const grokStoreRaw = sessionStorage.getItem('useMediaStore');
            if (!grokStoreRaw) {
                console.warn('[Grok Retry Store] Grok useMediaStore not found');
                setData(null);
                setIsLoading(false);
                return;
            }

            const grokStore = JSON.parse(grokStoreRaw);
            const videoByMediaId = grokStore?.state?.videoByMediaId || {};

            // Parse store from sessionStorage (do this early for fallback lookup)
            const store = parseStore();
            storeRef.current = store;

            // Find the originalMediaId for this postId
            let mediaId = findOriginalMediaId(postId, videoByMediaId);

            // Fallback #1: If not found in Grok's store, check if this postId is in our processedAttemptIds
            // This handles the case where Grok removed a failed video attempt after page reload
            // Only needed for active sessions (inactive sessions have cleared processedAttemptIds)
            if (!mediaId) {
                for (const [storedMediaId, sessionData] of Object.entries(store.sessionByMediaId)) {
                    if (sessionData.isActive && sessionData.processedAttemptIds.includes(postId)) {
                        mediaId = storedMediaId;
                        console.log('[Grok Retry Store] MediaId not in Grok store, but found in active session processedAttemptIds:', mediaId);
                        break;
                    }
                }
            }

            // Fallback #2: Check if there's an active session tracked globally
            // This handles race conditions where new video post not yet in Grok's videoByMediaId
            if (!mediaId && store.activeSessionMediaId) {
                const activeSession = store.sessionByMediaId[store.activeSessionMediaId];
                if (activeSession?.isActive) {
                    mediaId = store.activeSessionMediaId;
                    console.log('[Grok Retry Store] Using active session mediaId from global tracker:', mediaId);
                }
            }

            // Fallback #3: Check if this postId matches currentPostId in an active session
            // This handles the race condition where we navigate to a new video attempt
            // before Grok has added it to videoByMediaId (kept as additional fallback)
            if (!mediaId) {
                for (const [storedMediaId, sessionData] of Object.entries(store.sessionByMediaId)) {
                    if (sessionData.isActive && sessionData.currentPostId === postId) {
                        mediaId = storedMediaId;
                        console.log('[Grok Retry Store] MediaId not in Grok store, but found in active session currentPostId:', mediaId);
                        break;
                    }
                }
            }

            if (!mediaId) {
                console.warn('[Grok Retry Store] Could not find mediaId for postId:', postId, '| Available mediaIds:', Object.keys(videoByMediaId));
                setData(null);
                setIsLoading(false);
                return;
            }

            currentMediaIdRef.current = mediaId;
            console.log('[Grok Retry Store] Found mediaId for post:', { postId, mediaId });

            // Get or create session data for this mediaId
            let sessionData = store.sessionByMediaId[mediaId];

            // Check if we have no video attempts yet
            const attempts = videoByMediaId[mediaId] || [];
            const hasNoAttempts = attempts.length === 0;

            // If no session data exists, create default
            if (!sessionData) {
                sessionData = createDefaultSessionData();
            } else {
                sessionData = applySessionDefaults(sessionData);
            }

            if (hasNoAttempts && sessionData.processedAttemptIds.length > 0 && !sessionData.isActive) {
                // Special case: We have processed attempts but Grok has no attempts
                // This means the session has ended (all attempts cleared by Grok)
                // Reset to default state to avoid showing stale "isActive: true"
                // 
                // IMPORTANT: Don't reset if session is currently active (isActive: true)
                // During video generation, we may load a new post before it appears in Grok's store
                console.log('[Grok Retry Store] Session data exists but no attempts in Grok store - resetting to defaults');
                sessionData = createDefaultSessionData();
            }

            // Get or create persistent data for this mediaId
            const persistentData = store.persistentByMediaId[mediaId] || createDefaultPersistentData(globalSettings);

            // Process new attempts: check if this postId is a new attempt
            // 
            // IMPORTANT: Grok's behavior with failed video attempts:
            // - Only keeps the LATEST failed attempt in the array (replaces previous ones)
            // - Clears failed attempts entirely on page reload
            // - Only successful videos persist long-term
            // 
            // Our strategy:
            // - Track all attempts we've seen in processedAttemptIds
            // - Only process attempts not yet in processedAttemptIds
            // - This prevents double-counting even if Grok replaces/removes attempts
            const newAttempts = attempts.filter((attempt: any) =>
                !sessionData.processedAttemptIds.includes(attempt.id)
            );

            if (newAttempts.length > 0) {
                console.log('[Grok Retry Store] Found new attempts to process:', newAttempts.length);

                // Process each new attempt
                for (const attempt of newAttempts) {
                    const attemptId = attempt.id;
                    const isModerated = attempt.moderated === true;

                    if (isModerated) {
                        // Moderated video - increment retry count
                        sessionData.retryCount++;
                        sessionData.layer1Failures++;
                        sessionData.lastFailureTime = Date.now();
                        sessionData.logs.push(`[${new Date().toISOString()}] Moderation detected on attempt ${attemptId}`);
                        console.log('[Grok Retry Store] Moderation detected, retry count:', sessionData.retryCount);

                        const shouldScheduleRetry =
                            persistentData.autoRetryEnabled && sessionData.retryCount < persistentData.maxRetries;
                        if (shouldScheduleRetry) {
                            const now = Date.now();
                            const cooldownRemaining = sessionData.lastAttemptTime
                                ? Math.max(0, sessionData.lastAttemptTime + CLICK_COOLDOWN_MS - now)
                                : 0;
                            const retryDelay = Math.max(cooldownRemaining, DEFAULT_MODERATION_RETRY_DELAY_MS);
                            sessionData.pendingRetryAt = now + retryDelay;
                            sessionData.pendingRetryPrompt = persistentData.lastPromptValue || null;
                            sessionData.pendingRetryOverride = true;
                            console.log('[Grok Retry Store] Scheduled moderation retry', {
                                retryDelay,
                                retryCount: sessionData.retryCount,
                                maxRetries: persistentData.maxRetries,
                            });
                        } else {
                            sessionData.pendingRetryAt = null;
                            sessionData.pendingRetryPrompt = null;
                            sessionData.pendingRetryOverride = false;
                        }
                    } else {
                        // Non-moderated video - increment videosGenerated
                        sessionData.videosGenerated++;
                        sessionData.logs.push(`[${new Date().toISOString()}] Video generated successfully: ${attemptId}`);
                        console.log('[Grok Retry Store] Video generated, count:', sessionData.videosGenerated);
                        sessionData.pendingRetryAt = null;
                        sessionData.pendingRetryPrompt = null;
                        sessionData.pendingRetryOverride = false;
                    }

                    // Mark attempt as processed
                    sessionData.processedAttemptIds.push(attemptId);
                }

                // Update current post ID to latest attempt
                sessionData.currentPostId = postId;

                // Determine if session is still active
                const reachedGoal = sessionData.videosGenerated >= persistentData.videoGoal;
                const maxedOut = sessionData.retryCount >= persistentData.maxRetries;
                const wasActive = sessionData.isActive;
                sessionData.isActive = !reachedGoal && !maxedOut && persistentData.autoRetryEnabled;
                sessionData.canRetry = !reachedGoal && !maxedOut;

                // Update global active session tracker
                if (sessionData.isActive) {
                    store.activeSessionMediaId = mediaId;
                } else if (wasActive) {
                    store.activeSessionMediaId = null;
                    sessionData.pendingRetryAt = null;
                    sessionData.pendingRetryPrompt = null;
                    sessionData.pendingRetryOverride = false;
                }

                // Clean up processedAttemptIds if session just became inactive
                // We only need these IDs during active session to prevent double-counting
                if (wasActive && !sessionData.isActive) {
                    console.log('[Grok Retry Store] Session ended, clearing processedAttemptIds');
                    sessionData.processedAttemptIds = [];
                }

                // Save updated session data
                store.sessionByMediaId[mediaId] = sessionData;
                saveStore(store);
                storeRef.current = store;
            } else {
                // No new attempts to process, but update current post ID if session is active
                // This ensures currentPostId tracks the current location even during race conditions
                const needsSave = sessionData.isActive && sessionData.currentPostId !== postId;
                sessionData.currentPostId = postId;
                store.sessionByMediaId[mediaId] = sessionData;

                // Save if we're updating an active session
                // NOTE: Don't reset stale data if session was active (tracked by activeSessionMediaId)
                // During video generation, we may be on a new post before it appears in Grok's store
                if (needsSave) {
                    saveStore(store);
                    storeRef.current = store;
                    console.log('[Grok Retry Store] Updated currentPostId for active session:', postId);
                }
            }

            // Combine and set data
            const combined: PostData = { ...sessionData, ...persistentData };
            setData(combined);
            setIsLoading(false);

            console.log('[Grok Retry Store] Loaded state for mediaId:', mediaId, {
                postId,
                sessionData,
                persistentData,
            });
        });
    }, [postId, reloadSignal]);

    // Effect to flush buffered prompt when mediaId becomes available
    useEffect(() => {
        const mediaId = currentMediaIdRef.current;
        if (!mediaId || !postId) return;

        const store = parseStore();
        const bufferedPrompt = store.promptBuffer?.[postId];

        if (bufferedPrompt) {
            console.log('[Grok Retry Store] Flushing buffered prompt to persistent storage:', {
                mediaId,
                postId,
                promptLength: bufferedPrompt.length
            });

            if (!store.persistentByMediaId[mediaId]) {
                store.persistentByMediaId[mediaId] = createDefaultPersistentData();
            }
            store.persistentByMediaId[mediaId].lastPromptValue = bufferedPrompt;
            delete store.promptBuffer[postId];
            saveStore(store);
            storeRef.current = store;

            // Update local state
            setData((prev) => {
                if (!prev) return prev;
                return { ...prev, lastPromptValue: bufferedPrompt };
            });
        }
    }, [currentMediaIdRef.current, postId]);

    // Update session data (ephemeral)
    const updateSession = useCallback((updates: Partial<SessionData>) => {
        const mediaId = currentMediaIdRef.current;
        if (!mediaId) {
            console.warn('[Grok Retry Store] Cannot update session: no mediaId');
            return;
        }

        setData((prev) => {
            if (!prev) return prev;

            const sessionMerged: SessionData = {
                ...applySessionDefaults(prev),
                ...updates,
            };
            const persistentSlice = selectPersistentData(prev);
            const updated: PostData = { ...sessionMerged, ...persistentSlice };

            // Update store
            const store = parseStore();
            const existingSession = store.sessionByMediaId[mediaId] || createDefaultSessionData();
            const sessionData: SessionData = {
                ...applySessionDefaults(existingSession),
                ...updates,
            };
            store.sessionByMediaId[mediaId] = sessionData;

            // Update global active session tracker
            if (sessionData.isActive) {
                store.activeSessionMediaId = mediaId;
            } else if (store.activeSessionMediaId === mediaId) {
                store.activeSessionMediaId = null;
            }

            saveStore(store);
            storeRef.current = store;

            return updated;
        });
    }, []);

    // Update persistent data (survives reloads)
    const updatePersistent = useCallback((updates: Partial<PersistentData>) => {
        const mediaId = currentMediaIdRef.current;
        const store = parseStore();

        // If no mediaId yet, buffer prompt changes for later
        if (!mediaId) {
            if (updates.lastPromptValue !== undefined && postId) {
                console.log('[Grok Retry Store] Buffering prompt update (no mediaId yet):', {
                    postId,
                    promptLength: updates.lastPromptValue.length
                });
                store.promptBuffer[postId] = updates.lastPromptValue;
                saveStore(store);
                storeRef.current = store;

                // Update local state optimistically
                setData((prev) => {
                    if (!prev) return prev;
                    const sessionSlice = applySessionDefaults(prev);
                    const persistentCurrent = selectPersistentData(prev);
                    return {
                        ...sessionSlice,
                        ...persistentCurrent,
                        lastPromptValue: updates.lastPromptValue ?? ''
                    };
                });
            } else if (Object.keys(updates).some(k => k !== 'lastPromptValue')) {
                console.warn('[Grok Retry Store] Cannot update persistent (non-prompt): no mediaId');
            }
            return;
        }

        setData((prev) => {
            if (!prev) return prev;

            const sessionSlice = applySessionDefaults(prev);
            const persistentCurrent = selectPersistentData(prev);
            const persistentMerged: PersistentData = {
                maxRetries: updates.maxRetries ?? persistentCurrent.maxRetries,
                autoRetryEnabled: updates.autoRetryEnabled ?? persistentCurrent.autoRetryEnabled,
                lastPromptValue: updates.lastPromptValue ?? persistentCurrent.lastPromptValue,
                videoGoal: updates.videoGoal ?? persistentCurrent.videoGoal,
            };
            const updated: PostData = { ...sessionSlice, ...persistentMerged };

            // Update store
            const storePersistent = store.persistentByMediaId[mediaId] || createDefaultPersistentData();
            store.persistentByMediaId[mediaId] = {
                maxRetries: updates.maxRetries ?? storePersistent.maxRetries,
                autoRetryEnabled: updates.autoRetryEnabled ?? storePersistent.autoRetryEnabled,
                lastPromptValue: updates.lastPromptValue ?? storePersistent.lastPromptValue,
                videoGoal: updates.videoGoal ?? storePersistent.videoGoal,
            };
            saveStore(store);
            storeRef.current = store;

            return updated;
        });
    }, [postId]);

    // Update both session and persistent data
    const updateAll = useCallback((sessionUpdates: Partial<SessionData>, persistentUpdates: Partial<PersistentData>) => {
        const mediaId = currentMediaIdRef.current;
        if (!mediaId) {
            console.warn('[Grok Retry Store] Cannot update all: no mediaId');
            return;
        }

        setData((prev) => {
            if (!prev) return prev;

            const sessionMerged: SessionData = {
                ...applySessionDefaults(prev),
                ...sessionUpdates,
            };
            const persistentCurrent = selectPersistentData(prev);
            const persistentMerged: PersistentData = {
                maxRetries: persistentUpdates.maxRetries ?? persistentCurrent.maxRetries,
                autoRetryEnabled: persistentUpdates.autoRetryEnabled ?? persistentCurrent.autoRetryEnabled,
                lastPromptValue: persistentUpdates.lastPromptValue ?? persistentCurrent.lastPromptValue,
                videoGoal: persistentUpdates.videoGoal ?? persistentCurrent.videoGoal,
            };
            const updated: PostData = { ...sessionMerged, ...persistentMerged };

            // Update store
            const store = parseStore();
            const existingSession = store.sessionByMediaId[mediaId] || createDefaultSessionData();
            store.sessionByMediaId[mediaId] = {
                ...applySessionDefaults(existingSession),
                ...sessionUpdates,
            };
            const storePersistent = store.persistentByMediaId[mediaId] || createDefaultPersistentData();
            store.persistentByMediaId[mediaId] = {
                maxRetries: persistentUpdates.maxRetries ?? storePersistent.maxRetries,
                autoRetryEnabled: persistentUpdates.autoRetryEnabled ?? storePersistent.autoRetryEnabled,
                lastPromptValue: persistentUpdates.lastPromptValue ?? storePersistent.lastPromptValue,
                videoGoal: persistentUpdates.videoGoal ?? storePersistent.videoGoal,
            };
            saveStore(store);
            storeRef.current = store;

            return updated;
        });
    }, []);

    // Clear session data (for new session)
    const clearSession = useCallback(() => {
        const mediaId = currentMediaIdRef.current;
        if (!mediaId) {
            console.warn('[Grok Retry Store] Cannot clear session: no mediaId');
            return;
        }

        setData((prev) => {
            if (!prev) return prev;

            // Keep persistent data, reset session data
            const persistentData = {
                maxRetries: prev.maxRetries,
                autoRetryEnabled: prev.autoRetryEnabled,
                lastPromptValue: prev.lastPromptValue,
                videoGoal: prev.videoGoal,
            };
            const sessionData = createDefaultSessionData();
            const updated = { ...sessionData, ...persistentData };

            // Update store
            const store = parseStore();
            store.sessionByMediaId[mediaId] = sessionData;
            saveStore(store);
            storeRef.current = store;

            console.log('[Grok Retry Store] Cleared session data for mediaId:', mediaId);
            return updated;
        });
    }, []);

    // Delete data for a mediaId (cleanup)
    const deleteSession = useCallback((targetMediaId?: string) => {
        const mediaId = targetMediaId || currentMediaIdRef.current;
        if (!mediaId) {
            console.warn('[Grok Retry Store] Cannot delete session: no mediaId');
            return;
        }

        console.log('[Grok Retry Store] Deleting data for mediaId:', mediaId);

        const store = parseStore();
        delete store.sessionByMediaId[mediaId];
        delete store.persistentByMediaId[mediaId];
        saveStore(store);
        storeRef.current = store;

        // If we're viewing the deleted session, clear state
        if (mediaId === currentMediaIdRef.current) {
            setData(null);
        }
    }, []);

    return {
        data,
        isLoading,
        updateSession,
        updatePersistent,
        updateAll,
        clearSession,
        deleteSession,
        forceReload,
    };
};
