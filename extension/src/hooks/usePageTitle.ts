import { useEffect } from 'react';

export const usePageTitle = (
  originalTitle: string,
  retryCount: number,
  maxRetries: number,
  isPaused: boolean,
  autoRetryEnabled: boolean,
  isRateLimited: boolean = false
) => {
  useEffect(() => {
    if (!autoRetryEnabled || retryCount === 0) {
      document.title = originalTitle;
      return;
    }

    if (isRateLimited) {
      document.title = `⏳ Rate Limited - ${originalTitle}`;
    } else if (isPaused) {
      document.title = `⏸️ ${originalTitle}`;
    } else if (retryCount >= maxRetries) {
      document.title = `❌ ${originalTitle}`;
    } else {
      document.title = `🔄 ${retryCount}/${maxRetries} ${originalTitle}`;
    }
  }, [originalTitle, retryCount, maxRetries, isPaused, autoRetryEnabled, isRateLimited]);
};
