import { useState, useEffect } from 'react';

/**
 * Extract post ID from URL like /imagine/post/{postId}
 * Returns null if not on a post route
 */
export const usePostId = (): string | null => {
  const [postId, setPostId] = useState<string | null>(null);

  useEffect(() => {
    const extractPostId = () => {
      const forced = (window as any).__grok_test?.getForcedPostId?.();
      if (typeof forced === 'string' && forced.length > 0) {
        if (forced !== postId) {
          setPostId(forced);
        }
        return;
      }

      const match = window.location.pathname.match(/^\/imagine\/post\/([a-f0-9-]+)/);
      const id = match ? match[1] : null;
      if (id !== postId) {
        setPostId(id);
      }
    };

    // Initial extraction
    extractPostId();

    const handleNavigation = () => {
      extractPostId();
    };

    // Try Navigation API first (modern browsers)
    if ('navigation' in window) {
      (window as any).navigation.addEventListener('navigate', handleNavigation);
    }

    // Listen for popstate (back/forward buttons)
    window.addEventListener('popstate', handleNavigation);
    
    // Override history methods (catches most SPA routing)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      handleNavigation();
    };

    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      handleNavigation();
    };

    // Watch for DOM changes in main content area (fallback for unusual routing)
    const observer = new MutationObserver(() => {
      extractPostId();
    });

    // Observe the entire document for attribute changes (some routers change data attributes)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-route', 'data-path'],
      subtree: false
    });

    return () => {
      if ('navigation' in window) {
        (window as any).navigation.removeEventListener('navigate', handleNavigation);
      }
      window.removeEventListener('popstate', handleNavigation);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
      observer.disconnect();
    };
  }, [postId]);

  return postId;
};
