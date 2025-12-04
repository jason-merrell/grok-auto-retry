import { useState, useCallback, useEffect } from 'react';
import { usePostStorage } from './useSessionStorage';

const CLICK_COOLDOWN = 8000; // 8 seconds between retries
const BUTTON_SELECTOR = 'button[aria-label="Make video"]';
const TEXTAREA_SELECTOR = 'textarea[aria-label="Make a video"][placeholder="Type to customize video..."]';

export const useGrokRetry = (postId: string | null) => {
  const { data: postData, save } = usePostStorage(postId);
  
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
  const isPaused = postData.isPaused;
  const lastPromptValue = postData.lastPromptValue;

  const setMaxRetries = useCallback((value: number) => {
    const clamped = Math.max(1, Math.min(50, value));
    save('maxRetries', clamped);
  }, [save]);

  const setAutoRetryEnabled = useCallback((value: boolean) => {
    save('autoRetryEnabled', value);
  }, [save]);

  const setIsPaused = useCallback((value: boolean) => {
    save('isPaused', value);
  }, [save]);

  const updatePromptValue = useCallback((value: string) => {
    save('lastPromptValue', value);
  }, [save]);

  const resetRetries = useCallback(() => {
    save('retryCount', 0);
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

    const button = document.querySelector<HTMLButtonElement>(BUTTON_SELECTOR);
    if (!button) {
      console.log('[Grok Retry] Button not found');
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
    
    // Increment retry count
    const newCount = retryCount + 1;
    save('retryCount', newCount);
    console.log('[Grok Retry] Clicked button, retry count:', retryCount, '->', newCount);
    
    return true;
  }, [lastClickTime, retryCount, save]);

  return {
    // State
    retryCount,
    maxRetries,
    autoRetryEnabled,
    isPaused,
    lastPromptValue,
    originalPageTitle,
    
    // Actions
    setMaxRetries,
    setAutoRetryEnabled,
    setIsPaused,
    updatePromptValue,
    resetRetries,
    clickMakeVideoButton,
  };
};
