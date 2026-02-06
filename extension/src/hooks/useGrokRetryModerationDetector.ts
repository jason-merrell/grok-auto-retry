import { useEffect, useCallback, useState, useRef } from 'react';
import { selectors } from '../config/selectors';

const MODERATION_TEXT_MATCHERS = [
    'content moderated',
    "content moderated. try a different idea.",
    'content was moderated',
    'content violates our policies',
    "doesn't fit our guidelines",
    'violates our guidelines',
    'blocked for moderation',
    'try a different idea',
    'moderated',
] as const;
const RATE_LIMIT_TEXT = "Rate limit reached";
const MODERATION_TRIGGER_COOLDOWN_MS = 5000; // hard guard between callbacks
const MODERATION_HOLD_MS = 2000; // keep detected state for stability

interface ModerationDetectorOptions {
    onModerationDetected: () => void;
    onRateLimitDetected?: () => void;
    addLogEntry: (message: string, level?: 'info' | 'warn' | 'error' | 'success') => void;
    enabled: boolean;
}

const normalizeText = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase();

const findModerationMatch = (value: string | null | undefined): string | null => {
    if (!value) return null;
    const normalized = normalizeText(value);
    if (!normalized) return null;
    return MODERATION_TEXT_MATCHERS.find((candidate) => normalized.includes(candidate)) ?? null;
};

/**
 * Detects moderation and rate limit events via DOM observation.
 * 
 * Monitors Grok's UI for:
 * - "Content Moderated" toast notifications
 * - Rate limit warnings
 * - Modal dialogs with moderation messages
 * 
 * Uses multiple detection strategies:
 * 1. Toast notifications (preferred, fastest)
 * 2. Modal dialogs (fallback)
 * 3. Fingerprint-based deduplication to prevent duplicate triggers
 * 
 * Includes cooldowns and debouncing to prevent rapid-fire callbacks.
 * 
 * @param options.onModerationDetected - Callback fired when moderation is detected
 * @param options.onRateLimitDetected - Optional callback for rate limits
 * @param options.addLogEntry - Function to add log entries
 * @param options.enabled - Whether detection is active
 * @returns State object with moderationDetected and rateLimitDetected booleans
 * 
 * @example
 * ```tsx
 * useGrokRetryModerationDetector({
 *   onModerationDetected: () => markFailure(),
 *   onRateLimitDetected: () => pauseRetries(),
 *   addLogEntry: (message, level) => console.log(message, level),
 *   enabled: isSessionActive
 * });
 * ```
 */
export const useGrokRetryModerationDetector = ({
    onModerationDetected,
    onRateLimitDetected,
    addLogEntry,
    enabled,
}: ModerationDetectorOptions) => {
    const [moderationDetected, setModerationDetected] = useState(false);
    const [rateLimitDetected, setRateLimitDetected] = useState(false);
    const [debounceTimeout, setDebounceTimeout] = useState<NodeJS.Timeout | null>(null);
    const lastTriggerAtRef = useRef<number>(0);
    const lastModerationFingerprintRef = useRef<string>('');

    const checkForModeration = useCallback(() => {
        let isModerationDetected = false;
        let isRateLimitDetected = false;
        let moderationFingerprint: string | null = null;
        let moderationSource: string | null = null;

        // Check notification section first (toasts appear here)
        const notificationSection = document.querySelector(selectors.notifications.section);
        if (notificationSection) {
            const toastText = notificationSection.textContent ?? '';
            const toastMatch = findModerationMatch(toastText);
            if (toastMatch) {
                moderationFingerprint = `toast:${toastMatch}`;
                moderationSource = 'toast';
                isModerationDetected = true;
            }
        } else {
            // Debug: Log when notification section is not found
            const fallbackCheck = document.querySelector('section[aria-label*="Notifications"]');
            if (fallbackCheck) {
                console.log('[Grok Retry] Found notification section but aria-live check failed');
            }
        }

        // Fallback to main content if not found in toast
        if (!isModerationDetected) {
            const main = document.querySelector(selectors.containers.main) ?? document.body;
            const scopedText = main?.textContent ?? '';

            const scopedMatch = findModerationMatch(scopedText);
            if (scopedMatch) {
                moderationFingerprint = `text:${scopedMatch}`;
                moderationSource = 'text';
                isModerationDetected = true;
            }

            if (!isRateLimitDetected && scopedText.includes(RATE_LIMIT_TEXT)) {
                isRateLimitDetected = true;
            }
        }

        if (isModerationDetected && !moderationDetected) {
            if (debounceTimeout) {
                return;
            }

            const fingerprint = moderationFingerprint ?? `fallback:${Date.now()}`;
            if (fingerprint === lastModerationFingerprintRef.current) {
                return;
            }
            lastModerationFingerprintRef.current = fingerprint;

            const timeout = setTimeout(() => {
                const now = Date.now();
                if (now - lastTriggerAtRef.current < MODERATION_TRIGGER_COOLDOWN_MS) {
                    setDebounceTimeout(null);
                    return;
                }
                lastTriggerAtRef.current = now;
                setModerationDetected(true);
                const label = moderationSource ? ` via ${moderationSource}` : '';
                console.log(`[Grok Retry] Moderation detected${label}`);
                addLogEntry(`Moderation detected${label}`, 'warn');
                onModerationDetected();
                setDebounceTimeout(null);
            }, 100);

            setDebounceTimeout(timeout);
        } else if (!isModerationDetected && moderationDetected) {
            const now = Date.now();
            if (now - lastTriggerAtRef.current >= MODERATION_HOLD_MS) {
                setModerationDetected(false);
                lastModerationFingerprintRef.current = '';
            }
        }

        // Handle rate limit detection
        if (isRateLimitDetected && !rateLimitDetected) {
            if (debounceTimeout) {
                clearTimeout(debounceTimeout);
                setDebounceTimeout(null);
            }

            setRateLimitDetected(true);
            console.warn('[Grok Retry] Rate limit detected — cancelling active sessions');
            addLogEntry('Rate limit detected — cancelling active sessions. Please wait before retrying.', 'warn');
            onRateLimitDetected?.();
        } else if (!isRateLimitDetected && rateLimitDetected) {
            setRateLimitDetected(false);
        }

        return isModerationDetected || isRateLimitDetected;
    }, [moderationDetected, rateLimitDetected, onModerationDetected, onRateLimitDetected, debounceTimeout]);

    useEffect(() => {
        if (!enabled) return;

        // Initial check
        checkForModeration();

        const observer = new MutationObserver((mutations) => {
            if (mutations.some((mutation) => mutation.type === 'childList')) {
                checkForModeration();
            }
        });

        const observedTargets = new Set<Element>();

        // Watch notification section (where toasts appear)
        const notificationEl = document.querySelector(selectors.notifications.section);
        if (notificationEl) {
            observedTargets.add(notificationEl);
        }

        // Watch main content area
        const mainEl = document.querySelector(selectors.containers.main);
        if (mainEl) {
            observedTargets.add(mainEl);
        }

        // Fallback to body
        if (observedTargets.size === 0 && document.body) {
            observedTargets.add(document.body);
        }

        observedTargets.forEach((node) => {
            observer.observe(node, {
                childList: true,
                subtree: true,
            });
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
