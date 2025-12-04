import { useState, useEffect } from 'react';

export const useRouteMatch = (pattern: string) => {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const checkRoute = () => {
      const path = window.location.pathname;
      const isMatch = new RegExp(pattern).test(path);
      setMatches(isMatch);
    };

    // Initial check
    checkRoute();

    const handleNavigation = () => {
      checkRoute();
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

    // Watch for DOM changes (fallback for unusual routing)
    const observer = new MutationObserver(() => {
      checkRoute();
    });

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
  }, [pattern]);

  return matches;
};
