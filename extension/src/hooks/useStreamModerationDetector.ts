import { useEffect, useRef, useCallback } from 'react';
import { useGrokStreamSelector, type VideoAttemptState } from '../lib/grokStream';

interface StreamModerationDetectorOptions {
    parentPostId: string | null | undefined;
    onModerationDetected: () => void;
    enabled: boolean;
}

/**
 * Stream-based moderation detector that monitors network events instead of UI
 * This is more reliable than DOM-based detection because:
 * 1. It catches moderation immediately when the stream reports it
 * 2. It works even if the UI hasn't updated yet
 * 3. It's not affected by UI rendering delays or race conditions
 */
export const useStreamModerationDetector = ({
    parentPostId,
    onModerationDetected,
    enabled,
}: StreamModerationDetectorOptions) => {
    const lastProcessedAttemptRef = useRef<string | null>(null);
    const processingRef = useRef<boolean>(false);

    // Select the latest attempt for this parent from the stream
    const latestAttempt = useGrokStreamSelector((state) => {
        if (!parentPostId) {
            return undefined;
        }
        const parent = state.parents[parentPostId];
        if (!parent || parent.attempts.length === 0) {
            return undefined;
        }
        // Get the most recent attempt
        const latestAttemptId = parent.attempts[parent.attempts.length - 1];
        return state.videos[latestAttemptId];
    });

    const handleModeration = useCallback(
        (attempt: VideoAttemptState) => {
            if (!enabled) {
                return;
            }

            // Prevent duplicate processing
            if (processingRef.current) {
                return;
            }

            const attemptId = attempt.videoPostId ?? attempt.videoId;
            if (!attemptId) {
                return;
            }

            // Only process each attempt once
            if (lastProcessedAttemptRef.current === attemptId) {
                return;
            }

            // Check if this attempt is moderated
            if (attempt.status === 'moderated' || attempt.moderated) {
                processingRef.current = true;
                lastProcessedAttemptRef.current = attemptId;

                console.log('[Grok Retry] Stream moderation detected:', {
                    videoId: attempt.videoId,
                    videoPostId: attempt.videoPostId,
                    progress: attempt.progress,
                    moderated: attempt.moderated,
                    status: attempt.status,
                });

                try {
                    (window as any).__grok_append_log?.(
                        `Moderation detected (stream): ${attempt.progress}% progress`,
                        'warn'
                    );
                } catch {
                    // ignore log transport issues
                }

                // Call the moderation callback
                onModerationDetected();

                // Allow processing again after a brief delay
                setTimeout(() => {
                    processingRef.current = false;
                }, 500);
            }
        },
        [enabled, onModerationDetected]
    );

    // Monitor the latest attempt for moderation
    useEffect(() => {
        if (!latestAttempt) {
            return;
        }
        handleModeration(latestAttempt);
    }, [latestAttempt, handleModeration]);

    // Reset when parent changes
    useEffect(() => {
        lastProcessedAttemptRef.current = null;
        processingRef.current = false;
    }, [parentPostId]);

    return {
        lastProcessedAttempt: lastProcessedAttemptRef.current,
        latestAttempt,
    };
};
