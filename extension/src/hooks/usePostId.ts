import { useState, useEffect } from 'react';
import { findPrimaryMediaId } from '@/lib/utils';

export interface PostRouteIdentity {
    postId: string | null;
    mediaId: string | null;
}

/**
 * Check if two posts are in the same video group by looking at stored videoGroup data
 */
const arePostsInSameGroup = async (postId1: string, postId2: string): Promise<boolean> => {
    if (!chrome?.storage?.local) return false;

    try {
        const key1 = `grokRetryPost_${postId1}`;
        const key2 = `grokRetryPost_${postId2}`;

        const result = await chrome.storage.local.get([key1, key2]);
        const data1 = result[key1];
        const data2 = result[key2];

        // Check if either post's videoGroup includes the other
        if (data1?.videoGroup && Array.isArray(data1.videoGroup)) {
            if (data1.videoGroup.includes(postId2)) return true;
        }
        if (data2?.videoGroup && Array.isArray(data2.videoGroup)) {
            if (data2.videoGroup.includes(postId1)) return true;
        }

        return false;
    } catch (error) {
        console.warn('[Grok Retry] Error checking videoGroup:', error);
        return false;
    }
};

/**
 * Check if a post ID appears in the video history sidebar
 * This helps determine if posts are part of the same video generation session
 */
const isPostInSidebar = (postId: string): boolean => {
    try {
        const sidebar = document.querySelector('.absolute.top-0.w-fit');
        if (!sidebar) return false;

        // Look for buttons with thumbnail images
        const thumbnails = sidebar.querySelectorAll<HTMLImageElement>('button img[alt*="Thumbnail"]');

        for (const img of Array.from(thumbnails)) {
            const src = img.getAttribute('src') || '';
            // Check if the post ID appears in the image URL
            // Grok's URLs contain the post/share ID: e.g., imagine-public/share-videos/{id}_thumbnail.jpg
            // or users/{userId}/generated/{postId}/preview_image.jpg
            if (src.includes(postId)) {
                return true;
            }
        }

        return false;
    } catch (error) {
        console.warn('[Grok Retry] Error checking sidebar:', error);
        return false;
    }
};

/**
 * Extract post ID from URL like /imagine/post/{postId}
 * Returns null if not on a post route
 * 
 * When a video is successfully generated, Grok's UI navigates to a new post route.
 * This hook detects route changes during active sessions and triggers state migration.
 */
export const usePostId = (): PostRouteIdentity => {
    const [identity, setIdentity] = useState<PostRouteIdentity>({ postId: null, mediaId: null });

    const updateIdentity = (nextPostId: string | null, nextMediaId: string | null) => {
        setIdentity((prev) => {
            if (prev.postId === nextPostId && prev.mediaId === nextMediaId) {
                return prev;
            }
            return { postId: nextPostId, mediaId: nextMediaId };
        });
    };

    useEffect(() => {
        const extractPostIdentity = () => {
            const forced = (window as any).__grok_test?.getForcedPostId?.();
            if (typeof forced === 'string' && forced.length > 0) {
                const forcedMediaId = findPrimaryMediaId();
                updateIdentity(forced, forcedMediaId);
                return;
            }

            const match = window.location.pathname.match(/^\/imagine\/post\/([a-f0-9-]+)/);
            const urlPostId = match ? match[1] : null;
            const nextMediaId = findPrimaryMediaId();

            // Check if we have an active session stored
            const w = window as any;
            const sessionPostId = w.__grok_session_post_id as string | undefined;
            const isSessionActive = w.__grok_retryState?.isSessionActive ?? false;
            const sessionMediaId = w.__grok_session_media_id as string | undefined;

            // If we have an active session and we're on a new post route,
            // check if this is a Grok-initiated navigation (success) or user-initiated (manual).
            if (isSessionActive && sessionPostId && urlPostId && urlPostId !== sessionPostId) {
                const hasMatchingMediaId = Boolean(sessionMediaId && nextMediaId && sessionMediaId === nextMediaId);
                // Check multiple signals to determine if posts are related:
                // 1. Time-based: recent route change flag within 15 seconds
                const routeChange = w.__grok_route_changed;
                const isRecentRouteChange = routeChange &&
                    routeChange.from === sessionPostId &&
                    Date.now() - routeChange.at < 15000;

                // 2. Sidebar-based: old post appears in video history sidebar
                const isInSameSidebarGroup = isPostInSidebar(sessionPostId);

                console.log('[Grok Retry] Route change evaluation', {
                    sessionPostId,
                    nextUrlPostId: urlPostId,
                    sessionMediaId,
                    nextMediaId,
                    hasMatchingMediaId,
                    isRecentRouteChange,
                    isInSameSidebarGroup,
                    routeChange,
                    pendingRouteEval: w.__grok_pending_route_eval ?? null,
                });

                // 3. Storage-based: check if posts are in the same videoGroup (async)
                // This is a fallback in case we missed the initial detection
                if (!hasMatchingMediaId) {
                    arePostsInSameGroup(sessionPostId, urlPostId).then(result => {
                        if (result && !isRecentRouteChange && !isInSameSidebarGroup) {
                            console.log('[Grok Retry] Posts found in same videoGroup - late detection', {
                                sessionPostId,
                                nextUrlPostId: urlPostId,
                                sessionMediaId,
                                lateMediaId: w.__grok_session_media_id ?? null,
                            });
                            // If we missed the initial detection, trigger migration now
                            if (w.__grok_migrate_state) {
                                const lateMediaId = findPrimaryMediaId();
                                w.__grok_migrate_state(sessionPostId, urlPostId, {
                                    fromSessionKey: sessionMediaId ?? sessionPostId,
                                    toSessionKey: lateMediaId ?? sessionMediaId ?? urlPostId,
                                });
                                w.__grok_session_post_id = urlPostId;
                                w.__grok_session_media_id = lateMediaId ?? sessionMediaId ?? null;
                                updateIdentity(urlPostId, lateMediaId ?? sessionMediaId ?? null);
                            }
                        }
                    });
                }

                // If any signal indicates they're related, migrate state
                if (isRecentRouteChange || isInSameSidebarGroup || hasMatchingMediaId) {
                    console.log(`[Grok Retry] Route changed during active session: ${sessionPostId} -> ${urlPostId}`);
                    if (isRecentRouteChange) console.log(`[Grok Retry] - Detected via route change flag`);
                    if (isInSameSidebarGroup) console.log(`[Grok Retry] - Old post found in sidebar`);
                    if (hasMatchingMediaId) console.log(`[Grok Retry] - Stable media ID ${sessionMediaId}`);
                    console.log(`[Grok Retry] Will migrate state and use new post ID: ${urlPostId}`);

                    delete w.__grok_pending_route_eval;

                    // Trigger migration from old post to new post
                    if (w.__grok_migrate_state) {
                        w.__grok_migrate_state(sessionPostId, urlPostId, {
                            fromSessionKey: sessionMediaId ?? sessionPostId,
                            toSessionKey: nextMediaId ?? sessionMediaId ?? urlPostId,
                        });
                    }

                    // Update session tracking to use new post ID
                    w.__grok_session_post_id = urlPostId;
                    w.__grok_session_media_id = nextMediaId ?? sessionMediaId ?? null;

                    // Clear route change flag
                    delete w.__grok_route_changed;

                    // Use the new URL post ID
                    updateIdentity(urlPostId, nextMediaId ?? sessionMediaId ?? null);
                    return;
                }

                // Otherwise, this is likely user-initiated navigation - end the session
                const pendingRouteEval = w.__grok_pending_route_eval as { from: string; to: string; firstSeen: number; forceMigrated?: boolean } | undefined;
                if (!pendingRouteEval || pendingRouteEval.from !== sessionPostId || pendingRouteEval.to !== urlPostId) {
                    w.__grok_pending_route_eval = { from: sessionPostId, to: urlPostId, firstSeen: Date.now(), forceMigrated: false };
                    console.log('[Grok Retry] Deferring session end — waiting for additional route signals');
                    window.setTimeout(() => {
                        try {
                            extractPostIdentity();
                        } catch (err) {
                            console.warn('[Grok Retry] Deferred route evaluation failed:', err);
                        }
                    }, 400);
                    return;
                }

                const elapsedMs = Date.now() - pendingRouteEval.firstSeen;
                const GRACE_MS = 5000;
                if (elapsedMs < GRACE_MS) {
                    console.log('[Grok Retry] Pending route change still within grace period', {
                        sessionPostId,
                        urlPostId,
                        elapsedMs,
                    });
                    window.setTimeout(() => {
                        try {
                            extractPostIdentity();
                        } catch (err) {
                            console.warn('[Grok Retry] Deferred route evaluation failed:', err);
                        }
                    }, 400);
                    return;
                }

                if (!pendingRouteEval.forceMigrated) {
                    console.warn('[Grok Retry] Grace period elapsed — migrating without positive signals', {
                        sessionPostId,
                        urlPostId,
                        sessionMediaId,
                        nextMediaId,
                    });

                    if (w.__grok_migrate_state) {
                        w.__grok_migrate_state(sessionPostId, urlPostId, {
                            fromSessionKey: sessionMediaId ?? sessionPostId,
                            toSessionKey: nextMediaId ?? sessionMediaId ?? urlPostId,
                        });
                    }

                    w.__grok_session_post_id = urlPostId;
                    w.__grok_session_media_id = nextMediaId ?? sessionMediaId ?? null;
                    updateIdentity(urlPostId, nextMediaId ?? sessionMediaId ?? null);
                    delete w.__grok_pending_route_eval;

                    window.setTimeout(() => {
                        try {
                            extractPostIdentity();
                        } catch (err) {
                            console.warn('[Grok Retry] Post-migration route evaluation failed:', err);
                        }
                    }, 750);
                    return;
                }

                console.warn('[Grok Retry] User navigation detected during session - ending session', {
                    sessionPostId,
                    urlPostId,
                    sessionMediaId,
                    nextMediaId,
                    hasMatchingMediaId,
                    isRecentRouteChange,
                    isInSameSidebarGroup,
                });
                delete w.__grok_session_post_id;
                delete w.__grok_session_media_id;
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
            if (urlPostId !== identity.postId) {
                updateIdentity(urlPostId, nextMediaId ?? null);
                if (urlPostId) {
                    w.__grok_session_post_id = urlPostId;
                }
            } else if (nextMediaId && identity.mediaId !== nextMediaId) {
                updateIdentity(urlPostId, nextMediaId);
            }
            if (nextMediaId) {
                w.__grok_session_media_id = nextMediaId;
            }
        };

        // Initial extraction
        extractPostIdentity();

        const handleNavigation = () => {
            extractPostIdentity();
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
            extractPostIdentity();
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
    }, [identity.postId]);

    return identity;
};
