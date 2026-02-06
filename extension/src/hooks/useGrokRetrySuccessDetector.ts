import { useEffect, useRef } from 'react';
import { useGrokRetryPostId } from './useGrokRetryPostId';
import { useGrokRetryGrokStorage } from './useGrokRetryGrokStorage';
import type { GrokVideo } from './useGrokRetryGrokStorage';

/**
 * Detects successful video generation via dual detection strategy.
 * 
 * Uses two complementary detection methods:
 * 1. **Grok storage monitoring** (primary, authoritative)
 *    - Watches sessionStorage['useMediaStore'] for new video entries
 *    - Only triggers on non-moderated videos with valid mediaUrl
 *    - Most reliable indicator of completion
 * 
 * 2. **DOM observation** (fallback, visual confirmation)
 *    - Watches for video elements with valid sources
 *    - Provides redundancy if storage detection fails
 *    - Confirms video is actually visible in DOM
 * 
 * Includes deduplication to prevent double-triggering when both methods
 * detect the same success event.
 * 
 * @param onSuccess - Callback function to execute when success is detected
 * @param isEnabled - Whether detection is currently active
 * 
 * @example
 * ```tsx
 * useGrokRetrySuccessDetector({
 *   onStorageSuccess: (video) => {
 *     incrementVideosGenerated();
 *     if (videosGenerated >= videoGoal) endSession('success');
 *   },
 *   onUISuccessSignal: () => forceReload(),
 *   enabled: isSessionActive,
 * });
 * ```
 */
interface SuccessDetectorOptions {
    onStorageSuccess: (video: GrokVideo) => void;
    onUISuccessSignal?: () => void;
    addLogEntry: (message: string, level?: 'info' | 'warn' | 'error' | 'success') => void;
    enabled: boolean;
}

export const useGrokRetrySuccessDetector = ({
    onStorageSuccess,
    onUISuccessSignal,
    addLogEntry,
    enabled,
}: SuccessDetectorOptions) => {
    const { postId, mediaId } = useGrokRetryPostId();
    const parentPostId = mediaId ?? postId;
    const lastCompletedAttemptIdRef = useRef<string | null>(null);
    const domCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Grok storage-based success detection (primary, authoritative)
    useGrokRetryGrokStorage(parentPostId, {
        onVideoDetected: (video) => {
            if (!enabled) return;

            // Only trigger on successful videos (not moderated, has mediaUrl)
            if (!video.moderated && video.mediaUrl) {
                const videoId = video.videoId;
                if (lastCompletedAttemptIdRef.current === videoId) {
                    return; // Already detected
                }
                lastCompletedAttemptIdRef.current = videoId;
                console.log(`[Grok Retry] Success detected via Grok storage for ${videoId}`);
                addLogEntry(`Success detected (Grok storage for ${videoId})`, 'success');
                onStorageSuccess(video);
            }
        },
        pollInterval: 500, // Check every 500ms for success
        debug: false
    });

    // DOM-based success detection (fallback)
    useEffect(() => {
        if (!enabled) {
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
                    const domAttemptKey = `dom:${currentPostId}`;
                    if (lastCompletedAttemptIdRef.current === domAttemptKey) {
                        return; // Already detected
                    }
                    lastCompletedAttemptIdRef.current = domAttemptKey;
                    console.log(`[Grok Retry] Success detected via DOM for ${currentPostId}`);
                    addLogEntry(`Success detected (DOM for ${currentPostId})`, 'success');
                    onUISuccessSignal?.();
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
    }, [enabled, postId, onUISuccessSignal]);

    // Clear last completed when post changes
    useEffect(() => {
        lastCompletedAttemptIdRef.current = null;
    }, [parentPostId]);
};
