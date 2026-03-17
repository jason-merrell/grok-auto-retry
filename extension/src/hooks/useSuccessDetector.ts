import { useEffect, useMemo, useRef } from 'react';
import { usePostId } from './usePostId';
import { useLatestAttemptForParent, subscribeGrokStream, getGrokStreamSnapshot } from '../lib/grokStream';

export const useSuccessDetector = (onSuccess: () => void, isEnabled: boolean) => {
    const { postId, mediaId } = usePostId();
    const parentPostId = useMemo(() => {
        if (typeof window === 'undefined') {
            return mediaId ?? postId ?? null;
        }
        const w = window as any;
        const sessionKey = w.__grok_session_media_id ?? w.__grok_test?.__retrySessionKey ?? w.__grok_session_post_id ?? null;
        return sessionKey ?? mediaId ?? postId ?? null;
    }, [mediaId, postId]);
    const latestAttempt = useLatestAttemptForParent(parentPostId);

    const lastCompletedAttemptIdRef = useRef<string | null>(null);

    // Stream-based success detection (original method)
    useEffect(() => {
        if (!isEnabled) {
            return;
        }
        if (!latestAttempt || latestAttempt.status !== 'completed') {
            return;
        }
        const attemptId = latestAttempt.videoPostId ?? latestAttempt.videoId;
        if (!attemptId) {
            return;
        }
        if (lastCompletedAttemptIdRef.current === attemptId) {
            return;
        }
        lastCompletedAttemptIdRef.current = attemptId;
        console.log(`[Grok Retry] Success detected via stream for ${attemptId}`);
        try {
            (window as any).__grok_append_log?.('Success detected (stream)', 'success');
        } catch {
            // ignore log transport issues
        }
        onSuccess();
    }, [latestAttempt, isEnabled, onSuccess]);

    // Imperative stream subscription — fires outside React's render cycle so
    // it works even when the browser throttles React updates in background tabs.
    useEffect(() => {
        if (!isEnabled) return;
        const resolveParent = () => {
            if (typeof window === 'undefined') return mediaId ?? postId ?? null;
            const w = window as any;
            return w.__grok_session_media_id ?? w.__grok_test?.__retrySessionKey ?? w.__grok_session_post_id ?? mediaId ?? postId ?? null;
        };
        const unsubscribe = subscribeGrokStream(() => {
            const pid = resolveParent();
            if (!pid) return;
            const snap = getGrokStreamSnapshot();
            const parent = snap.parents[pid];
            if (!parent) return;
            for (let i = parent.attempts.length - 1; i >= 0; i -= 1) {
                const attempt = snap.videos[parent.attempts[i]];
                if (attempt && attempt.status === 'completed') {
                    const attemptId = attempt.videoPostId ?? attempt.videoId;
                    if (!attemptId || lastCompletedAttemptIdRef.current === attemptId) return;
                    lastCompletedAttemptIdRef.current = attemptId;
                    console.log(`[Grok Retry] Success detected via imperative stream for ${attemptId}`);
                    try {
                        (window as any).__grok_append_log?.('Success detected (stream/imperative)', 'success');
                    } catch { /* ignore */ }
                    onSuccess();
                    return;
                }
            }
        });
        return unsubscribe;
    }, [isEnabled, mediaId, postId, onSuccess]);

    useEffect(() => {
        lastCompletedAttemptIdRef.current = null;
    }, [parentPostId]);
};
