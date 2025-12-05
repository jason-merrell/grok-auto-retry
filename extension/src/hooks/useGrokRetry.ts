import { useState, useCallback, useEffect } from 'react';
import { usePostStorage } from './useSessionStorage';

const CLICK_COOLDOWN = 8000; // 8 seconds between retries
const BUTTON_SELECTORS = [
    'button[aria-label="Redo"]',      // For retries after first generation
    'button[aria-label="Make video"]' // For first generation
];
const TEXTAREA_SELECTOR = 'textarea[aria-label="Make a video"][placeholder="Type to customize video..."]';

export const useGrokRetry = (postId: string | null) => {
    const { data: postData, save, isLoading } = usePostStorage(postId);

    const [lastClickTime, setLastClickTime] = useState(0);
    const [originalPageTitle, setOriginalPageTitle] = useState('');

    // Initialize original page title
    useEffect(() => {
        if (!originalPageTitle) {
            setOriginalPageTitle(document.title);
        }
    }, [originalPageTitle]);

    const maxRetries = postData.maxRetries;
    const autoRetryEnabled = postData.autoRetryEnabled;
    const retryCount = postData.retryCount;
    const lastPromptValue = postData.lastPromptValue;
    const isSessionActive = postData.isSessionActive;
    const videoGoal = postData.videoGoal;
    const videosGenerated = postData.videosGenerated;
    const lastAttemptTime = postData.lastAttemptTime;

    const setMaxRetries = useCallback((value: number) => {
        const clamped = Math.max(1, Math.min(50, value));
        save('maxRetries', clamped);
    }, [save]);

    const setAutoRetryEnabled = useCallback((value: boolean) => {
        save('autoRetryEnabled', value);
    }, [save]);

    const updatePromptValue = useCallback((value: string) => {
        save('lastPromptValue', value);
    }, [save]);

    const resetRetries = useCallback(() => {
        save('retryCount', 0);
    }, [save]);

    const setVideoGoal = useCallback((value: number) => {
        const clamped = Math.max(1, Math.min(50, value));
        save('videoGoal', clamped);
    }, [save]);

    const incrementVideosGenerated = useCallback(() => {
        save('videosGenerated', videosGenerated + 1);
    }, [save, videosGenerated]);

    const resetVideosGenerated = useCallback(() => {
        save('videosGenerated', 0);
    }, [save]);

    const startSession = useCallback(() => {
        save('isSessionActive', true);
        save('retryCount', 0);
        save('videosGenerated', 0);
    }, [save]);

    const endSession = useCallback(() => {
        save('isSessionActive', false);
        save('retryCount', 0);
        save('videosGenerated', 0);
    }, [save]);

    // Click the "Make video" button with React-style value setting
    const clickMakeVideoButton = useCallback((promptValue?: string) => {
        const now = Date.now();
        const timeUntilReady = lastClickTime + CLICK_COOLDOWN - now;

        if (timeUntilReady > 0) {
            console.log(`[Grok Retry] Cooldown active, retrying in ${Math.ceil(timeUntilReady / 1000)}s...`);
            // Schedule the click after cooldown
            setTimeout(() => {
                clickMakeVideoButton(promptValue);
            }, timeUntilReady);
            return false;
        }

        // Try to find the button using either selector
        let button: HTMLButtonElement | null = null;
        for (const selector of BUTTON_SELECTORS) {
            button = document.querySelector<HTMLButtonElement>(selector);
            if (button) {
                console.log('[Grok Retry] Found button with selector:', selector);
                break;
            }
        }

        if (!button) {
            console.log('[Grok Retry] Button not found with any selector');
            return false;
        }

        // Always restore the prompt value to the textarea before clicking
        const textarea = document.querySelector<HTMLTextAreaElement>(TEXTAREA_SELECTOR);
        if (!textarea) {
            console.log('[Grok Retry] Textarea not found');
            return false;
        }

        if (promptValue) {
            // React-style value setting to ensure React detects the change
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLTextAreaElement.prototype,
                'value'
            )?.set;

            if (nativeInputValueSetter) {
                nativeInputValueSetter.call(textarea, promptValue);
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                console.log('[Grok Retry] Restored prompt to textarea:', promptValue.substring(0, 50) + '...');
            }
        } else {
            console.log('[Grok Retry] Warning: No prompt value to restore!');
        }

        button.click();
        setLastClickTime(now);

        // Increment retry count and mark session as active
        const newCount = retryCount + 1;
        save('retryCount', newCount);
        save('isSessionActive', true);
        save('lastAttemptTime', now);
        console.log('[Grok Retry] Clicked button, retry count:', retryCount, '->', newCount);

        return true;
    }, [lastClickTime, retryCount, save]);

    return {
        // State
        retryCount,
        maxRetries,
        autoRetryEnabled,
        lastPromptValue,
        originalPageTitle,
        isSessionActive,
        videoGoal,
        videosGenerated,
        lastAttemptTime,
        isLoading,

        // Actions
        setMaxRetries,
        setAutoRetryEnabled,
        updatePromptValue,
        resetRetries,
        clickMakeVideoButton,
        startSession,
        endSession,
        setVideoGoal,
        incrementVideosGenerated,
        resetVideosGenerated,
    };
};