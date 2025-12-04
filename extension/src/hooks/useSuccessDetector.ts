import { useEffect, useState, useCallback } from 'react';

const VIDEO_SELECTOR = 'video[id="sd-video"]';

export const useSuccessDetector = (onSuccess: () => void, isEnabled: boolean) => {
  const [lastVideoSrc, setLastVideoSrc] = useState<string | null>(null);

  const checkVideoSuccess = useCallback(() => {
    if (!isEnabled) return;

    const video = document.querySelector<HTMLVideoElement>(VIDEO_SELECTOR);
    if (!video || !video.src) return;

    // If the video src changed and is not empty, a new video was generated
    if (lastVideoSrc !== null && video.src !== lastVideoSrc && video.src !== '') {
      console.log('[Grok Retry] Success detected - new video src:', video.src);
      onSuccess();
    }

    setLastVideoSrc(video.src);
  }, [lastVideoSrc, isEnabled, onSuccess]);

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
      const video = document.querySelector(VIDEO_SELECTOR);
      if (video && !observer.takeRecords().length) {
        observer.observe(video, {
          attributes: true,
          attributeFilter: ['src'],
        });
        checkVideoSuccess();
      }
    });

    bodyObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      bodyObserver.disconnect();
    };
  }, [isEnabled, checkVideoSuccess]);
};
