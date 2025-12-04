import { useCallback, useState } from 'react';

const TEXTAREA_SELECTOR = 'textarea[aria-label="Make a video"][placeholder="Type to customize video..."]';
const CAPTURE_COOLDOWN = 500; // ms between captures

export const usePromptCapture = () => {
  const [lastCaptureTime, setLastCaptureTime] = useState(0);

  const capturePromptFromSite = useCallback(() => {
    const now = Date.now();
    if (now - lastCaptureTime < CAPTURE_COOLDOWN) {
      return null;
    }

    const textarea = document.querySelector<HTMLTextAreaElement>(TEXTAREA_SELECTOR);
    if (!textarea || !textarea.value) {
      return null;
    }

    setLastCaptureTime(now);
    console.log('[Grok Retry] Captured prompt from site:', textarea.value.substring(0, 50) + '...');
    return textarea.value;
  }, [lastCaptureTime]);

  const copyPromptToSite = useCallback((promptValue: string) => {
    const textarea = document.querySelector<HTMLTextAreaElement>(TEXTAREA_SELECTOR);
    if (!textarea) {
      console.log('[Grok Retry] Textarea not found');
      return false;
    }

    // React-style value setting to ensure React detects the change
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    )?.set;
    
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(textarea, promptValue);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      console.log('[Grok Retry] Copied prompt to site:', promptValue.substring(0, 50) + '...');
      return true;
    }
    return false;
  }, []);

  // Set up listener - but we'll disable auto-capture to prevent conflicts
  // Users should use the "Copy" button to explicitly capture the prompt
  const setupClickListener = useCallback((_onCapture: (value: string) => void) => {
    // Return no-op cleanup function
    // Auto-capture disabled to prevent site changes from overwriting stored prompt
    return () => {};
  }, []);

  return { capturePromptFromSite, copyPromptToSite, setupClickListener };
};
