import { useEffect, useRef } from 'react';
import type { SessionOutcome } from './useGrokRetryVideoSessions';

/**
 * Updates browser tab title to reflect retry session progress.
 * 
 * Dynamically updates page title with:
 * - Current retry count (e.g., "(3/5) Original Title")
 * - Video progress when videoGoal > 1 (e.g., "[2/5 videos] Original Title")
 * - Rate limit warnings (e.g., "⏸ [Rate Limited] Original Title")
 * - Session outcome after completion (e.g., "✓ [Complete] Original Title")
 * 
 * Provides visual feedback in browser tabs, especially useful when
 * running sessions in background tabs.
 * 
 * @param originalTitle - Base page title to restore/prefix
 * @param retryCount - Current retry attempt number
 * @param maxRetries - Maximum retry limit
 * @param autoRetryEnabled - Whether auto-retry is active
 * @param isRateLimited - Whether rate limit is active
 * @param videoGoal - Target number of videos to generate
 * @param videosGenerated - Number of videos completed
 * @param isSessionActive - Whether a session is currently running
 * @param lastSessionOutcome - Outcome of most recent session
 * 
 * @example
 * ```tsx
 * useGrokRetryPageTitle(
 *   'Grok Imagine',
 *   retryCount,
 *   maxRetries,
 *   autoRetryEnabled,
 *   false,
 *   videoGoal,
 *   videosGenerated,
 *   isSessionActive,
 *   lastSessionOutcome
 * );
 * ```
 */
export const useGrokRetryPageTitle = (
    originalTitle: string,
    retryCount: number,
    maxRetries: number,
    autoRetryEnabled: boolean,
    isRateLimited: boolean = false,
    videoGoal: number = 1,
    videosGenerated: number = 0,
    isSessionActive: boolean = false,
    lastSessionOutcome: SessionOutcome = 'idle'
) => {
    const lastStatusRef = useRef<string | null>(null);
    const lastProgressRef = useRef<{ videosGenerated: number; videoGoal: number }>({ videosGenerated: 0, videoGoal: 1 });
    const lastRetryRef = useRef<number>(0);

    useEffect(() => {
        const safeMaxRetries = Math.max(1, maxRetries ?? 1);
        const safeRetryCount = Math.max(0, retryCount ?? 0);
        const safeVideoGoal = Math.max(1, videoGoal ?? 1);
        const safeVideosGenerated = Math.max(0, videosGenerated ?? 0);

        if (isSessionActive || safeVideosGenerated > 0) {
            lastProgressRef.current = {
                videosGenerated: safeVideosGenerated,
                videoGoal: safeVideoGoal,
            };
        }

        if (isSessionActive) {
            if (safeRetryCount === 0) {
                lastRetryRef.current = 0;
            } else {
                lastRetryRef.current = Math.max(lastRetryRef.current, safeRetryCount);
            }
        }

        const resetToOriginal = () => {
            lastStatusRef.current = null;
            document.title = originalTitle;
        };

        if (!autoRetryEnabled) {
            resetToOriginal();
            return;
        }

        let nextTitle: string | null = null;

        if (!isSessionActive) {
            if (lastSessionOutcome === 'success') {
                const progress = lastProgressRef.current;
                const goalForDisplay = Math.max(progress.videoGoal, safeVideoGoal);
                const videosForDisplay = Math.max(progress.videosGenerated, safeVideosGenerated);
                const numerator = Math.max(1, Math.min(goalForDisplay, videosForDisplay || goalForDisplay));
                nextTitle = `✅ ${numerator}/${goalForDisplay} Complete - ${originalTitle}`;
                lastRetryRef.current = 0;
            } else if (lastSessionOutcome === 'failure') {
                const progress = lastProgressRef.current;
                const goalForDisplay = Math.max(progress.videoGoal, safeVideoGoal);
                if (goalForDisplay > 1) {
                    const videosForDisplay = Math.max(progress.videosGenerated, safeVideosGenerated);
                    const numerator = Math.min(goalForDisplay, videosForDisplay);
                    nextTitle = `❌🎬 ${numerator}/${goalForDisplay} - ${originalTitle}`;
                } else {
                    nextTitle = `❌ ${originalTitle}`;
                }
            } else if (lastSessionOutcome === 'cancelled') {
                nextTitle = `⏹ Cancelled - ${originalTitle}`;
                lastRetryRef.current = 0;
            }
        }

        if (nextTitle) {
            document.title = nextTitle;
            lastStatusRef.current = nextTitle;
            return;
        }

        if (isSessionActive) {
            if (safeVideoGoal > 1 && safeVideosGenerated >= safeVideoGoal) {
                nextTitle = `✅ ${safeVideosGenerated}/${safeVideoGoal} Complete - ${originalTitle}`;
                lastRetryRef.current = 0;
            } else if (isRateLimited) {
                nextTitle = `⏳ Rate Limited - ${originalTitle}`;
            } else if (safeRetryCount >= safeMaxRetries) {
                nextTitle = `🔄 ${safeRetryCount}/${safeMaxRetries} ${originalTitle}`;
            } else if (safeVideoGoal > 1 && (safeVideosGenerated > 0 || lastProgressRef.current.videosGenerated > 0)) {
                const displayVideos = safeVideosGenerated > 0 ? safeVideosGenerated : lastProgressRef.current.videosGenerated;
                nextTitle = `🎬 ${displayVideos}/${safeVideoGoal} | 🔄 ${safeRetryCount}/${safeMaxRetries} ${originalTitle}`;
            } else {
                nextTitle = `🔄 ${safeRetryCount}/${safeMaxRetries} ${originalTitle}`;
            }
        } else {
            const progress = lastProgressRef.current;
            const goalForDisplay = Math.max(progress.videoGoal, safeVideoGoal);
            const videosForDisplay = Math.min(progress.videosGenerated, goalForDisplay);

            const completed = videosForDisplay >= goalForDisplay;

            if (goalForDisplay >= 1 && completed) {
                nextTitle = `✅ ${videosForDisplay}/${goalForDisplay} Complete - ${originalTitle}`;
                lastRetryRef.current = 0;
            } else if (isRateLimited) {
                nextTitle = `⏳ Rate Limited - ${originalTitle}`;
            } else if (lastRetryRef.current >= safeMaxRetries) {
                if (goalForDisplay > 1) {
                    nextTitle = `❌🎬 ${videosForDisplay}/${goalForDisplay} - ${originalTitle}`;
                } else {
                    nextTitle = `❌ ${originalTitle}`;
                }
            } else if (goalForDisplay > 1 && (videosForDisplay > 0 || lastRetryRef.current >= safeMaxRetries)) {
                nextTitle = `🎬 ${videosForDisplay}/${goalForDisplay} - ${originalTitle}`;
            }
        }

        if (nextTitle) {
            document.title = nextTitle;
            lastStatusRef.current = nextTitle;
            return;
        }

        if (lastStatusRef.current) {
            document.title = lastStatusRef.current;
            return;
        }

        resetToOriginal();
    }, [
        originalTitle,
        retryCount,
        maxRetries,
        autoRetryEnabled,
        isRateLimited,
        videoGoal,
        videosGenerated,
        isSessionActive,
        lastSessionOutcome,
    ]);
};
