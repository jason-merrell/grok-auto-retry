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
    const domCheckIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    // DOM-based success detection (fallback)
    useEffect(() => {
        if (!isEnabled) {
            if (domCheckIntervalRef.current) {
                clearInterval(domCheckIntervalRef.current);
                domCheckIntervalRef.current = null;
            }
            return;
        }

        const checkForSuccess = () => {
            try {
                const article = document.querySelector('article');
                if (!article) {
                    return;
                }

                // Check for video element with src
                const videoElement = article.querySelector('video[src]');
                const hasVideo = !!videoElement;

                // Check for moderation images
                const moderationImages = article.querySelectorAll('img[alt="Moderated"]');
                const hasModeration = moderationImages.length > 0;

                // Check for loading state
                const loadingImages = article.querySelectorAll('img[alt="Loading"]');
                const isLoading = loadingImages.length > 0;

                // Success = video exists AND no moderation AND not loading
                if (hasVideo && !hasModeration && !isLoading) {
                    const currentPostId = postId ?? 'unknown';
                    if (lastCompletedAttemptIdRef.current === currentPostId) {
                        return; // Already detected
                    }
                    lastCompletedAttemptIdRef.current = currentPostId;
                    console.log(`[Grok Retry] Success detected via DOM for ${currentPostId}`);
                    try {
                        (window as any).__grok_append_log?.('Success detected (DOM)', 'success');
                    } catch {
                        // ignore log transport issues
                    }
                    onSuccess();
                }
            } catch (error) {
                console.warn('[Grok Retry] DOM success check error:', error);
            }
        };

        // Check immediately
        checkForSuccess();

        // Then poll every second
        domCheckIntervalRef.current = setInterval(checkForSuccess, 1000);

        return () => {
            if (domCheckIntervalRef.current) {
                clearInterval(domCheckIntervalRef.current);
                domCheckIntervalRef.current = null;
            }
        };
    }, [isEnabled, postId, onSuccess]);

    useEffect(() => {
        lastCompletedAttemptIdRef.current = null;
    }, [parentPostId]);
};
