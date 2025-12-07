import { useEffect, useState, useCallback, useRef } from 'react';
import { selectors, isSuccessStateGenerateButton, getButtonSelectors } from '../config/selectors';
import { usePostId } from './usePostId';
import { useGlobalSettings } from './useGlobalSettings';

const VIDEO_SELECTOR = selectors.success.legacyVideo;

export const useSuccessDetector = (onSuccess: () => void, isEnabled: boolean) => {
    const postId = usePostId();
    const { settings } = useGlobalSettings();
    const [lastVideoSrc, setLastVideoSrc] = useState<string | null>(null);
    const lastSuccessAtRef = useRef<number>(0);

    // Use custom selector if provided, otherwise try all default multi-language selectors
    const buttonSelectors = getButtonSelectors(settings.customSelectors?.makeVideoButton);

    const checkVideoSuccess = useCallback(() => {
        if (!isEnabled) return;
        const attempts = (window as any).__grok_attempts as Record<string, number> | undefined;
        const lastAttempt = attempts && postId ? attempts[postId] : undefined;
        // Only evaluate success if a retry attempt for this post occurred recently
        if (!lastAttempt || Date.now() - lastAttempt > 5 * 60 * 1000) {
            return;
        }

        // Condition A: generate button in success state (icon-only or 'Redo'/'Rehacer')
        // Try to find the button using any of the supported selectors
        let genBtn: HTMLButtonElement | null = null;
        for (const selector of buttonSelectors) {
            genBtn = document.querySelector<HTMLButtonElement>(selector);
            if (genBtn) break;
        }
        const buttonInSuccessState = isSuccessStateGenerateButton(genBtn);

        // Condition B: video src changed since baseline
        const video = document.querySelector<HTMLVideoElement>(VIDEO_SELECTOR);
        let videoChanged = false;
        if (video && video.src) {
            if (lastVideoSrc === null) {
                // establish baseline on first observation
                setLastVideoSrc(video.src);
            } else if (video.src !== lastVideoSrc && video.src !== '') {
                videoChanged = true;
            }
            // keep latest for next comparison
            if (lastVideoSrc !== video.src) {
                setLastVideoSrc(video.src);
            }
        }

        // Check for visible "Next video" button - if visible, video src changes are from manual navigation
        const nextVideoButton = document.querySelector('button[aria-label="Next video"]');
        const isNextVideoButtonVisible = nextVideoButton && !nextVideoButton.classList.contains('invisible');

        // If next video button is visible, ignore video src changes (user is browsing previous videos)
        const validVideoChange = videoChanged && !isNextVideoButtonVisible;

        // Require both conditions to declare success
        if (buttonInSuccessState && validVideoChange) {
            const now = Date.now();
            if (now - lastSuccessAtRef.current >= 300) {
                lastSuccessAtRef.current = now;
                console.log('[Grok Retry] Success detected — success button state + video src change');
                try { (window as any).__grok_append_log?.('Success detected (button+video)', 'success'); } catch { }
                onSuccess();
                return;
            }
        }

        // Log when next video button prevents false positive
        if (buttonInSuccessState && videoChanged && isNextVideoButtonVisible) {
            console.log('[Grok Retry] Success detection blocked - next video button visible (user browsing previous videos)');
        }
    }, [lastVideoSrc, isEnabled, onSuccess, postId, buttonSelectors]);

    useEffect(() => {
        if (!isEnabled) return;

        // Initial check
        checkVideoSuccess();

        // Watch for changes to the video element
        const observer = new MutationObserver(() => {
            checkVideoSuccess();
        });

        const video = document.querySelector(VIDEO_SELECTOR);
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
            const video = document.querySelector(VIDEO_SELECTOR);
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
