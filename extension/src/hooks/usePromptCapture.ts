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

  // Set up listener - but we'll disable auto-capture to prevent conflicts
  // Users should use the "Copy" button to explicitly capture the prompt
  const setupClickListener = useCallback((_onCapture: (value: string) => void) => {
    // Return no-op cleanup function
    // Auto-capture disabled to prevent site changes from overwriting stored prompt
    return () => {};
  }, []);

  return { capturePromptFromSite, setupClickListener };
};
