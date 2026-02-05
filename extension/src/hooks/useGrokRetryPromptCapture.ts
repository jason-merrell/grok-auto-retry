import { useCallback, useState } from 'react';
import { findPromptInput, readPromptValue, writePromptValue } from '../lib/promptInput';
const CAPTURE_COOLDOWN = 500; // ms between captures

/**
 * Captures and restores prompt text from/to Grok's input fields.
 * 
 * Provides utilities to:
 * - Capture current prompt text from textarea or contenteditable elements
 * - Restore prompt text to input fields (with React state synchronization)
 * - Set up click listeners to capture prompts automatically
 * - Handle cooldowns to prevent rapid-fire captures
 * 
 * Essential for preserving prompts between retry attempts and across
 * route changes during video generation sessions.
 * 
 * @returns Functions for capturing, copying, and setting up prompt interactions
 * 
 * @example
 * ```tsx
 * const { capturePromptFromSite, copyPromptToSite } = useGrokRetryPromptCapture();
 * 
 * // Capture current prompt
 * const prompt = capturePromptFromSite();
 * 
 * // Restore prompt after retry
 * copyPromptToSite('A cinematic shot...');
 * ```
 */
export const useGrokRetryPromptCapture = () => {
    const [lastCaptureTime, setLastCaptureTime] = useState(0);

    const capturePromptFromSite = useCallback(() => {
        const now = Date.now();
        if (now - lastCaptureTime < CAPTURE_COOLDOWN) {
            return null;
        }

        const entry = findPromptInput();
        const textValue = entry ? readPromptValue(entry.element) : null;
        if (entry && textValue) {
            setLastCaptureTime(now);
            const prefix = entry.type === 'textarea' ? 'textarea' : entry.type === 'contenteditable' ? 'editor' : 'input';
            console.log(`[Grok Retry] Captured prompt from ${prefix}:`, textValue.substring(0, 50) + '...');
            return textValue;
        }

        return null;
    }, [lastCaptureTime]);

    const copyPromptToSite = useCallback((promptValue: string) => {
        const entry = findPromptInput();
        if (!entry) {
            console.log('[Grok Retry] Prompt input not found');
            return false;
        }

        const success = writePromptValue(entry.element, promptValue);
        if (success) {
            const prefix = entry.type === 'textarea' ? 'textarea' : entry.type === 'contenteditable' ? 'editor' : 'input';
            console.log(`[Grok Retry] Copied prompt to ${prefix}:`, promptValue.substring(0, 50) + '...');
        }
        return success;
    }, []);

    // Set up listener - but we'll disable auto-capture to prevent conflicts
    // Users should use the "Copy" button to explicitly capture the prompt
    const setupClickListener = useCallback((_onCapture: (value: string) => void) => {
        // Return no-op cleanup function
        // Auto-capture disabled to prevent site changes from overwriting stored prompt
        return () => { };
    }, []);

    return { capturePromptFromSite, copyPromptToSite, setupClickListener };
};
