import { useEffect, useState, useCallback, useRef } from 'react';
import { selectors, isSuccessStateGenerateButton } from '../config/selectors';
import { usePostId } from './usePostId';

/**
 * Detects successful video generation using multiple signals:
 * 
 * 1. Route change detection - When Grok navigates from one post to another during an active session
 * 2. Button state + video src change - Traditional detection (works for first video)
 * 3. Button state + history count increase - For 2nd+ videos (sidebar only appears after first video)
 * 
 * Note: The video history sidebar only appears after the first video is generated,
 * so history-based detection only works for subsequent videos in a session.
 */
export const useSuccessDetector = (onSuccess: () => void, isEnabled: boolean) => {
    const postId = usePostId();
    const [lastVideoSrc, setLastVideoSrc] = useState<string | null>(null);
    const lastSuccessAtRef = useRef<number>(0);

    const checkVideoSuccess = useCallback(() => {
        if (!isEnabled) return;
        const w = window as any;
        const attempts = w.__grok_attempts as Record<string, number> | undefined;
        const lastAttempt = attempts && postId ? attempts[postId] : undefined;
        // Only evaluate success if a retry attempt for this post occurred recently
        if (!lastAttempt || Date.now() - lastAttempt > 5 * 60 * 1000) {
            return;
        }

        // Track video src changes (must happen before debounce check to maintain baseline)
        const video = document.querySelector<HTMLVideoElement>(selectors.success.legacyVideo);
        let videoChanged = false;
        if (video && video.src) {
            if (lastVideoSrc === null) {
                // establish baseline on first observation
                setLastVideoSrc(video.src);
            } else if (video.src !== lastVideoSrc && video.src !== '') {
                videoChanged = true;
            }
            // keep latest for next comparison (always update to stay in sync)
            if (lastVideoSrc !== video.src) {
                setLastVideoSrc(video.src);
            }
        }

        // Guard: Prevent duplicate detections using both attempt tracking and time-based debounce
        const now = Date.now();

        // Time-based debounce: prevent rapid fire within 300ms (catches concurrent observer calls)
        if (now - lastSuccessAtRef.current < 300) {
            return;
        }

        // Attempt-based guard: Check if we already detected success for this specific attempt
        if (!w.__grok_last_success_attempt) w.__grok_last_success_attempt = {};
        const lastSuccessForAttempt = w.__grok_last_success_attempt as Record<string, number>;

        // Check if already marked - if so, block
        if (postId && lastSuccessForAttempt[postId] === lastAttempt) {
            // Already detected success for this attempt, skip
            return;
        }

        // NEW: Check if route changed during active session (strong success signal)
        // First, detect if we're on a different route than our session post
        const sessionPostId = w.__grok_session_post_id as string | undefined;
        const currentUrlPostId = window.location.pathname.match(/^\/imagine\/post\/([a-f0-9-]+)/)?.[1];

        // If we're on a different post than our session and no route change is recorded yet, record it now
        if (sessionPostId && currentUrlPostId && currentUrlPostId !== sessionPostId && !w.__grok_route_changed) {
            w.__grok_route_changed = { from: sessionPostId, to: currentUrlPostId, at: Date.now() };
            console.log(`[Grok Retry] Route change detected: ${sessionPostId} -> ${currentUrlPostId}`);
        }

        const routeChange = w.__grok_route_changed;
        if (routeChange && routeChange.from === postId && Date.now() - routeChange.at < 10000) {
            // Route changed from our session post to a new post - this indicates success
            lastSuccessAtRef.current = now; // Set the debounce ref
            // Mark this attempt to prevent duplicate callbacks
            if (postId && lastAttempt) lastSuccessForAttempt[postId] = lastAttempt;
            console.log(`[Grok Retry] Success detected — route changed: ${routeChange.from} -> ${routeChange.to}`);
            try { w.__grok_append_log?.('Success detected (route change)', 'success'); } catch { }
            // Clear the route change flag
            delete w.__grok_route_changed;
            onSuccess();
            return;
        }

        // NEW: Check for video history sidebar as an additional success signal
        // Note: Sidebar only appears after the first video is generated
        // During generation, progress placeholders may appear but should not be counted
        // Only count completed videos with actual image thumbnails
        const historyThumbnails = document.querySelectorAll(selectors.success.videoHistorySidebar);
        const historyCount = historyThumbnails.length;

        // Condition A: generate button in success state (icon-only or 'Redo')
        const genBtn = document.querySelector<HTMLButtonElement>(selectors.success.iconOnlyGenerateButton);
        const buttonInSuccessState = isSuccessStateGenerateButton(genBtn);

        // Store baseline history count (only when sidebar exists with completed videos)
        const baselineCount = w.__grok_video_history_count as number | undefined;
        if (baselineCount === undefined && historyCount > 0) {
            w.__grok_video_history_count = historyCount;
            console.log(`[Grok Retry] Video history baseline set: ${historyCount} completed videos`);
        }

        // If history count increased, a new video was completed
        // This only works for 2nd+ videos since sidebar doesn't exist initially
        // Must check that we're not in the middle of generation (button state confirms completion)
        const historyCountIncreased = baselineCount !== undefined &&
            historyCount > baselineCount &&
            historyCount > 0 &&
            buttonInSuccessState; // Only count increase if generation is complete
        if (historyCountIncreased) {
            w.__grok_video_history_count = historyCount;
            console.log(`[Grok Retry] Video history count increased: ${baselineCount} → ${historyCount} (generation complete)`);
        }

        // Check for visible "Next video" button - if visible, video src changes are from manual navigation
        const nextVideoButton = document.querySelector('button[aria-label="Next video"]');
        const isNextVideoButtonVisible = nextVideoButton && !nextVideoButton.classList.contains('invisible');

        // If next video button is visible, ignore video src changes (user is browsing previous videos)
        const validVideoChange = videoChanged && !isNextVideoButtonVisible;

        // NEW: Enhanced success detection with multiple conditions
        // For first video: rely on button state + video src change (sidebar doesn't exist yet)
        // For 2nd+ videos: can also use history count increase as additional signal
        const hasVideoEvidence = validVideoChange || historyCountIncreased;

        if (buttonInSuccessState && hasVideoEvidence) {
            lastSuccessAtRef.current = now; // Set the debounce ref
            // Mark this attempt to prevent duplicate callbacks
            if (postId && lastAttempt) lastSuccessForAttempt[postId] = lastAttempt;
            const evidence = [];
            if (validVideoChange) evidence.push('video src change');
            if (historyCountIncreased) evidence.push('history count increased');
            const detectionMethod = evidence.length > 0 ? `button + ${evidence.join(' + ')}` : 'button state';
            console.log(`[Grok Retry] Success detected — ${detectionMethod}`);
            try { w.__grok_append_log?.(`Success detected (${detectionMethod})`, 'success'); } catch { }
            onSuccess();
            return;
        }

        // Log when next video button prevents false positive
        if (buttonInSuccessState && videoChanged && isNextVideoButtonVisible) {
            console.log('[Grok Retry] Success detection blocked - next video button visible (user browsing previous videos)');
        }
    }, [lastVideoSrc, isEnabled, onSuccess, postId]);

    useEffect(() => {
        if (!isEnabled) return;

        // Initial check
        checkVideoSuccess();

        // Watch for changes to the video element
        const observer = new MutationObserver(() => {
            checkVideoSuccess();
        });

        const video = document.querySelector(selectors.success.legacyVideo);
        if (video) {
            observer.observe(video, {
                attributes: true,
                attributeFilter: ['src'],
            });
        }

        // Also watch for the video element being added to DOM
        const bodyObserver = new MutationObserver(() => {
            const img = document.querySelector(selectors.success.imageTag);
            if (img) {
                checkVideoSuccess();
                return;
            }
            const video = document.querySelector(selectors.success.legacyVideo);
            if (video && !observer.takeRecords().length) {
                observer.observe(video, {
                    attributes: true,
                    attributeFilter: ['src'],
                });
                checkVideoSuccess();
            }
        });

        const target = document.querySelector(selectors.containers.main) || document.body;
        bodyObserver.observe(target, {
            childList: true,
            subtree: true,
        });

        return () => {
            observer.disconnect();
            bodyObserver.disconnect();
        };
    }, [isEnabled, checkVideoSuccess]);
};
