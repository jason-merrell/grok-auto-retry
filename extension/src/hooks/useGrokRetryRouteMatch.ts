import { useState, useEffect } from 'react';

/**
 * Tests current route against a regex pattern and tracks changes.
 * 
 * Monitors URL changes via multiple mechanisms:
 * - Navigation API (modern browsers)
 * - popstate events (back/forward buttons)
 * - history.pushState/replaceState interception (SPA routing)
 * - Polling fallback (catches any missed changes)
 * 
 * Essential for detecting when user navigates to/from imagine routes
 * and triggering appropriate UI mount/unmount.
 * 
 * @param pattern - Regular expression pattern to test against pathname
 * @returns Boolean indicating whether current route matches pattern
 * 
 * @example
 * ```tsx
 * const isImagineRoute = useGrokRetryRouteMatch('^/imagine/post/');
 * // Returns true for /imagine/post/123, false for /home
 * ```
 */
export const useGrokRetryRouteMatch = (pattern: string) => {
    const computeMatch = () => new RegExp(pattern).test(window.location.pathname);
    const [matches, setMatches] = useState<boolean>(() => computeMatch());

    useEffect(() => {
        const checkRoute = () => {
            const path = window.location.pathname;
            const isMatch = new RegExp(pattern).test(path);
            setMatches((prev) => (prev === isMatch ? prev : isMatch));
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

        history.pushState = function (...args) {
            originalPushState.apply(this, args);
            handleNavigation();
        };

        history.replaceState = function (...args) {
            originalReplaceState.apply(this, args);
            handleNavigation();
        };

        // Watch for DOM data attributes as a last resort when Grok swaps routes without navigation events.
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
