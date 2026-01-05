import { useState, useEffect } from 'react';

/**
 * Extract post ID from URL like /imagine/post/{postId}
 * Returns null if not on a post route
 * 
 * When a video is successfully generated, Grok's UI navigates to a new post route.
 * This hook maintains session continuity by tracking the "session post ID" which
 * persists during active retry sessions even when the URL changes.
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
            const urlPostId = match ? match[1] : null;

            // Check if we have an active session stored
            const w = window as any;
            const sessionPostId = w.__grok_session_post_id as string | undefined;
            const isSessionActive = w.__grok_retryState?.isSessionActive ?? false;

            // If we have an active session and we're on a new post route,
            // check if this is a Grok-initiated navigation (success) or user-initiated (manual).
            if (isSessionActive && sessionPostId && urlPostId && urlPostId !== sessionPostId) {
                // Check if we recently detected a route change from a success
                const routeChange = w.__grok_route_changed;
                const isRecentRouteChange = routeChange &&
                    routeChange.from === sessionPostId &&
                    Date.now() - routeChange.at < 15000; // Within 15 seconds

                // If this is a recent Grok-initiated route change (success), maintain session
                if (isRecentRouteChange) {
                    console.log(`[Grok Retry] Route changed during active session: ${sessionPostId} -> ${urlPostId}`);
                    // Continue using the original session post ID
                    if (sessionPostId !== postId) {
                        setPostId(sessionPostId);
                    }
                    return;
                }

                // Otherwise, this is likely user-initiated navigation - end the session
                console.log(`[Grok Retry] User navigated away from session post (${sessionPostId} -> ${urlPostId}). Ending session.`);
                delete w.__grok_session_post_id;
                delete w.__grok_route_changed;
                delete w.__grok_video_history_count;
                delete w.__grok_last_success_attempt;
                // Notify the retry hook to end the session
                try {
                    w.__grok_test?.endSession?.('cancelled');
                } catch (e) {
                    console.warn('[Grok Retry] Failed to end session:', e);
                }
                // Fall through to use the new URL post ID
            }

            // Normal case: use the URL post ID
            if (urlPostId !== postId) {
                setPostId(urlPostId);
                // Update session post ID when it changes normally
                if (urlPostId) {
                    w.__grok_session_post_id = urlPostId;
                }
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

        history.pushState = function (...args) {
            originalPushState.apply(this, args);
            handleNavigation();
        };

        history.replaceState = function (...args) {
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
