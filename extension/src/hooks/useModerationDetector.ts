import { useEffect, useCallback, useState } from 'react';

const MODERATION_TEXT = "Content Moderated. Try a different idea.";
const RATE_LIMIT_TEXT = "Rate limit reached";
const RATE_LIMIT_WAIT_TIME = 60000; // 60 seconds

export const useModerationDetector = (
  onModerationDetected: () => void,
  enabled: boolean
) => {
  const [moderationDetected, setModerationDetected] = useState(false);
  const [rateLimitDetected, setRateLimitDetected] = useState(false);
  const [debounceTimeout, setDebounceTimeout] = useState<NodeJS.Timeout | null>(null);

  const checkForModeration = useCallback(() => {
    const bodyText = document.body?.textContent ?? '';
    const isModerationDetected = bodyText.includes(MODERATION_TEXT);
    const isRateLimitDetected = bodyText.includes(RATE_LIMIT_TEXT);
    
    // Handle moderation detection
    if (isModerationDetected && !moderationDetected) {
      // Clear any pending debounce
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
      
      // Debounce the callback to prevent multiple rapid fires
      const timeout = setTimeout(() => {
        setModerationDetected(true);
        console.log('[Grok Retry] Moderation detected');
        onModerationDetected();
      }, 100);
      
      setDebounceTimeout(timeout);
    } else if (!isModerationDetected && moderationDetected) {
      setModerationDetected(false);
    }
    
    // Handle rate limit detection
    if (isRateLimitDetected && !rateLimitDetected) {
      // Clear any pending debounce
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
      
      // Wait 60 seconds before retrying
      const timeout = setTimeout(() => {
        setRateLimitDetected(true);
        console.log('[Grok Retry] Rate limit detected, waiting 60s before retry...');
        
        // Schedule retry after 60 seconds
        setTimeout(() => {
          console.log('[Grok Retry] Rate limit cooldown complete, retrying...');
          onModerationDetected();
          setRateLimitDetected(false);
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

    // Set up MutationObserver to watch for DOM changes
    const observer = new MutationObserver(() => {
      checkForModeration();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
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
