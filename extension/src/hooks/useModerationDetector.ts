import { useEffect, useCallback, useState, useRef } from 'react';
import { selectors } from '../config/selectors';

const MODERATION_TEXT = "Content Moderated. Try a different idea.";
const RATE_LIMIT_TEXT = "Rate limit reached";
const RATE_LIMIT_WAIT_TIME = 60000; // 60 seconds
const MODERATION_TRIGGER_COOLDOWN_MS = 5000; // hard guard between callbacks
const MODERATION_HOLD_MS = 2000; // keep detected state for stability

export const useModerationDetector = (
    onModerationDetected: () => void,
    enabled: boolean
) => {
    const [moderationDetected, setModerationDetected] = useState(false);
    const [rateLimitDetected, setRateLimitDetected] = useState(false);
    const [debounceTimeout, setDebounceTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
    const lastToastTextRef = useRef<string>('');
    const lastTriggerAtRef = useRef<number>(0);
    const lastModerationFingerprintRef = useRef<string>('');

    const checkForModeration = useCallback(() => {
        // Prefer notifications toaster when present
        const notificationsSection = document.querySelector(selectors.notifications.section);
        let isModerationDetected = false;
        let isRateLimitDetected = false;

        if (notificationsSection) {
            // Check latest toast text
            const latestToast = notificationsSection.querySelector<HTMLLIElement>('li.toast[data-visible="true"]');
            const textNode = latestToast?.querySelector<HTMLElement>('span, div');
            const text = textNode?.textContent ?? '';
            // Avoid refiring on identical toast text in rapid succession
            if (text && text !== lastToastTextRef.current) {
                lastToastTextRef.current = text;
            }
            isModerationDetected = text.includes(MODERATION_TEXT);
            isRateLimitDetected = text.includes(RATE_LIMIT_TEXT);
        } else {
            // Fallback: scan a smaller scope (main container) instead of full body
            const main = document.querySelector(selectors.containers.main) ?? document.body;
            const scopedText = main?.textContent ?? '';
            isModerationDetected = scopedText.includes(MODERATION_TEXT);
            isRateLimitDetected = scopedText.includes(RATE_LIMIT_TEXT);
        }

        // Handle moderation detection
        if (isModerationDetected && !moderationDetected) {
            // Don't schedule a new timeout if one is already pending
            if (debounceTimeout) {
                return; // Already processing this moderation event
            }

            // Create a fingerprint for this moderation event to deduplicate
            const notificationsSection = document.querySelector(selectors.notifications.section);
            const latestToast = notificationsSection?.querySelector<HTMLLIElement>('li.toast[data-visible="true"]');
            const toastText = latestToast?.textContent?.trim() || '';
            const timestamp = Math.floor(Date.now() / 1000); // Round to nearest second
            const fingerprint = `${toastText}_${timestamp}`;

            // Only proceed if this is a new unique moderation event
            if (fingerprint === lastModerationFingerprintRef.current) {
                return; // Same event, ignore
            }
            lastModerationFingerprintRef.current = fingerprint;

            // Debounce the callback to prevent multiple rapid fires
            const timeout = setTimeout(() => {
                // Guard: prevent multiple triggers within cooldown window
                const now = Date.now();
                if (now - lastTriggerAtRef.current < MODERATION_TRIGGER_COOLDOWN_MS) {
                    setDebounceTimeout(null);
                    return;
                }
                lastTriggerAtRef.current = now;
                setModerationDetected(true);
                console.log('[Grok Retry] Moderation detected');
                try { (window as any).__grok_append_log?.('Moderation detected', 'warn'); } catch { }
                onModerationDetected();
                setDebounceTimeout(null);
            }, 100);

            setDebounceTimeout(timeout);
        } else if (!isModerationDetected && moderationDetected) {
            // Hold the detected state briefly to avoid oscillation on attribute churn
            const now = Date.now();
            if (now - lastTriggerAtRef.current >= MODERATION_HOLD_MS) {
                setModerationDetected(false);
            }
        }

        // Handle rate limit detection
        if (isRateLimitDetected && !rateLimitDetected) {
            // Don't schedule a new timeout if one is already pending
            if (debounceTimeout) {
                return; // Already processing rate limit
            }

            setRateLimitDetected(true);

            // Wait 60 seconds before retrying
            const timeout = setTimeout(() => {
                console.log('[Grok Retry] Rate limit detected, waiting 60s before retry...');

                // Schedule retry after 60 seconds
                setTimeout(() => {
                    console.log('[Grok Retry] Rate limit cooldown complete, retrying...');
                    onModerationDetected();
                    setRateLimitDetected(false);
                    setDebounceTimeout(null);
                }, RATE_LIMIT_WAIT_TIME);
            }, 100);

            setDebounceTimeout(timeout);
        } else if (!isRateLimitDetected && rateLimitDetected && debounceTimeout === null) {
            // Only clear if we're not in a scheduled retry
            setRateLimitDetected(false);
        }

        return isModerationDetected || isRateLimitDetected;
    }, [moderationDetected, rateLimitDetected, onModerationDetected, debounceTimeout]);

    useEffect(() => {
        if (!enabled) return;

        // Initial check
        checkForModeration();

        // Set up MutationObserver scoped to notifications section if present, else main container
        const target = document.querySelector(selectors.notifications.section)
            || document.querySelector(selectors.containers.main)
            || document.body;

        const observer = new MutationObserver((mutations) => {
            // Only react to child additions/removals to reduce noise
            if (mutations.some(m => m.type === 'childList')) {
                checkForModeration();
            }
        });

        observer.observe(target, {
            childList: true,
            subtree: true,
        });

        return () => {
            observer.disconnect();
            // Clear debounce timeout on cleanup
            if (debounceTimeout) {
                clearTimeout(debounceTimeout);
            }
        };
    }, [enabled, checkForModeration, debounceTimeout]);

    return { moderationDetected, rateLimitDetected, checkForModeration };
};
