import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";

type SessionEndOutcome = "success" | "failure" | "cancelled";

interface UseGrokRetryResumeGuardParams {
    isLoading: boolean;
    isSessionActive: boolean;
    postId: string | null;
    pendingRetryAt: number | null;
    pendingModerationRetryRef: MutableRefObject<boolean>;
    hasCheckedInterruptedSession: MutableRefObject<boolean>;
    endSession: (outcome: SessionEndOutcome) => void;
}

/**
 * Ensures interrupted Grok retry sessions are gracefully cancelled on reload unless an automatic retry is pending.
 */
export const useGrokRetryResumeGuard = ({
    isLoading,
    isSessionActive,
    postId,
    pendingRetryAt,
    pendingModerationRetryRef,
    hasCheckedInterruptedSession,
    endSession,
}: UseGrokRetryResumeGuardParams) => {
    const sessionResumeGuardSnapshotRef = useRef<string | null>(null);

    // Auto-cancel interrupted sessions on mount (after refresh/navigation) - only once
    useEffect(() => {
        if ((window as any).__grok_test?.skipAutoCancel) {
            return;
        }

        const hasPendingRetry = pendingModerationRetryRef.current || !!pendingRetryAt;
        const snapshot = JSON.stringify({
            isLoading,
            hasChecked: hasCheckedInterruptedSession.current,
            isSessionActive,
            postId,
            hasPendingRetry,
            pendingRetryAt,
        });
        if (sessionResumeGuardSnapshotRef.current !== snapshot) {
            sessionResumeGuardSnapshotRef.current = snapshot;
            console.log("[Grok Retry] Session resume guard", {
                isLoading,
                hasChecked: hasCheckedInterruptedSession.current,
                isSessionActive,
                postId,
                hasPendingRetry,
                pendingRetryAt,
            });
        }

        if (hasPendingRetry) {
            console.log("[Grok Retry] Session resume guard - pending retry detected; skipping auto-cancel");
            return;
        }

        if (!isLoading && postId && !hasCheckedInterruptedSession.current) {
            console.log("[Grok Retry] Checking for interrupted session - isSessionActive:", isSessionActive);
            if (isSessionActive) {
                console.log("[Grok Retry] Detected active session after page load - auto-canceling interrupted session");
                hasCheckedInterruptedSession.current = true;
                endSession("cancelled");
            } else {
                setTimeout(() => {
                    if (!isSessionActive) {
                        console.log("[Grok Retry] No active session found after delay, marking as checked");
                        hasCheckedInterruptedSession.current = true;
                    }
                }, 50);
            }
        }
    }, [
        endSession,
        hasCheckedInterruptedSession,
        isLoading,
        isSessionActive,
        pendingModerationRetryRef,
        pendingRetryAt,
        postId,
    ]);

    // Fallback check - re-evaluated when session state changes to catch race conditions
    useEffect(() => {
        if ((window as any).__grok_test?.skipAutoCancel) {
            return;
        }

        if (hasCheckedInterruptedSession.current || !postId || !isSessionActive) {
            return;
        }

        const hasPendingRetry = pendingModerationRetryRef.current || !!pendingRetryAt;
        if (hasPendingRetry) {
            console.log("[Grok Retry] Session resume fallback - pending retry detected; skipping auto-cancel");
            return;
        }

        const timeoutId = setTimeout(() => {
            console.log("[Grok Retry] Session resume fallback", {
                hasChecked: hasCheckedInterruptedSession.current,
                isSessionActive,
                postId,
                pendingRetryAt,
            });
            if (!hasCheckedInterruptedSession.current && isSessionActive && postId) {
                console.log("[Grok Retry] Fallback: Detected active session after delay - auto-canceling");
                hasCheckedInterruptedSession.current = true;
                endSession("cancelled");
            }
        }, 200);

        return () => clearTimeout(timeoutId);
    }, [
        endSession,
        hasCheckedInterruptedSession,
        isSessionActive,
        pendingModerationRetryRef,
        pendingRetryAt,
        postId,
    ]);
};
