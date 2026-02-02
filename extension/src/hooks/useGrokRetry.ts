import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { getGenerateButtonSelectors, getPromptSelectorCandidates } from '../config/selectors';
import { findPromptInput, writePromptValue } from '../lib/promptInput';
import { usePostStorage } from './useSessionStorage';
import type { SessionOutcome, SessionSummary } from './useSessionStorage';
import type { PostRouteIdentity } from './usePostId';
import { clearVideoAttemptsByImageReference } from '../lib/grokStream';

const CLICK_COOLDOWN = 8000; // 8 seconds between retries
const SESSION_TIMEOUT = 120000; // 2 minutes - auto-end session if no success/failure feedback
const PROGRESS_BUTTON_SELECTOR = 'button[aria-label="Video Options"]';
const MAX_PROGRESS_RECORDS = 25;
const SESSION_STORAGE_PREFIX = 'grokRetrySession_';


type ModerationLayer = {
    label: string;
    explanation: string;
    layer: 1 | 2 | 3 | null;
};

const describeModerationLayer = (percent: number | null): ModerationLayer => {
    if (percent === null) {
        return {
            label: 'Security layer unknown',
            explanation: 'Insufficient telemetry captured to infer which moderation stage fired.',
            layer: null,
        };
    }

    // Heuristic thresholds: early failures (pre-generation) map to Layer 1, mid-progress to Layer 2,
    // late failures near completion align with Layer 3 rollback behaviour (88%+).
    if (percent >= 88) {
        return {
            label: 'Security Layer 3: POST-GENERATION VALIDATION',
            explanation: 'Rendered video blocked during post-generation validation checks.',
            layer: 3,
        };
    }

    if (percent >= 25) {
        return {
            label: 'Security Layer 2: MODEL-LEVEL ALIGNMENT',
            explanation: 'Model-level alignment guardrails refused the generation mid-stream.',
            layer: 2,
        };
    }

    return {
        label: 'Security Layer 1: PROMPT FILTERING',
        explanation: 'Prompt filtering stopped the attempt before generation began.',
        layer: 1,
    };
};

const parseProgress = (text?: string | null): number | null => {
    if (!text) return null;
    const numeric = Number.parseFloat(text.replace(/[^\d.]/g, ''));
    if (Number.isNaN(numeric)) return null;
    return Math.min(100, Math.max(0, numeric));
};

export const useGrokRetry = ({ postId, mediaId }: PostRouteIdentity) => {
    const { data: postData, save, saveAll, migrateState, isLoading, appendLog } = usePostStorage(postId, mediaId);

    // Expose migration function to window for usePostId to call
    useEffect(() => {
        const w = window as any;
        w.__grok_migrate_state = migrateState;
        return () => {
            delete w.__grok_migrate_state;
        };
    }, [migrateState]);

    const [lastClickTime, setLastClickTime] = useState(0);
    const [originalPageTitle, setOriginalPageTitle] = useState('');
    const schedulerRef = useRef<number | null>(null);
    const cooldownTimeoutRef = useRef<number | null>(null);
    const progressObserverRef = useRef<MutationObserver | null>(null);
    const lastObservedProgressRef = useRef<number | null>(null);

    // Initialize original page title
    useEffect(() => {
        if (!originalPageTitle) {
            setOriginalPageTitle(document.title);
        }
    }, [originalPageTitle]);

    const maxRetries = postData.maxRetries;
    const retryCount = postData.retryCount;
    const autoRetryEnabled = postData.autoRetryEnabled;
    const lastPromptValue = postData.lastPromptValue;
    const isSessionActive = postData.isSessionActive;
    const videoGoal = postData.videoGoal;
    const videoGroup = postData.videoGroup ?? [];
    const videosGenerated = postData.videosGenerated;
    const lastAttemptTime = postData.lastAttemptTime;
    const lastFailureTime = postData.lastFailureTime;
    const creditsUsed = postData.creditsUsed ?? 0;
    const layer1Failures = postData.layer1Failures ?? 0;
    const layer2Failures = postData.layer2Failures ?? 0;
    const layer3Failures = postData.layer3Failures ?? 0;
    const lastSessionOutcome = postData.lastSessionOutcome;
    const lastSessionSummary = postData.lastSessionSummary;
    const sessionKey = mediaId ?? postData.sessionMediaId ?? postId;
    const originalMediaId = postData.originalMediaId ?? null;

    try {
        const w = window as any;
        w.__grok_retryState = {
            isSessionActive: postData.isSessionActive,
            retryCount: postData.retryCount,
            canRetry: postData.canRetry,
            originalMediaId,
        };
    } catch { }

    useEffect(() => {
        const canonicalMediaId = mediaId ?? postData.sessionMediaId ?? null;
        if (postData.sessionMediaId !== canonicalMediaId) {
            save('sessionMediaId', canonicalMediaId);
        }
    }, [mediaId, postData.sessionMediaId, save]);

    const setMaxRetries = useCallback((value: number) => {
        const clamped = Math.max(1, Math.min(50, value));
        save('maxRetries', clamped);
    }, [save]);

    const setAutoRetryEnabled = useCallback((value: boolean) => {
        save('autoRetryEnabled', value);
    }, [save]);

    const updatePromptValue = useCallback((value: string) => {
        save('lastPromptValue', value);
    }, [save]);

    const resetRetries = useCallback(() => {
        save('retryCount', 0);
    }, [save]);

    const setVideoGoal = useCallback((value: number) => {
        const clamped = Math.max(1, Math.min(50, value));
        save('videoGoal', clamped);
    }, [save]);

    const clearLogs = useCallback(() => {
        save('logs', []);
    }, [save]);

    const resetProgressTracking = useCallback(() => {
        if (progressObserverRef.current) {
            progressObserverRef.current.disconnect();
            progressObserverRef.current = null;
        }
        lastObservedProgressRef.current = null;
    }, []);

    const incrementVideosGenerated = useCallback(() => {
        resetProgressTracking();
        saveAll({
            videosGenerated: videosGenerated + 1,
            creditsUsed: creditsUsed + 1,
        });
    }, [resetProgressTracking, saveAll, videosGenerated, creditsUsed]);

    const resetVideosGenerated = useCallback(() => {
        saveAll({ videosGenerated: 0 });
    }, [saveAll]);

    const beginProgressTracking = useCallback(() => {
        lastObservedProgressRef.current = null;
        const button = document.querySelector<HTMLButtonElement>(PROGRESS_BUTTON_SELECTOR);
        if (!button) return;

        if (progressObserverRef.current) {
            progressObserverRef.current.disconnect();
            progressObserverRef.current = null;
        }

        const updateFromDom = () => {
            const candidate = button.querySelector<HTMLElement>('div, span');
            const value = parseProgress(candidate?.textContent?.trim() ?? button.textContent?.trim() ?? '');
            if (value !== null) {
                const previous = lastObservedProgressRef.current ?? value;
                lastObservedProgressRef.current = Math.max(previous, value);
            }
        };

        updateFromDom();

        const observer = new MutationObserver(() => {
            updateFromDom();
        });

        observer.observe(button, { subtree: true, childList: true, characterData: true });
        progressObserverRef.current = observer;
    }, []);

    const startSession = useCallback((capturedPrompt?: string) => {
        resetProgressTracking();
        // Set the session post ID to maintain continuity across route changes
        const w = window as any;
        if (postId) {
            w.__grok_session_post_id = postId;
            console.log(`[Grok Retry] Session started with post ID: ${postId}`);
        }
        // Store the original mediaId to ensure all video attempts reference the same source image
        const originalMediaIdToStore = mediaId ?? postData.originalMediaId ?? null;
        if (mediaId) {
            w.__grok_session_media_id = mediaId;
            console.log(`[Grok Retry] Session keyed by media ID: ${mediaId}`);
        } else {
            delete w.__grok_session_media_id;
        }
        if (originalMediaIdToStore) {
            console.log(`[Grok Retry] Original image ID for session: ${originalMediaIdToStore}`);
        }
        // Clear video history tracking - don't count pre-existing videos in the sidebar
        delete w.__grok_route_changed;
        delete w.__grok_video_history_count;
        delete w.__grok_last_success_attempt;
        console.log('[Grok Retry] Cleared video history tracking for new session');
        // Use captured prompt if provided, otherwise fall back to lastPromptValue
        const promptToSave = capturedPrompt ?? lastPromptValue;
        console.log(`[Grok Retry] Starting session with prompt: ${promptToSave ? promptToSave.substring(0, 50) + '...' : '(empty)'}`);
        // Initialize videoGroup with current post if not already present
        const currentVideoGroup = Array.isArray(videoGroup) ? videoGroup : [];
        const updatedVideoGroup = postId && !currentVideoGroup.includes(postId)
            ? [postId, ...currentVideoGroup]
            : currentVideoGroup;
        // Save both session data AND persistent data to ensure continuity across route changes
        // This prevents loss of prompt/settings when route changes after successful generation
        saveAll({
            // Session data
            isSessionActive: true,
            retryCount: 0,
            videosGenerated: 0,
            logs: [],
            attemptProgress: [],
            creditsUsed: 0,
            layer1Failures: 0,
            layer2Failures: 0,
            layer3Failures: 0,
            lastSessionOutcome: 'pending',
            lastSessionSummary: null,
            sessionMediaId: mediaId ?? null,
            // Persistent data - save current values to ensure they persist across route changes
            maxRetries,
            autoRetryEnabled,
            lastPromptValue: promptToSave,
            videoGoal,
            videoGroup: updatedVideoGroup,
            originalMediaId: originalMediaIdToStore,
        });
    }, [resetProgressTracking, saveAll, postId, mediaId, postData.originalMediaId, maxRetries, autoRetryEnabled, lastPromptValue, videoGoal, videoGroup]);

    const clearVideoAttemptsByMediaId = useCallback((targetMediaId: string | null, outcome: SessionOutcome) => {
        if (!targetMediaId) {
            return;
        }

        console.log(`[Grok Retry] Clearing all video attempts for image ID: ${targetMediaId}`);

        // Clear from grokStream state (window-level tracking)
        try {
            clearVideoAttemptsByImageReference(targetMediaId);
        } catch (error) {
            console.warn('[Grok Retry] Failed to clear video attempts from grokStream:', error);
        }

        // Clear from chrome.storage.local - find all posts with this originalMediaId
        if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
            chrome.storage.local.get(null, (allData) => {
                const updates: Record<string, unknown> = {};
                let clearedCount = 0;

                for (const [key, value] of Object.entries(allData)) {
                    if (key.startsWith('grokRetryPost_') && typeof value === 'object' && value !== null) {
                        const postData = value as any;
                        if (postData.originalMediaId === targetMediaId && postData.isSessionActive) {
                            updates[key] = {
                                ...postData,
                                isSessionActive: false,
                                retryCount: 0,
                                videosGenerated: 0,
                                canRetry: false,
                                lastSessionOutcome: outcome,
                            };
                            clearedCount++;
                        }
                    }
                }

                if (Object.keys(updates).length > 0) {
                    chrome.storage.local.set(updates, () => {
                        if (chrome.runtime.lastError) {
                            console.warn('[Grok Retry] Failed to clear attempts in storage:', chrome.runtime.lastError);
                        } else {
                            console.log(`[Grok Retry] Cleared ${clearedCount} active sessions for image ${targetMediaId}`);
                        }
                    });
                }
            });
        }

        // Clear from sessionStorage - find all sessions with this originalMediaId
        if (typeof sessionStorage !== 'undefined') {
            try {
                const sessionKeys: string[] = [];
                for (let i = 0; i < sessionStorage.length; i++) {
                    const key = sessionStorage.key(i);
                    if (key && key.startsWith(SESSION_STORAGE_PREFIX)) {
                        sessionKeys.push(key);
                    }
                }

                for (const key of sessionKeys) {
                    try {
                        const stored = sessionStorage.getItem(key);
                        if (stored) {
                            const parsed = JSON.parse(stored);
                            // Check if this session data belongs to the same originalMediaId
                            // Note: sessionStorage doesn't directly store originalMediaId, but we can infer
                            // by checking if it's an active session for posts in our videoGroup
                            if (parsed.isSessionActive) {
                                const updated = {
                                    ...parsed,
                                    isSessionActive: false,
                                    canRetry: false,
                                    retryCount: 0,
                                    videosGenerated: 0,
                                    lastSessionOutcome: outcome,
                                };
                                sessionStorage.setItem(key, JSON.stringify(updated));
                            }
                        }
                    } catch (error) {
                        console.warn('[Grok Retry] Failed to process session storage entry:', key, error);
                    }
                }
            } catch (error) {
                console.warn('[Grok Retry] Failed to clear sessionStorage:', error);
            }
        }
    }, []);

    const clearVideoGroupChain = useCallback((outcome: SessionOutcome) => {
        const relatedPostIds = new Set<string>();
        if (postId) {
            relatedPostIds.add(postId);
        }
        if (Array.isArray(videoGroup)) {
            for (const id of videoGroup) {
                if (typeof id === 'string' && id.length > 0) {
                    relatedPostIds.add(id);
                }
            }
        }

        if (relatedPostIds.size > 0 && typeof chrome !== 'undefined' && chrome?.storage?.local) {
            const storageKeys = Array.from(relatedPostIds).map((id) => `grokRetryPost_${id}`);
            chrome.storage.local.get(storageKeys, (result) => {
                const updates: Record<string, unknown> = {};
                for (const key of storageKeys) {
                    const existing = result[key] || {};
                    updates[key] = { ...existing, videoGroup: [] };
                }
                if (Object.keys(updates).length > 0) {
                    chrome.storage.local.set(updates, () => {
                        if (chrome.runtime.lastError) {
                            console.warn('[Grok Retry] Failed to clear videoGroup chain:', chrome.runtime.lastError);
                        } else {
                            console.log('[Grok Retry] Cleared videoGroup chain for posts:', Array.from(relatedPostIds));
                        }
                    });
                }
            });
        }

        if (typeof sessionStorage !== 'undefined') {
            const sessionKeys: string[] = [];
            try {
                for (let index = 0; index < sessionStorage.length; index += 1) {
                    const key = sessionStorage.key(index);
                    if (key && key.startsWith(SESSION_STORAGE_PREFIX)) {
                        sessionKeys.push(key);
                    }
                }
            } catch (error) {
                console.warn('[Grok Retry] Unable to enumerate session storage keys:', error);
            }

            for (const fullKey of sessionKeys) {
                try {
                    const stored = sessionStorage.getItem(fullKey);
                    if (!stored) {
                        continue;
                    }
                    const parsed = JSON.parse(stored);
                    const updated = {
                        ...parsed,
                        isSessionActive: false,
                        canRetry: false,
                        retryCount: 0,
                        videosGenerated: 0,
                        lastSessionOutcome: outcome,
                    };
                    sessionStorage.setItem(fullKey, JSON.stringify(updated));
                } catch (error) {
                    try {
                        sessionStorage.removeItem(fullKey);
                    } catch { }
                }
            }
        }
    }, [postId, videoGroup]);

    const endSession = useCallback((outcome: SessionOutcome = 'idle') => {
        resetProgressTracking();
        // Clear the session post ID when ending the session
        const w = window as any;
        delete w.__grok_session_post_id;
        delete w.__grok_session_media_id;
        delete w.__grok_route_changed;
        delete w.__grok_video_history_count;
        delete w.__grok_last_success_attempt;
        console.log(`[Grok Retry] Session ended with outcome: ${outcome}`);

        // Clear all video attempts that share the same originalMediaId
        if (originalMediaId) {
            clearVideoAttemptsByMediaId(originalMediaId, outcome);
        }

        clearVideoGroupChain(outcome);

        const summary: SessionSummary = {
            outcome,
            completedVideos: videosGenerated,
            videoGoal,
            retriesAttempted: retryCount,
            maxRetries,
            creditsUsed,
            layer1Failures,
            layer2Failures,
            layer3Failures,
            endedAt: Date.now(),
        };
        saveAll({
            isSessionActive: false,
            retryCount: 0,
            videosGenerated: 0,
            canRetry: false,
            creditsUsed: 0,
            layer1Failures: 0,
            layer2Failures: 0,
            layer3Failures: 0,
            lastSessionOutcome: outcome,
            lastSessionSummary: summary,
            sessionMediaId: null,
            videoGroup: [],
        });
    }, [resetProgressTracking, clearVideoGroupChain, clearVideoAttemptsByMediaId, saveAll, videosGenerated, videoGoal, retryCount, maxRetries, creditsUsed, layer1Failures, layer2Failures, layer3Failures, originalMediaId]);

    const markFailureDetected = useCallback((): 1 | 2 | 3 | null => {
        const now = Date.now();
        // Avoid enabling immediate duplicate retries if a click just occurred
        const justClicked = now - lastClickTime < 250;
        const enableRetry = !justClicked;
        const updates: Partial<typeof postData> = { lastFailureTime: now, canRetry: enableRetry, isSessionActive: true };

        let progressPercent: number | null = lastObservedProgressRef.current;
        if (progressPercent === null) {
            const progressButton = document.querySelector<HTMLButtonElement>(PROGRESS_BUTTON_SELECTOR);
            progressPercent = parseProgress(progressButton?.textContent?.trim());
        }

        const attemptIndex = Math.max(0, postData.retryCount);
        const percentLabel = progressPercent !== null ? `${progressPercent}%` : 'unknown progress';
        const { label: moderationLayer, layer } = describeModerationLayer(progressPercent);
        appendLog(`Failed at ${percentLabel} — ${moderationLayer}`, 'warn');

        if (layer === 1) {
            updates.layer1Failures = layer1Failures + 1;
        } else if (layer === 2) {
            updates.layer2Failures = layer2Failures + 1;
        } else if (layer === 3) {
            updates.layer3Failures = layer3Failures + 1;
            updates.creditsUsed = creditsUsed + 1;
        }

        if (progressPercent !== null) {
            const entries = Array.isArray(postData.attemptProgress) ? postData.attemptProgress : [];
            const lastEntry = entries[entries.length - 1];
            if (!lastEntry || lastEntry.attempt !== attemptIndex || lastEntry.percent !== progressPercent) {
                const nextEntries = [...entries, { attempt: attemptIndex, percent: progressPercent, recordedAt: now }];
                updates.attemptProgress = nextEntries.slice(-MAX_PROGRESS_RECORDS);
            }
        }

        saveAll(updates);
        resetProgressTracking();
        return layer ?? null;
    }, [
        lastClickTime,
        saveAll,
        appendLog,
        postData.retryCount,
        postData.attemptProgress,
        resetProgressTracking,
        layer1Failures,
        layer2Failures,
        layer3Failures,
        creditsUsed,
    ]);

    useEffect(() => {
        try {
            const w: any = window;
            w.__grok_test = w.__grok_test || {};
            w.__grok_test.startSession = () => startSession();
            w.__grok_test.endSession = (outcome?: SessionOutcome) => endSession(outcome);
            w.__grok_test.markFailureDetected = () => markFailureDetected();
            w.__grok_test.__retryBridgeVersion = 'grok-retry@1';
            w.__grok_test.__retryPostId = postId;
            w.__grok_test.__retryMediaId = mediaId;
            w.__grok_test.__retrySessionKey = sessionKey;
        } catch { }
    }, [startSession, endSession, markFailureDetected, postId, mediaId, sessionKey]);

    // Click the "Make video" button with React-style value setting
    const clickMakeVideoButton = useCallback((promptValue?: string, options?: { overridePermit?: boolean }) => {
        const now = Date.now();
        if (postData.videoGoal > 0 && postData.videosGenerated >= postData.videoGoal) {
            appendLog(`Video goal reached — skipping attempt (${postData.videosGenerated}/${postData.videoGoal})`, 'info');
            return false;
        }
        const timeUntilReady = lastClickTime + CLICK_COOLDOWN - now;

        if (timeUntilReady > 0) {
            console.log(`[Grok Retry] Cooldown active, retrying in ${Math.ceil(timeUntilReady / 1000)}s...`);
            appendLog(`Cooldown active — next attempt in ${Math.ceil(timeUntilReady / 1000)}s`, 'info');
            // Schedule the click after cooldown
            if (cooldownTimeoutRef.current) {
                clearTimeout(cooldownTimeoutRef.current);
                cooldownTimeoutRef.current = null;
            }
            cooldownTimeoutRef.current = window.setTimeout(() => {
                cooldownTimeoutRef.current = null;
                // Use overridePermit to ensure single, controlled retry after cooldown
                clickMakeVideoButton(promptValue, { overridePermit: true });
            }, timeUntilReady);
            return false;
        }

        // Guard: only click after a failure notification explicitly enables retry
        if (!postData.canRetry && !options?.overridePermit) {
            appendLog('Guard — waiting for failure notification before retrying');
            return false;
        }

        const buttonSelectors = getGenerateButtonSelectors();
        let button: HTMLButtonElement | null = null;
        for (const selector of buttonSelectors) {
            const candidate = document.querySelector<HTMLButtonElement>(selector);
            if (candidate) {
                button = candidate;
                console.log('[Grok Retry] Found button with selector:', selector);
                break;
            }
        }

        if (!button) {
            console.log('[Grok Retry] Button not found with selectors:', buttonSelectors.join(' | '));
            appendLog('Button not found — selectors failed', 'warn');
            return false;
        }

        const promptSelectors = getPromptSelectorCandidates();
        const promptEntry = findPromptInput();

        if (!promptEntry) {
            console.log('[Grok Retry] Prompt input not found. Selectors tried:', promptSelectors.join(' | '));
            appendLog('Prompt input not found — selector failed', 'error');
            return false;
        }

        const valueToSet = typeof promptValue === 'string' && promptValue.length > 0 ? promptValue : postData.lastPromptValue;
        if (valueToSet) {
            const restored = writePromptValue(promptEntry.element, valueToSet);
            if (restored) {
                console.log('[Grok Retry] Restored prompt to input:', valueToSet.substring(0, 50) + '...');
            } else {
                console.log('[Grok Retry] Failed to restore prompt using target element');
                appendLog('Failed to restore prompt into detected input', 'warn');
            }
        } else {
            console.log('[Grok Retry] Warning: No prompt value to restore!');
            appendLog('No prompt value available to restore', 'warn');
        }

        button.click();
        setLastClickTime(now);
        // Expose last attempt per session key globally for detectors to correlate success across tabs
        const w = window as any;
        w.__grok_attempts = w.__grok_attempts || {};
        const attemptKey = sessionKey ?? postId ?? '__unknown__';
        w.__grok_attempts[attemptKey] = now;

        // Mark session as active; retry count is incremented by scheduler before click
        save('isSessionActive', true);
        save('lastAttemptTime', now);
        // Reset retry permission until next failure notification
        save('canRetry', false);
        console.log('[Grok Retry] Clicked button');
        beginProgressTracking();

        return true;
    }, [
        lastClickTime,
        save,
        postData.canRetry,
        postData.lastPromptValue,
        postData.videoGoal,
        postData.videosGenerated,
        postId,
        sessionKey,
        appendLog,
        beginProgressTracking,
    ]);

    // Lightweight scheduler to avoid getting stuck between detector callbacks
    useEffect(() => {
        try {
            const w = window as any;
            w.__grok_schedulerGate = {
                autoRetryEnabled,
                maxRetries,
                isLoading,
                hasPostId: !!postId,
                sessionKey,
                isSessionActive: postData.isSessionActive,
            };
        } catch { }

        if (!autoRetryEnabled || maxRetries <= 0) return;
        if (isLoading) return;
        if (!postId) return;

        // Clear any existing scheduler
        if (schedulerRef.current) {
            clearInterval(schedulerRef.current);
            schedulerRef.current = null;
        }

        // Start scheduler when session is active; tick every 3 seconds
        if (postData.isSessionActive) {
            const w = window as any;
            try {
                w.__grok_schedulerTick = w.__grok_schedulerTick || 0;
                w.__grok_schedulerActive = true;
            } catch { }
            schedulerRef.current = window.setInterval(() => {
                try {
                    w.__grok_schedulerTick = (w.__grok_schedulerTick || 0) + 1;
                } catch { }
                const now = Date.now();
                const spacingOk = now - lastClickTime >= CLICK_COOLDOWN;
                const underLimit = postData.retryCount < postData.maxRetries;
                const permitted = postData.canRetry === true;
                const goalReached = postData.videoGoal > 0 && postData.videosGenerated >= postData.videoGoal;

                if (goalReached) {
                    appendLog(`Video goal reached — ending session (${postData.videosGenerated}/${postData.videoGoal})`, 'info');
                    endSession('success');
                    return;
                }

                // Check for session timeout (no success/failure feedback for too long)
                const timeSinceLastAttempt = now - postData.lastAttemptTime;
                if (postData.lastAttemptTime > 0 && timeSinceLastAttempt > SESSION_TIMEOUT) {
                    console.warn('[Grok Retry] Session timeout - no feedback for 2 minutes, ending session');
                    appendLog('Session timeout - ending (no success/failure feedback received)', 'warn');
                    endSession('cancelled');
                    return;
                }

                if (!spacingOk || !underLimit || !permitted) return;

                // Consume the retry permission immediately to prevent duplicate retries
                save('canRetry', false);

                // Increment retry count prior to attempting click
                const nextCount = postData.retryCount + 1;
                save('retryCount', nextCount);
                (window as any).__grok_retryCount = nextCount;
                appendLog(`Retry ${nextCount}/${postData.maxRetries}`, 'info');
                // Attempt a retry with the last known prompt value
                const attempted = clickMakeVideoButton(postData.lastPromptValue, { overridePermit: true });
                if (!attempted) {
                    // If we failed to click due to selectors, keep scheduler alive and try again next tick
                    console.log('[Grok Retry] Scheduler tick: click attempt failed, will retry');
                    appendLog('Scheduler — click failed, will retry', 'warn');
                    // Restore permission since we didn't actually click
                    save('canRetry', true);
                    (window as any).__grok_canRetry = true;
                } else {
                    console.log('[Grok Retry] Scheduler tick: click attempted');
                    appendLog('Scheduler — click attempted', 'info');
                }
            }, 3000);
        }

        return () => {
            if (schedulerRef.current) {
                clearInterval(schedulerRef.current);
                schedulerRef.current = null;
            }
            try {
                const w = window as any;
                w.__grok_schedulerActive = false;
            } catch { }
        };
    }, [
        autoRetryEnabled,
        postData.isSessionActive,
        postData.retryCount,
        postData.maxRetries,
        postData.lastPromptValue,
        postData.canRetry,
        postData.videoGoal,
        postData.videosGenerated,
        lastClickTime,
        isLoading,
        postId,
        clickMakeVideoButton,
        appendLog,
        endSession,
    ]);

    useEffect(() => {
        return () => {
            resetProgressTracking();
        };
    }, [resetProgressTracking]);

    return useMemo(() => ({
        // State
        retryCount: postData.retryCount,
        maxRetries,
        autoRetryEnabled,
        lastPromptValue,
        originalPageTitle,
        isSessionActive,
        videoGoal,
        videosGenerated,
        lastAttemptTime,
        logs: postData.logs || [],
        lastFailureTime,
        canRetry: postData.canRetry,
        attemptProgress: postData.attemptProgress,
        creditsUsed,
        layer1Failures,
        layer2Failures,
        layer3Failures,
        lastSessionOutcome,
        lastSessionSummary,
        isLoading,
        originalMediaId: postData.originalMediaId,

        // Actions
        setMaxRetries,
        setAutoRetryEnabled,
        updatePromptValue,
        resetRetries,
        clickMakeVideoButton,
        startSession,
        endSession,
        setVideoGoal,
        incrementVideosGenerated,
        resetVideosGenerated,
        markFailureDetected,
        clearLogs,
    }), [
        postData.retryCount,
        maxRetries,
        autoRetryEnabled,
        lastPromptValue,
        originalPageTitle,
        isSessionActive,
        videoGoal,
        videosGenerated,
        lastAttemptTime,
        postData.logs,
        lastFailureTime,
        postData.canRetry,
        postData.attemptProgress,
        creditsUsed,
        layer1Failures,
        layer2Failures,
        layer3Failures,
        lastSessionOutcome,
        lastSessionSummary,
        isLoading,
        setMaxRetries,
        setAutoRetryEnabled,
        updatePromptValue,
        resetRetries,
        clickMakeVideoButton,
        startSession,
        endSession,
        setVideoGoal,
        incrementVideosGenerated,
        resetVideosGenerated,
        markFailureDetected,
        clearLogs,
    ]);
};