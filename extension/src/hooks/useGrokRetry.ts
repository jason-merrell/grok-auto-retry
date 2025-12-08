import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { usePostStorage } from './useSessionStorage';

const CLICK_COOLDOWN = 8000; // 8 seconds between retries
const SESSION_TIMEOUT = 120000; // 2 minutes - auto-end session if no success/failure feedback
const BUTTON_SELECTORS = [
    'button[aria-label="Redo"]',      // For retries after first generation
    'button[aria-label="Make video"]' // For first generation
];
const TEXTAREA_SELECTOR = 'textarea[aria-label="Make a video"][placeholder="Type to customize video..."]';
const PROGRESS_BUTTON_SELECTOR = 'button[aria-label="Video Options"]';
const MAX_PROGRESS_RECORDS = 25;

type ModerationLayer = {
    label: string;
    explanation: string;
};

const describeModerationLayer = (percent: number | null): ModerationLayer => {
    if (percent === null) {
        return {
            label: 'Security layer unknown',
            explanation: 'Insufficient telemetry captured to infer which moderation stage fired.'
        };
    }

    // Heuristic thresholds: early failures (pre-generation) map to Layer 1, mid-progress to Layer 2,
    // late failures near completion align with Layer 3 rollback behaviour (88%+).
    if (percent >= 88) {
        return {
            label: 'Security Layer 3: POST-GENERATION VALIDATION',
            explanation: ' '
        };
    }

    if (percent >= 25) {
        return {
            label: 'Security Layer 2: MODEL-LEVEL ALIGNMENT',
            explanation: ' '
        };
    }

    return {
        label: 'Security Layer 1: PROMPT FILTERING',
        explanation: ' '
    };
};

const parseProgress = (text?: string | null): number | null => {
    if (!text) return null;
    const numeric = Number.parseFloat(text.replace(/[^\d.]/g, ''));
    if (Number.isNaN(numeric)) return null;
    return Math.min(100, Math.max(0, numeric));
};

export const useGrokRetry = (postId: string | null) => {
    const { data: postData, save, saveAll, isLoading, appendLog } = usePostStorage(postId);

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
    const autoRetryEnabled = postData.autoRetryEnabled;
    const lastPromptValue = postData.lastPromptValue;
    const isSessionActive = postData.isSessionActive;
    const videoGoal = postData.videoGoal;
    const videosGenerated = postData.videosGenerated;
    const lastAttemptTime = postData.lastAttemptTime;
    const lastFailureTime = postData.lastFailureTime;

    try {
        const w = window as any;
        w.__grok_retryState = {
            isSessionActive: postData.isSessionActive,
            retryCount: postData.retryCount,
            canRetry: postData.canRetry,
        };
    } catch { }

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

    const resetProgressTracking = useCallback(() => {
        if (progressObserverRef.current) {
            progressObserverRef.current.disconnect();
            progressObserverRef.current = null;
        }
        lastObservedProgressRef.current = null;
    }, []);

    const incrementVideosGenerated = useCallback(() => {
        resetProgressTracking();
        save('videosGenerated', videosGenerated + 1);
    }, [resetProgressTracking, save, videosGenerated]);

    const resetVideosGenerated = useCallback(() => {
        save('videosGenerated', 0);
    }, [save]);

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

    const startSession = useCallback(() => {
        resetProgressTracking();
        // Clear logs and attempt history at the start of a new session for this post
        saveAll({ isSessionActive: true, retryCount: 0, videosGenerated: 0, logs: [], attemptProgress: [] });
    }, [resetProgressTracking, saveAll]);

    const endSession = useCallback(() => {
        resetProgressTracking();
        save('isSessionActive', false);
        save('retryCount', 0);
        save('videosGenerated', 0);
    }, [resetProgressTracking, save]);

    const markFailureDetected = useCallback(() => {
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
        const { label: moderationLayer, explanation: layerExplanation } = describeModerationLayer(progressPercent);
        appendLog(
            `Attempt ${attemptIndex} failed at ${percentLabel} — assumed ${moderationLayer}. ${layerExplanation}`,
            'warn'
        );

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
    }, [lastClickTime, saveAll, appendLog, postData.retryCount, postData.attemptProgress, resetProgressTracking]);

    useEffect(() => {
        try {
            const w: any = window;
            w.__grok_test = w.__grok_test || {};
            w.__grok_test.startSession = () => startSession();
            w.__grok_test.endSession = () => endSession();
            w.__grok_test.markFailureDetected = () => markFailureDetected();
            w.__grok_test.__retryBridgeVersion = 'grok-retry@1';
            w.__grok_test.__retryPostId = postId;
        } catch { }
    }, [startSession, endSession, markFailureDetected, postId]);

    // Click the "Make video" button with React-style value setting
    const clickMakeVideoButton = useCallback((promptValue?: string, options?: { overridePermit?: boolean }) => {
        const now = Date.now();
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

        // Try to find the button using either selector
        let button: HTMLButtonElement | null = null;
        for (const selector of BUTTON_SELECTORS) {
            button = document.querySelector<HTMLButtonElement>(selector);
            if (button) {
                console.log('[Grok Retry] Found button with selector:', selector);
                break;
            }
        }

        if (!button) {
            console.log('[Grok Retry] Button not found with any selector:', BUTTON_SELECTORS.join(' | '));
            appendLog('Button not found — selectors failed', 'warn');
            return false;
        }

        // Always restore the prompt value to the textarea before clicking
        const textarea = document.querySelector<HTMLTextAreaElement>(TEXTAREA_SELECTOR);
        if (!textarea) {
            console.log('[Grok Retry] Textarea not found:', TEXTAREA_SELECTOR);
            appendLog('Textarea not found — selector failed', 'error');
            return false;
        }
        // Fallback to last known prompt value from storage when explicit value not provided
        const valueToSet = typeof promptValue === 'string' && promptValue.length > 0 ? promptValue : postData.lastPromptValue;
        if (valueToSet) {
            // React-style value setting to ensure React detects the change
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLTextAreaElement.prototype,
                'value'
            )?.set;

            if (nativeInputValueSetter) {
                nativeInputValueSetter.call(textarea, valueToSet);
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                console.log('[Grok Retry] Restored prompt to textarea:', valueToSet.substring(0, 50) + '...');
                appendLog('Restored prompt to site textarea', 'info');
            }
        } else {
            console.log('[Grok Retry] Warning: No prompt value to restore!');
            appendLog('No prompt value available to restore', 'warn');
        }

        appendLog('Clicking generate button', 'info');
        button.click();
        setLastClickTime(now);
        // Expose last attempt per postId globally for detectors to correlate success across tabs
        const w = window as any;
        w.__grok_attempts = w.__grok_attempts || {};
        if (postId) {
            w.__grok_attempts[postId] = now;
        } else {
            w.__grok_attempts['__unknown__'] = now;
        }

        // Mark session as active; retry count is incremented by scheduler before click
        save('isSessionActive', true);
        save('lastAttemptTime', now);
        // Reset retry permission until next failure notification
        save('canRetry', false);
        console.log('[Grok Retry] Clicked button');
        appendLog('Clicked — attempt started', 'info');
        beginProgressTracking();

        return true;
    }, [lastClickTime, save, postData.canRetry, postData.lastPromptValue, postId, appendLog, beginProgressTracking]);

    // Lightweight scheduler to avoid getting stuck between detector callbacks
    useEffect(() => {
        try {
            const w = window as any;
            w.__grok_schedulerGate = {
                autoRetryEnabled,
                maxRetries,
                isLoading,
                hasPostId: !!postId,
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

                // Check for session timeout (no success/failure feedback for too long)
                const timeSinceLastAttempt = now - postData.lastAttemptTime;
                if (postData.lastAttemptTime > 0 && timeSinceLastAttempt > SESSION_TIMEOUT) {
                    console.warn('[Grok Retry] Session timeout - no feedback for 2 minutes, ending session');
                    appendLog('Session timeout - ending (no success/failure feedback received)', 'warn');
                    endSession();
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
        lastClickTime,
        isLoading,
        postId,
        clickMakeVideoButton,
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
        isLoading,

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
    ]);
};