import { useEffect, useMemo, useRef } from 'react';
import { usePostId } from './usePostId';
import { useLatestAttemptForParent } from '../lib/grokStream';

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

    useEffect(() => {
        lastCompletedAttemptIdRef.current = null;
    }, [parentPostId]);
};
