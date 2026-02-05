import { useEffect, useRef, useCallback } from 'react';
import { useGrokStreamSelector, type VideoAttemptState } from '../lib/grokStream';

export interface AttemptLifecycleEvent {
    type: 'started' | 'progress' | 'completed' | 'moderated';
    attempt: VideoAttemptState;
    timestamp: number;
}

interface StreamAttemptTrackerOptions {
    parentPostId: string | null | undefined;
    onAttemptStarted?: (attempt: VideoAttemptState) => void;
    onAttemptProgress?: (attempt: VideoAttemptState, previousProgress: number) => void;
    onAttemptCompleted?: (attempt: VideoAttemptState) => void;
    onAttemptModerated?: (attempt: VideoAttemptState) => void;
    enabled: boolean;
}

interface AttemptTracker {
    attemptId: string;
    status: 'pending' | 'running' | 'completed' | 'moderated';
    lastProgress: number;
    firstSeenAt: number;
    lastUpdateAt: number;
}

/**
 * Stream-based attempt tracker that monitors the full lifecycle of video generation attempts
 * This hook tracks:
 * - When an attempt starts (progress > 0)
 * - Progress updates throughout generation
 * - Completion (progress = 100 && !moderated)
 * - Moderation (moderated = true at any point)
 */
export const useStreamAttemptTracker = ({
    parentPostId,
    onAttemptStarted,
    onAttemptProgress,
    onAttemptCompleted,
    onAttemptModerated,
    enabled,
}: StreamAttemptTrackerOptions) => {
    const trackedAttemptsRef = useRef<Map<string, AttemptTracker>>(new Map());
    const processingRef = useRef<boolean>(false);

    // Select all attempts for this parent
    const attempts = useGrokStreamSelector((state) => {
        if (!parentPostId) {
            return [];
        }
        const parent = state.parents[parentPostId];
        if (!parent || parent.attempts.length === 0) {
            return [];
        }
        // Return all video attempts for this parent
        return parent.attempts
            .map((attemptId) => state.videos[attemptId])
            .filter((attempt): attempt is VideoAttemptState => attempt !== undefined);
    });

    const lastEventVersion = useGrokStreamSelector((state) => state.version);

    const processAttempt = useCallback(
        (attempt: VideoAttemptState) => {
            if (!enabled) {
                return;
            }

            const attemptId = attempt.videoPostId ?? attempt.videoId;
            if (!attemptId) {
                return;
            }

            const now = Date.now();
            const tracked = trackedAttemptsRef.current.get(attemptId);

            // First time seeing this attempt
            if (!tracked) {
                const newTracker: AttemptTracker = {
                    attemptId,
                    status: attempt.status,
                    lastProgress: attempt.progress,
                    firstSeenAt: now,
                    lastUpdateAt: now,
                };
                trackedAttemptsRef.current.set(attemptId, newTracker);

                // If attempt already started, fire the started event
                if (attempt.progress > 0 || attempt.status !== 'pending') {
                    console.log('[Grok Retry] Stream attempt started:', {
                        attemptId,
                        progress: attempt.progress,
                        status: attempt.status,
                    });
                    onAttemptStarted?.(attempt);
                }
                return;
            }

            // Track state transitions
            const statusChanged = tracked.status !== attempt.status;
            const progressChanged = tracked.lastProgress !== attempt.progress;

            // Update tracked state
            tracked.status = attempt.status;
            tracked.lastProgress = attempt.progress;
            tracked.lastUpdateAt = now;

            // Handle started transition (pending -> running or pending -> progress > 0)
            if (tracked.status === 'pending' && attempt.progress > 0) {
                console.log('[Grok Retry] Stream attempt started (progress):', {
                    attemptId,
                    progress: attempt.progress,
                });
                onAttemptStarted?.(attempt);
            }

            // Handle progress updates
            if (progressChanged && attempt.status === 'running') {
                console.log('[Grok Retry] Stream attempt progress:', {
                    attemptId,
                    progress: attempt.progress,
                    previousProgress: tracked.lastProgress,
                });
                onAttemptProgress?.(attempt, tracked.lastProgress);
            }

            // Handle completion
            if (statusChanged && attempt.status === 'completed') {
                console.log('[Grok Retry] Stream attempt completed:', {
                    attemptId,
                    progress: attempt.progress,
                });
                onAttemptCompleted?.(attempt);
            }

            // Handle moderation
            if (statusChanged && attempt.status === 'moderated') {
                console.log('[Grok Retry] Stream attempt moderated:', {
                    attemptId,
                    progress: attempt.progress,
                    moderated: attempt.moderated,
                });
                onAttemptModerated?.(attempt);
            }
        },
        [enabled, onAttemptStarted, onAttemptProgress, onAttemptCompleted, onAttemptModerated]
    );

    // Process all attempts when stream updates
    useEffect(() => {
        if (!enabled || processingRef.current) {
            return;
        }

        processingRef.current = true;
        try {
            for (const attempt of attempts) {
                processAttempt(attempt);
            }
        } finally {
            processingRef.current = false;
        }
    }, [attempts, lastEventVersion, enabled, processAttempt]);

    // Clear tracked attempts when parent changes
    useEffect(() => {
        trackedAttemptsRef.current.clear();
    }, [parentPostId]);

    return {
        trackedAttempts: Array.from(trackedAttemptsRef.current.values()),
        currentAttempts: attempts,
    };
};
