import { useState, useCallback, useEffect, useRef } from 'react';
import { getGenerateButtonSelectors } from '../config/selectors';
import { findPromptInput, writePromptValue } from '../lib/promptInput';
import { useGrokRetryVideoSessions } from './useGrokRetryVideoSessions';
import type { SessionOutcome, SessionSummary } from './useGrokRetryVideoSessions';
import type { PostRouteIdentity } from './useGrokRetryPostId';
import { CLICK_COOLDOWN_MS } from '../lib/retryConstants';
const PROGRESS_BUTTON_SELECTOR = 'button[aria-label="Video Options"]';
const MAX_PROGRESS_RECORDS = 25;

export interface ProgressTerminalEvent {
    text: string | null;
    previousPercent: number | null;
}

export type ProgressTerminalHandler = (event: ProgressTerminalEvent) => void;

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

/**
 * Main orchestration hook for Grok video retry automation.
 * 
 * Manages the complete lifecycle of automated video generation sessions including:
 * - Session state management across route changes
 * - Retry logic with configurable limits and cooldowns
 * - Progress tracking via DOM observation
 * - Moderation layer detection (prompt filtering, model alignment, post-validation)
 * - Credit usage and failure statistics
 * - Video goal tracking for batch generation
 * - Automatic button clicking with guards and cooldowns
 * 
 * @param postId - Current X/Twitter post ID (route identifier)
 * @param mediaId - Current media ID (image being animated)
 * @returns Comprehensive state and control functions for retry automation
 * 
 * @example
 * ```tsx
 * const retry = useGrokRetry({ postId: '123', mediaId: 'abc' });
 * 
 * // Start a session
 * retry.startSession('A cinematic shot of a cat');
 * 
 * // Monitor progress
 * console.log(`Retry ${retry.retryCount}/${retry.maxRetries}`);
 * console.log(`Videos: ${retry.videosGenerated}/${retry.videoGoal}`);
 * ```
 */
export const useGrokRetry = ({
    postId,
    store,
}: PostRouteIdentity & { store: ReturnType<typeof useGrokRetryVideoSessions> }) => {
    const { data: postData, isLoading, updateSession, updatePersistent, forceReload, addLogEntry } = store;

    const [lastClickTime, setLastClickTime] = useState(0);
    const [originalPageTitle, setOriginalPageTitle] = useState("");
    const cooldownTimeoutRef = useRef<number | null>(null);
    const progressObserverRef = useRef<MutationObserver | null>(null);
    const lastObservedProgressRef = useRef<number | null>(null);

    // Initialize original page title
    useEffect(() => {
        if (!originalPageTitle) {
            setOriginalPageTitle(document.title);
        }
    }, [originalPageTitle]);

    // Extract data with defaults
    const maxRetries = postData?.maxRetries ?? 3;
    const retryCount = postData?.retryCount ?? 0;
    const autoRetryEnabled = postData?.autoRetryEnabled ?? true;
    const lastPromptValue = postData?.lastPromptValue ?? "";
    const isSessionActive = postData?.isActive ?? false;
    const videoGoal = postData?.videoGoal ?? 1;
    const videosGenerated = postData?.videosGenerated ?? 0;
    const lastAttemptTime = postData?.lastAttemptTime ?? 0;
    const lastFailureTime = postData?.lastFailureTime ?? 0;
    const creditsUsed = postData?.creditsUsed ?? 0;
    const layer1Failures = postData?.layer1Failures ?? 0;
    const layer2Failures = postData?.layer2Failures ?? 0;
    const layer3Failures = postData?.layer3Failures ?? 0;
    const lastSessionOutcome = postData?.outcome ?? "idle";
    const lastSessionSummary = postData?.lastSessionSummary ?? null;
    const logs = postData?.logs ?? [];
    const pendingRetryAt = postData?.pendingRetryAt ?? null;
    const pendingRetryPrompt = postData?.pendingRetryPrompt ?? null;
    const pendingRetryOverride = postData?.pendingRetryOverride ?? false;

    try {
        const w = window as any;
        w.__grok_retryState = {
            isSessionActive: postData?.isActive ?? false,
            retryCount: postData?.retryCount ?? 0,
            canRetry: postData?.canRetry ?? false,
            pendingRetryAt: postData?.pendingRetryAt ?? null,
        };
    } catch { }

    const setMaxRetries = useCallback(
        (value: number) => {
            const clamped = Math.max(1, Math.min(50, value));
            updatePersistent({ maxRetries: clamped });
        },
        [updatePersistent]
    );

    const setAutoRetryEnabled = useCallback(
        (value: boolean) => {
            updatePersistent({ autoRetryEnabled: value });
        },
        [updatePersistent]
    );

    const updatePromptValue = useCallback(
        (value: string) => {
            updatePersistent({ lastPromptValue: value });
        },
        [updatePersistent]
    );

    const resetRetries = useCallback(() => {
        updateSession({ retryCount: 0 });
    }, [updateSession]);

    const setVideoGoal = useCallback(
        (value: number) => {
            const clamped = Math.max(1, Math.min(50, value));
            updatePersistent({ videoGoal: clamped });
        },
        [updatePersistent]
    );

    const clearLogs = useCallback(() => {
        updateSession({ logs: [] });
    }, [updateSession]);

    const recordProgressSnapshot = useCallback(
        (percent: number) => {
            if (!postData) return;

            const attempt = postData.currentAttemptNumber || 1;
            const recordedAt = Date.now();
            const newEntry = { attempt, percent, recordedAt };

            const updated = [...(postData.attemptProgress || []), newEntry].slice(-MAX_PROGRESS_RECORDS);
            updateSession({ attemptProgress: updated });

            lastObservedProgressRef.current = percent;
        },
        [postData, retryCount, updateSession]
    );

    const stopProgressObserver = useCallback(() => {
        if (progressObserverRef.current) {
            progressObserverRef.current.disconnect();
            progressObserverRef.current = null;
        }
    }, []);

    const progressTerminalHandlerRef = useRef<ProgressTerminalHandler | null>(null);

    const startProgressObserver = useCallback(() => {
        stopProgressObserver();

        const button = document.querySelector(PROGRESS_BUTTON_SELECTOR) as HTMLElement;
        if (!button) {
            console.log("[Grok Retry] Progress button not found, will try again later");
            return;
        }

        const observer = new MutationObserver(() => {
            const progressText = button.textContent ?? "";
            const percent = parseProgress(progressText);

            if (percent !== null && percent !== lastObservedProgressRef.current) {
                console.log(`[Grok Retry] Progress observed: ${percent}%`);
                recordProgressSnapshot(percent);
            } else if (percent === null && lastObservedProgressRef.current !== null) {
                const previousPercent = lastObservedProgressRef.current;
                const trimmed = progressText.trim();
                console.log("[Grok Retry] Progress indicator exited percent state", {
                    previousPercent,
                    text: trimmed,
                });

                lastObservedProgressRef.current = null;
                observer.disconnect();
                if (progressObserverRef.current === observer) {
                    progressObserverRef.current = null;
                }

                try {
                    progressTerminalHandlerRef.current?.({
                        text: trimmed.length > 0 ? trimmed : null,
                        previousPercent,
                    });
                } catch (error) {
                    console.warn("[Grok Retry] Progress terminal handler error:", error);
                }
            }
        });

        observer.observe(button, {
            childList: true,
            subtree: true,
            characterData: true,
        });

        progressObserverRef.current = observer;
        console.log("[Grok Retry] Progress observer started");
    }, [stopProgressObserver, recordProgressSnapshot]);

    const setProgressTerminalHandler = useCallback((handler: ProgressTerminalHandler | null) => {
        progressTerminalHandlerRef.current = handler;
    }, []);

    const markFailureDetected = useCallback((): 1 | 2 | 3 | null => {
        if (!postData) return null;

        const now = Date.now();
        const attemptProgress = postData.attemptProgress || [];
        const recentAttempt = attemptProgress[attemptProgress.length - 1];
        const lastPercent = recentAttempt?.percent ?? null;
        const layer = describeModerationLayer(lastPercent);

        console.log("[Grok Retry] Failure detected:", { lastPercent, layer });
        addLogEntry(`Moderation failure detected at ${lastPercent ?? "unknown"}% progress.`, "error");
        addLogEntry(`> ${layer.label}: ${layer.explanation}`, "error");

        const updates: any = {
            lastFailureTime: now,
            canRetry: retryCount < maxRetries,
            creditsUsed: creditsUsed + 1,
        };

        if (layer.layer === 1) updates.layer1Failures = layer1Failures + 1;
        else if (layer.layer === 2) updates.layer2Failures = layer2Failures + 1;
        else if (layer.layer === 3) updates.layer3Failures = layer3Failures + 1;

        updateSession(updates);
        stopProgressObserver();

        return layer.layer ?? null;
    }, [
        postData,
        retryCount,
        maxRetries,
        creditsUsed,
        layer1Failures,
        layer2Failures,
        layer3Failures,
        updateSession,
        stopProgressObserver,
        addLogEntry,
    ]);

    const incrementVideosGenerated = useCallback(() => {
        if (!postData) return;

        const newCount = videosGenerated + 1;
        console.log("[Grok Retry] Video generated successfully:", { count: newCount, goal: videoGoal });

        updateSession({
            videosGenerated: newCount,
            creditsUsed: creditsUsed + 1,
            pendingRetryAt: null,
            pendingRetryPrompt: null,
        });

        addLogEntry(`Video ${newCount}/${videoGoal} generated successfully`, "success");
        stopProgressObserver();
    }, [postData, videosGenerated, videoGoal, creditsUsed, updateSession, addLogEntry, stopProgressObserver]);

    const clickMakeVideoButton = useCallback(
        (promptValue?: string, options?: { overridePermit?: boolean; context?: string }) => {
            const now = Date.now();
            const timeUntilReady = lastClickTime + CLICK_COOLDOWN_MS - now;
            const logContext = options?.context ? ` [${options.context}]` : "";

            if (timeUntilReady > 0) {
                const seconds = Math.ceil(timeUntilReady / 1000);
                console.log(`[Grok Retry] Cooldown active${logContext}, retrying in ${seconds}s...`);
                addLogEntry(`Cooldown active — next attempt in ${seconds}s`, "info");

                // Schedule the click after cooldown
                if (cooldownTimeoutRef.current) {
                    clearTimeout(cooldownTimeoutRef.current);
                    cooldownTimeoutRef.current = null;
                }
                cooldownTimeoutRef.current = window.setTimeout(() => {
                    cooldownTimeoutRef.current = null;
                    clickMakeVideoButton(promptValue, { overridePermit: true });
                }, timeUntilReady);
                return false;
            }

            // Guard: only click after a failure notification explicitly enables retry
            if (!postData?.canRetry && !options?.overridePermit) {
                console.warn(`[Grok Retry] Guard prevented click${logContext} — canRetry false`);
                addLogEntry("Guard — waiting for failure notification before retrying");
                return false;
            }

            const selectors = getGenerateButtonSelectors();
            let button: HTMLButtonElement | null = null;

            for (const selector of selectors) {
                const candidate = document.querySelector<HTMLButtonElement>(selector);
                if (candidate) {
                    button = candidate;
                    console.log("[Grok Retry] Found button with selector:", selector);
                    break;
                }
            }

            if (!button) {
                console.error(`[Grok Retry] Make video button not found${logContext}. Tried selectors: ${selectors.join(", ")}`);
                addLogEntry("Button not found - cannot retry", "error");
                return false;
            }

            const promptEntry = findPromptInput();
            if (!promptEntry) {
                console.warn(`[Grok Retry] Prompt input not found${logContext}`);
                addLogEntry("Prompt input not found", "warn");
                return false;
            }

            const valueToSet = promptValue || lastPromptValue;
            if (valueToSet) {
                console.log("[Grok Retry] Restoring prompt to input:", valueToSet.substring(0, 50) + "...");
                const restored = writePromptValue(promptEntry.element, valueToSet);
                if (!restored) {
                    console.warn("[Grok Retry] Failed to restore prompt");
                }
            }

            console.log(`[Grok Retry] Clicking button${logContext}`);
            button.click();
            addLogEntry('Clicked "Make video" button', "info");

            setLastClickTime(now);
            updateSession({
                lastAttemptTime: now,
                pendingRetryAt: null,
                pendingRetryPrompt: null,
                pendingRetryOverride: false,
            });

            return true;
        },
        [postData, lastClickTime, lastPromptValue, updateSession, addLogEntry]
    );

    const startSession = useCallback(
        (prompt: string) => {
            console.log("[Grok Retry] Starting session with prompt:", prompt);

            updateSession({
                isActive: true,
                retryCount: 0,
                videosGenerated: 0,
                currentAttemptNumber: 1,
                canRetry: true,
                outcome: "pending",
                currentPostId: postId,
                processedAttemptIds: postId ? [postId] : [],
                pendingRetryAt: null,
                pendingRetryPrompt: null,
                pendingRetryOverride: false,
                logs: [],
                attemptProgress: [],
                lastSessionSummary: null,
            });

            updatePersistent({
                lastPromptValue: prompt,
            });

            addLogEntry(`Session started with prompt: ${prompt}`, "info");

            // Clear and immediately click
            const clicked = clickMakeVideoButton(prompt, { overridePermit: true });
            if (clicked) {
                // Start observing progress after a short delay
                setTimeout(() => startProgressObserver(), 1000);
            }
        },
        [updateSession, updatePersistent, postId, addLogEntry, clickMakeVideoButton, startProgressObserver]
    );

    const endSession = useCallback(
        (outcome: SessionOutcome, skipSummary: boolean = false) => {
            console.log("[Grok Retry] Ending session with outcome:", outcome);

            stopProgressObserver();

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

            updateSession({
                isActive: false,
                outcome,
                lastSessionSummary: skipSummary ? null : summary,
                pendingRetryAt: null,
                pendingRetryPrompt: null,
                pendingRetryOverride: false,
            });

            addLogEntry(`Session ended: ${outcome}`, outcome === "success" ? "success" : "error");
        },
        [
            stopProgressObserver,
            videosGenerated,
            videoGoal,
            retryCount,
            maxRetries,
            creditsUsed,
            layer1Failures,
            layer2Failures,
            layer3Failures,
            updateSession,
            addLogEntry,
        ]
    );

    return {
        // State
        maxRetries,
        retryCount,
        autoRetryEnabled,
        lastPromptValue,
        isSessionActive,
        videoGoal,
        videosGenerated,
        lastAttemptTime,
        lastFailureTime,
        creditsUsed,
        layer1Failures,
        layer2Failures,
        layer3Failures,
        lastSessionOutcome,
        lastSessionSummary,
        originalPageTitle,
        isLoading,
        logs,
        pendingRetryAt,
        pendingRetryPrompt,
        pendingRetryOverride,
        // Methods
        setMaxRetries,
        setAutoRetryEnabled,
        updatePromptValue,
        resetRetries,
        setVideoGoal,
        startSession,
        endSession,
        clickMakeVideoButton,
        startProgressObserver,
        markFailureDetected,
        incrementVideosGenerated,
        clearLogs,
        forceReload,
        updateSession,
        setProgressTerminalHandler,
        addLogEntry,
    };
};
