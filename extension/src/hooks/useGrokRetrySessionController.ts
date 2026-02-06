import { useCallback, useEffect, useRef } from "react";
import { CLICK_COOLDOWN_MS } from "../lib/retryConstants";
import { useGrokRetryModerationDetector } from "./useGrokRetryModerationDetector";
import { useGrokRetrySuccessDetector } from "./useGrokRetrySuccessDetector";
import { useGrokRetryGrokStorage } from "./useGrokRetryGrokStorage";
import type { PromptHistoryLayer } from "@/lib/promptHistory";
import type { MutableRefObject } from "react";
import type { ProgressTerminalHandler } from "./useGrokRetry";

interface UseGrokRetrySessionControllerParams {
    isImaginePostRoute: boolean;
    postId: string | null;
    generationDelayMs: number;
    capturePromptFromSite: () => string | null;
    recordPromptHistoryOutcome: (args: { text: string; status: "success" | "failure"; layer?: PromptHistoryLayer }) => void;
    markFailureDetected: () => 1 | 2 | 3 | null;
    incrementVideosGenerated: () => void;
    updatePromptValue: (value: string) => void;
    clickMakeVideoButton: (promptValue?: string, options?: { overridePermit?: boolean; context?: string }) => boolean;
    startProgressObserver: () => void;
    endSession: (outcome: "success" | "failure" | "cancelled") => void;
    updateSession: (updates: Record<string, unknown>) => void;
    setProgressTerminalHandler: (handler: ProgressTerminalHandler | null) => void;
    forceReload?: (() => void) | null;
    addLogEntry: (message: string, level?: 'info' | 'warn' | 'error' | 'success') => void;
    isSessionActive: boolean;
    autoRetryEnabled: boolean;
    retryCount: number;
    maxRetries: number;
    videoGoal: number;
    videosGenerated: number;
    lastPromptValue: string;
    lastAttemptTime: number;
    pendingRetryAt: number | null;
}

interface UseGrokRetrySessionControllerResult {
    nextVideoTimeoutRef: MutableRefObject<NodeJS.Timeout | null>;
    pendingModerationRetryRef: MutableRefObject<boolean>;
    sessionPromptRef: MutableRefObject<string | null>;
    scheduleRetryAttempt: (
        promptSeed: string | null,
        delayMs: number,
        context?: string,
        options?: { overrideGuard?: boolean }
    ) => void;
    rateLimitDetected: boolean;
}

/**
 * Coordinates the Grok retry session lifecycle, handling moderation gating, retry scheduling,
 * prompt persistence, and success validation across UI and storage signals.
 */
const STALLED_RETRY_THRESHOLD_MS = 15000;

export const useGrokRetrySessionController = ({
    isImaginePostRoute,
    postId,
    generationDelayMs,
    capturePromptFromSite,
    recordPromptHistoryOutcome,
    markFailureDetected,
    incrementVideosGenerated,
    updatePromptValue,
    clickMakeVideoButton,
    startProgressObserver,
    endSession,
    updateSession,
    setProgressTerminalHandler,
    forceReload,
    addLogEntry,
    isSessionActive,
    autoRetryEnabled,
    retryCount,
    maxRetries,
    videoGoal,
    videosGenerated,
    lastPromptValue,
    lastAttemptTime,
    pendingRetryAt,
}: UseGrokRetrySessionControllerParams): UseGrokRetrySessionControllerResult => {
    const nextVideoTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const pendingModerationRetryRef = useRef(false);
    const sessionPromptRef = useRef<string | null>(null);
    const moderationValidationRequestedRef = useRef<"ui" | null>(null);
    const successValidationRequestedRef = useRef<"ui" | null>(null);
    const pendingRetryAtRef = useRef<number | null>(pendingRetryAt);
    const lastAttemptTimeRef = useRef<number>(lastAttemptTime);
    const isSessionActiveRef = useRef<boolean>(isSessionActive);
    const retryStateRef = useRef({ retryCount, maxRetries, autoRetryEnabled });

    useEffect(() => {
        pendingRetryAtRef.current = pendingRetryAt;
    }, [pendingRetryAt]);

    useEffect(() => {
        lastAttemptTimeRef.current = lastAttemptTime;
    }, [lastAttemptTime]);

    useEffect(() => {
        isSessionActiveRef.current = isSessionActive;
    }, [isSessionActive]);

    useEffect(() => {
        retryStateRef.current = { retryCount, maxRetries, autoRetryEnabled };
    }, [retryCount, maxRetries, autoRetryEnabled]);

    const recordPromptOutcome = useCallback(
        (status: "success" | "failure", layer?: PromptHistoryLayer | null) => {
            const baseText = sessionPromptRef.current ?? lastPromptValue;
            if (!baseText) {
                return;
            }

            recordPromptHistoryOutcome({
                text: baseText,
                status,
                layer: layer ?? undefined,
            });
        },
        [recordPromptHistoryOutcome, lastPromptValue]
    );

    type PendingRouteEvaluation = {
        timeoutId?: number;
        from?: string;
        to?: string;
    };

    const clearRouteGraceWindow = useCallback(
        (reason: string) => {
            if (typeof window === "undefined") {
                return;
            }

            const w = window as any;
            const pending = w.__grok_pending_route_eval as PendingRouteEvaluation | undefined;
            const lastEval = w.__grok_last_route_eval as { from?: string; to?: string } | undefined;

            if (!pending && !lastEval) {
                console.log("[Grok Retry] No pending route grace window to clear", { reason });
                return;
            }

            try {
                if (pending && typeof pending.timeoutId === "number") {
                    window.clearTimeout(pending.timeoutId);
                }
            } catch (error) {
                console.warn("[Grok Retry] Failed to clear route grace timer", error);
            }

            const now = Date.now();
            const sessionPostId = w.__grok_session_post_id as string | undefined;
            const from = sessionPostId ?? pending?.from ?? lastEval?.from ?? null;
            const to = pending?.to ?? lastEval?.to ?? null;

            delete w.__grok_pending_route_eval;
            delete w.__grok_route_eval_log_state;
            delete w.__grok_last_route_eval;

            if (typeof from === "string" && from.length > 0) {
                w.__grok_route_changed = {
                    from,
                    to: typeof to === "string" ? to : null,
                    at: now,
                    reason: `grace-clear:${reason}`,
                };
            }

            w.__grok_route_eval_suppress_until = now + 1500;

            console.log("[Grok Retry] Cleared pending route grace window", {
                reason,
                from,
                to,
                suppressedUntil: w.__grok_route_eval_suppress_until,
            });
        },
        []
    );

    const scheduleRetryAttempt = useCallback(
        (
            promptSeed: string | null,
            delayMs: number,
            context: string = "unknown",
            options?: { overrideGuard?: boolean }
        ) => {
            const normalizedDelay = Math.max(0, delayMs);
            const targetTime = Date.now() + normalizedDelay;
            const shouldOverrideGuard = options?.overrideGuard ?? false;

            if (nextVideoTimeoutRef.current) {
                clearTimeout(nextVideoTimeoutRef.current);
                nextVideoTimeoutRef.current = null;
            }

            const persistedPrompt = promptSeed ?? sessionPromptRef.current ?? null;
            const delaySeconds = Math.round((normalizedDelay / 1000) * 10) / 10;
            console.log("[Grok Retry] Scheduling retry", {
                context,
                delayMs: normalizedDelay,
                delaySeconds,
                hasPersistedPrompt: !!persistedPrompt,
                sessionPromptCached: !!sessionPromptRef.current,
                pendingModerationRetry: pendingModerationRetryRef.current,
                isSessionActive,
                lastAttemptTime,
            });
            addLogEntry(`Scheduling retry (${context}) in ${delaySeconds}s`, "info");

            pendingModerationRetryRef.current = true;
            updateSession({
                pendingRetryAt: targetTime,
                pendingRetryPrompt: persistedPrompt,
                pendingRetryOverride: shouldOverrideGuard,
            });

            nextVideoTimeoutRef.current = setTimeout(() => {
                const isSessionActive = isSessionActiveRef.current;
                const lastAttemptTime = lastAttemptTimeRef.current;
                const retryPrompt = persistedPrompt;
                const timerContext = `retry-timer:${context}`;

                console.log("[Grok Retry] Retry timer fired", {
                    context: timerContext,
                    hasPersistedPrompt: !!persistedPrompt,
                    pendingModerationRetry: pendingModerationRetryRef.current,
                    lastAttemptTime,
                });
                addLogEntry(`Retry timer fired (${timerContext})`, "info");
                pendingModerationRetryRef.current = false;
                nextVideoTimeoutRef.current = null;

                if (!isSessionActive) {
                    console.log("[Grok Retry] Retry timer aborted - session inactive", { context: timerContext });
                    addLogEntry(`Retry timer aborted - session inactive (${timerContext})`, "warn");
                    updateSession({ pendingRetryAt: null, pendingRetryPrompt: null, pendingRetryOverride: false });
                    return;
                }

                const clicked = clickMakeVideoButton(retryPrompt ?? undefined, {
                    overridePermit: shouldOverrideGuard,
                });
                if (clicked) {
                    console.log("[Grok Retry] Retry click succeeded", {
                        context: timerContext,
                        hasRetryPrompt: !!retryPrompt,
                    });
                    addLogEntry(`Retry click succeeded (${timerContext})`, "info");
                    if (retryPrompt) {
                        sessionPromptRef.current = retryPrompt;
                    }

                    // Increment attempt number for next progress tracking
                    updateSession({
                        pendingRetryAt: null,
                        pendingRetryPrompt: null,
                        pendingRetryOverride: false,
                        currentAttemptNumber: (retryCount || 0) + 2  // retryCount + 1 for next attempt + 1 for base
                    });

                    setTimeout(() => {
                        if (isSessionActive) {
                            startProgressObserver();
                        }
                    }, 800);
                    return;
                }

                console.warn("[Grok Retry] Retry click blocked - rescheduling", {
                    context: timerContext,
                    hasRetryPrompt: !!retryPrompt,
                    lastAttemptTime,
                });
                addLogEntry(`Retry click blocked - rescheduling (${timerContext})`, "warn");
                const cooldownRemaining = lastAttemptTime
                    ? Math.max(0, lastAttemptTime + CLICK_COOLDOWN_MS - Date.now())
                    : 0;
                const fallbackDelay = Math.max(cooldownRemaining + 200, 1500);
                const rescheduleContext = context ? `${context}:fallback` : "fallback";
                scheduleRetryAttempt(retryPrompt ?? null, fallbackDelay, rescheduleContext, options);
            }, normalizedDelay);
        },
        [
            capturePromptFromSite,
            clickMakeVideoButton,
            isSessionActive,
            lastAttemptTime,
            lastPromptValue,
            sessionPromptRef,
            startProgressObserver,
            updateSession,
            addLogEntry,
        ]
    );

    const handleModerationDetected = useCallback(
        (source: "storage" | "ui" = "storage") => {
            moderationValidationRequestedRef.current = null;

            if (pendingRetryAtRef.current && source === "storage") {
                const timeSincePending = Date.now() - pendingRetryAtRef.current;
                if (timeSincePending < 5000) {
                    console.log(
                        "[Grok Retry] Ignoring storage-based moderation event - watchdog retry likely pending",
                        { source, timeSincePending }
                    );
                    addLogEntry(`Ignoring storage-based moderation event (watchdog pending)`, "info");
                    return;
                }
            }

            if (!isSessionActive) {
                console.log("[Grok Retry] Ignoring moderation - session not active", { source });
                addLogEntry(`Ignoring moderation event (session inactive)`, "info");
                return;
            }

            clearRouteGraceWindow(`moderation:${source}`);

            if (pendingModerationRetryRef.current) {
                console.log("[Grok Retry] Moderation already handled — awaiting pending retry", { source });
                addLogEntry(`Ignoring moderation event (already handled)`, "info");
                return;
            }

            if (lastAttemptTime > 0) {
                const timeSinceAttempt = Date.now() - lastAttemptTime;
                if (timeSinceAttempt <= 6000) {
                    console.log("[Grok Retry] Moderation detected quickly after attempt", {
                        source,
                        timeSinceAttempt,
                    });
                }
            }

            const shouldRetry = autoRetryEnabled && retryCount < maxRetries;
            console.log("[Grok Retry] Moderation detected", {
                retryCount,
                source,
            });
            addLogEntry(`Moderation detected via ${source}`, "warn");

            let promptSnapshot = sessionPromptRef.current ?? lastPromptValue;
            if (!promptSnapshot && retryCount === 0) {
                const captured = capturePromptFromSite();
                if (captured) {
                    updatePromptValue(captured);
                    promptSnapshot = captured;
                }
            }

            const failureLayer = markFailureDetected();
            recordPromptOutcome("failure", failureLayer);

            if (!shouldRetry) {
                console.log("[Grok Retry] Moderation detected but not retrying:", {
                    autoRetryEnabled,
                    retryCount,
                    maxRetries,
                    source,
                });
                addLogEntry(`Not retrying: auto-retry disabled or max retries reached.`, "warn");

                updateSession({ pendingRetryAt: null, pendingRetryPrompt: null, pendingRetryOverride: false });
                if (isSessionActive) {
                    endSession("failure");
                }
                return;
            }

            if (promptSnapshot) {
                sessionPromptRef.current = promptSnapshot;
            }

            if (nextVideoTimeoutRef.current) {
                clearTimeout(nextVideoTimeoutRef.current);
                nextVideoTimeoutRef.current = null;
            }

            const cooldownRemaining = lastAttemptTime ? Math.max(0, lastAttemptTime + CLICK_COOLDOWN_MS - Date.now()) : 0;
            const retryDelay = Math.max(cooldownRemaining, 1200);
            const retryNumber = retryCount + 1;
            const delaySeconds = Math.round((retryDelay / 1000) * 10) / 10;
            console.log(`[Grok Retry] Scheduling retry ${retryNumber}/${maxRetries} in ${delaySeconds}s`, {
                source,
            });
            addLogEntry(`Scheduling retry ${retryNumber}/${maxRetries} in ${delaySeconds}s`, "info");

            const scheduledPrompt = sessionPromptRef.current ?? promptSnapshot ?? lastPromptValue ?? null;
            scheduleRetryAttempt(scheduledPrompt, retryDelay, "moderation", { overrideGuard: true });
        },
        [
            autoRetryEnabled,
            capturePromptFromSite,
            clearRouteGraceWindow,
            endSession,
            isSessionActive,
            lastAttemptTime,
            lastPromptValue,
            markFailureDetected,
            maxRetries,
            recordPromptOutcome,
            retryCount,
            scheduleRetryAttempt,
            sessionPromptRef,
            updatePromptValue,
            addLogEntry,
        ]
    );

    const requestModerationValidation = useCallback(
        (source: "ui") => {
            const sessionEngaged = isSessionActive || Boolean(pendingRetryAt);
            if (!sessionEngaged) {
                console.log("[Grok Retry] Ignoring moderation validation request - session not engaged", { source });
                addLogEntry(`Ignoring moderation validation (session not engaged)`, "info");
                return;
            }

            if (moderationValidationRequestedRef.current === source) {
                console.log("[Grok Retry] Moderation validation already pending", { source });
                addLogEntry(`Ignoring moderation validation (already pending)`, "info");
                return;
            }

            moderationValidationRequestedRef.current = source;
            console.log("[Grok Retry] Moderation detected via UI - requesting Grok storage validation");
            addLogEntry(`Moderation detected via UI - validating with storage`, "info");

            if (typeof forceReload === "function") {
                setTimeout(() => {
                    if (moderationValidationRequestedRef.current !== source) {
                        return;
                    }
                    console.log("[Grok Retry] Triggering storage reload for moderation validation");
                    forceReload();
                }, 0);
            }
        },
        [forceReload, isSessionActive, pendingRetryAt, addLogEntry]
    );

    const { rateLimitDetected } = useGrokRetryModerationDetector({
        onModerationDetected: () => {
            console.log("[Grok Retry] Moderation detected via toast - triggering immediate validation");
            requestModerationValidation("ui");
        },
        addLogEntry,
        enabled: Boolean(isImaginePostRoute && (isSessionActive || pendingRetryAt)),
    });

    useGrokRetryGrokStorage(postId, {
        onVideoDetected: (video) => {
            console.log("[Grok Storage] Video detected:", {
                videoId: video.videoId,
                moderated: video.moderated,
                mode: video.mode,
                createTime: video.createTime,
            });
        },
        onModerationDetected: (video) => {
            console.log("[Grok Storage] Moderation detected/validated:", {
                videoId: video.videoId,
                createTime: video.createTime,
                prompt: video.videoPrompt || "(empty)",
                thumbnailUrl: video.thumbnailImageUrl,
            });
            addLogEntry(`Moderation validated by storage for video ${video.videoId}`, "warn");

            handleModerationDetected("storage");

            if (forceReload) {
                setTimeout(() => {
                    if (typeof forceReload === "function") {
                        forceReload();
                    }
                }, 0);
            }
        },
        debug: false,
    });

    useEffect(() => {
        if (!isSessionActive || !lastAttemptTime || pendingRetryAt) {
            return;
        }

        const timer = window.setTimeout(() => {
            const active = isSessionActiveRef.current;
            if (!active) {
                return;
            }

            if (pendingRetryAtRef.current) {
                return;
            }

            const lastAttemptRecorded = lastAttemptTimeRef.current;
            if (!lastAttemptRecorded) {
                return;
            }

            const elapsedMs = Date.now() - lastAttemptRecorded;
            if (elapsedMs < STALLED_RETRY_THRESHOLD_MS) {
                return;
            }

            const { retryCount: currentRetryCount, maxRetries: currentMaxRetries, autoRetryEnabled: autoEnabled } =
                retryStateRef.current;

            console.warn("[Grok Retry] Watchdog detected stalled attempt", {
                elapsedMs,
                retryCount: currentRetryCount,
                maxRetries: currentMaxRetries,
            });
            addLogEntry(`Watchdog: Stalled attempt detected (${Math.round(elapsedMs / 1000)}s elapsed)`, "warn");

            if (typeof forceReload === "function") {
                forceReload();
            }

            if (!autoEnabled || currentRetryCount >= currentMaxRetries) {
                console.warn("[Grok Retry] Watchdog ending session after stall", {
                    autoRetryEnabled: autoEnabled,
                    retryCount: currentRetryCount,
                    maxRetries: currentMaxRetries,
                });
                addLogEntry(`Watchdog: Ending session after stall`, "error");
                endSession("failure");
                return;
            }

            const fallbackPrompt = sessionPromptRef.current ?? capturePromptFromSite() ?? lastPromptValue;
            scheduleRetryAttempt(fallbackPrompt ?? null, Math.max(CLICK_COOLDOWN_MS, 1200), "watchdog", {
                overrideGuard: true,
            });
        }, STALLED_RETRY_THRESHOLD_MS);

        return () => window.clearTimeout(timer);
    }, [isSessionActive, lastAttemptTime, pendingRetryAt, forceReload, endSession, capturePromptFromSite, lastPromptValue, scheduleRetryAttempt, addLogEntry]);

    const handleSuccess = useCallback(
        (source: "storage" | "ui" = "storage") => {
            successValidationRequestedRef.current = null;
            pendingModerationRetryRef.current = false;

            const newVideoCount = videosGenerated + 1;
            console.log("[Grok Retry] Success confirmed", {
                source,
                videosGenerated: newVideoCount,
                videoGoal,
            });
            addLogEntry(`Success confirmed via ${source}`, "success");
            incrementVideosGenerated();
            recordPromptOutcome("success");

            if (forceReload) {
                setTimeout(() => {
                    if (typeof forceReload === "function") {
                        forceReload();
                    }
                }, 0);
            }

            if (nextVideoTimeoutRef.current) {
                clearTimeout(nextVideoTimeoutRef.current);
                nextVideoTimeoutRef.current = null;
            }

            if (!isSessionActive) {
                return;
            }

            if (newVideoCount >= videoGoal) {
                endSession("success");
                return;
            }

            addLogEntry(`Generating next video (${newVideoCount + 1}/${videoGoal}) in ${generationDelayMs / 1000}s`, "info");
            nextVideoTimeoutRef.current = setTimeout(() => {
                const isSessionActive = isSessionActiveRef.current;
                const lastAttemptTime = lastAttemptTimeRef.current;
                const retryPrompt = sessionPromptRef.current ?? capturePromptFromSite() ?? lastPromptValue;
                const timerContext = `next-video:${newVideoCount + 1}`;

                console.log("[Grok Retry] Next video timer fired", {
                    context: timerContext,
                    hasPersistedPrompt: !!retryPrompt,
                    lastAttemptTime,
                });
                addLogEntry(`Next video timer fired (${timerContext})`, "info");
                nextVideoTimeoutRef.current = null;

                if (!isSessionActive) {
                    console.log("[Grok Retry] Next video timer aborted - session inactive", { context: timerContext });
                    addLogEntry(`Next video timer aborted - session inactive (${timerContext})`, "warn");
                    return;
                }

                const clicked = clickMakeVideoButton(retryPrompt ?? undefined, {
                    overridePermit: true, // Always override for subsequent videos in a session
                });

                if (clicked) {
                    console.log("[Grok Retry] Next video click succeeded", {
                        context: timerContext,
                        hasRetryPrompt: !!retryPrompt,
                    });
                    addLogEntry(`Next video click succeeded (${timerContext})`, "info");
                    if (retryPrompt) {
                        sessionPromptRef.current = retryPrompt;
                    }
                    updateSession({
                        currentAttemptNumber: (retryCount || 0) + 1,
                    });
                    setTimeout(() => {
                        if (isSessionActiveRef.current) {
                            startProgressObserver();
                        }
                    }, 800);
                } else {
                    console.warn("[Grok Retry] Next video click blocked - ending session", {
                        context: timerContext,
                        hasRetryPrompt: !!retryPrompt,
                        lastAttemptTime,
                    });
                    addLogEntry(`Next video click blocked - ending session (${timerContext})`, "error");
                    endSession("failure");
                }
            }, generationDelayMs);
        },
        [
            clickMakeVideoButton,
            endSession,
            forceReload,
            generationDelayMs,
            incrementVideosGenerated,
            isSessionActive,
            lastPromptValue,
            recordPromptOutcome,
            startProgressObserver,
            videoGoal,
            videosGenerated,
        ]
    );

    const requestSuccessValidation = useCallback(() => {
        if (!isSessionActive) {
            console.log("[Grok Retry] Ignoring success validation request - session not active");
            addLogEntry(`Ignoring success validation (session not active)`, "info");
            return;
        }

        if (successValidationRequestedRef.current === "ui") {
            console.log("[Grok Retry] Success validation already pending");
            addLogEntry(`Ignoring success validation (already pending)`, "info");
            return;
        }

        successValidationRequestedRef.current = "ui";
        console.log("[Grok Retry] Success detected via UI - requesting Grok storage validation");
        addLogEntry(`Success detected via UI - validating with storage`, "info");

        if (typeof forceReload === "function") {
            setTimeout(() => {
                if (successValidationRequestedRef.current !== "ui") {
                    return;
                }
                console.log("[Grok Retry] Triggering storage reload for success validation");
                forceReload();
            }, 0);
        }
    }, [forceReload, isSessionActive, addLogEntry]);

    useGrokRetrySuccessDetector({
        onStorageSuccess: () => handleSuccess("storage"),
        onUISuccessSignal: requestSuccessValidation,
        addLogEntry,
        enabled: Boolean(postId),
    });

    useEffect(() => {
        const handler: ProgressTerminalHandler = (event) => {
            console.log("[Grok Retry] Progress observer terminal event", event);
            addLogEntry(`Progress observer terminal event: ${event.text ?? 'No text'}`, "info");

            // Add delays to let DOM/storage stabilize before validation
            // This prevents race conditions where both validations fire before Grok updates
            setTimeout(() => {
                requestModerationValidation("ui");
            }, 500);

            setTimeout(() => {
                requestSuccessValidation();
            }, 600);
        };

        setProgressTerminalHandler(handler);
        return () => setProgressTerminalHandler(null);
    }, [requestModerationValidation, requestSuccessValidation, setProgressTerminalHandler, addLogEntry]);

    return {
        nextVideoTimeoutRef,
        pendingModerationRetryRef,
        sessionPromptRef,
        scheduleRetryAttempt,
        rateLimitDetected,
    };
};
