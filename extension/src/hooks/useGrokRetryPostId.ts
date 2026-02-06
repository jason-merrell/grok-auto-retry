import { useState, useEffect } from 'react';
import { findPrimaryMediaId } from '@/lib/utils';

const SESSION_STORAGE_PREFIX = 'grokRetrySession_';
const VIDEO_SESSIONS_STORE_KEY = 'useGrokRetryVideoSessions_store';
const PROGRESS_RECENCY_MS = 20000;
const NEAR_COMPLETE_RECENCY_MS = 60000;
const ROUTE_EVAL_LOG_THROTTLE_MS = 2000;

/**
 * Route identity for tracking posts and media across navigation.
 * 
 * @property postId - X/Twitter post ID from URL (/imagine/post/:postId)
 * @property mediaId - Media ID from URL query param (?mediaId=xxx)
 */
export interface PostRouteIdentity {
    postId: string | null;
    mediaId: string | null;
}

type PendingRouteEvaluation = {
    from: string;
    to: string;
    firstSeen: number;
    forceMigrated?: boolean;
    timeoutId?: number;
    lastDeferredLog?: number;
    groupCheckScheduled?: boolean;
    graceSummaryLogged?: boolean;
    graceExpiryLogged?: boolean;
};

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
export const useGrokRetryPostId = (): PostRouteIdentity => {
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
        const clearPendingRouteEval = (options?: { resetLog?: boolean }) => {
            const pending = (window as any).__grok_pending_route_eval as PendingRouteEvaluation | undefined;
            if (pending?.timeoutId) {
                window.clearTimeout(pending.timeoutId);
            }
            delete (window as any).__grok_pending_route_eval;
            if (options?.resetLog) {
                delete (window as any).__grok_last_route_eval;
                delete (window as any).__grok_route_eval_log_state;
            }
        };

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
                const evaluationNow = Date.now();
                const isRecentRouteChange = routeChange &&
                    routeChange.from === sessionPostId &&
                    evaluationNow - routeChange.at < 15000;

                // 2. Sidebar-based: old post appears in video history sidebar
                const isInSameSidebarGroup = isPostInSidebar(sessionPostId);

                const suppressUntil = w.__grok_route_eval_suppress_until as number | undefined;
                if (typeof suppressUntil === 'number') {
                    if (evaluationNow < suppressUntil) {
                        clearPendingRouteEval();
                        const lastSuppressLog = (w as any).__grok_route_eval_suppress_log as number | undefined;
                        if (!lastSuppressLog || evaluationNow - lastSuppressLog > 400) {
                            console.log('[Grok Retry] Suppressing route grace window after moderation', {
                                sessionPostId,
                                urlPostId,
                                suppressMsRemaining: suppressUntil - evaluationNow,
                            });
                            (w as any).__grok_route_eval_suppress_log = evaluationNow;
                        }
                    } else {
                        delete (w as any).__grok_route_eval_suppress_until;
                        delete (w as any).__grok_route_eval_suppress_log;
                    }
                }

                const routeEvalSignature = `${sessionMediaId ?? 'none'}|${nextMediaId ?? 'none'}|${hasMatchingMediaId ? '1' : '0'}|${isRecentRouteChange ? '1' : '0'}|${isInSameSidebarGroup ? '1' : '0'}`;
                const routeEvalCache = (w as any).__grok_last_route_eval as {
                    from: string;
                    to: string;
                    signature: string;
                    at: number;
                } | undefined;
                const shouldLogRouteEval = !routeEvalCache ||
                    routeEvalCache.from !== sessionPostId ||
                    routeEvalCache.to !== urlPostId ||
                    routeEvalCache.signature !== routeEvalSignature;

                if (shouldLogRouteEval) {
                    const logStateKey = `${sessionPostId}->${urlPostId}`;
                    const logStateMap = (w as any).__grok_route_eval_log_state as Record<string, { signature: string; loggedAt: number }> | undefined;
                    const nextLogStateMap = logStateMap || {};
                    const lastState = nextLogStateMap[logStateKey];
                    const shouldEmitLog = !lastState ||
                        lastState.signature !== routeEvalSignature ||
                        evaluationNow - lastState.loggedAt > ROUTE_EVAL_LOG_THROTTLE_MS;

                    if (shouldEmitLog) {
                        nextLogStateMap[logStateKey] = {
                            signature: routeEvalSignature,
                            loggedAt: evaluationNow,
                        };
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
                        (w as any).__grok_route_eval_log_state = nextLogStateMap;
                    }

                    (w as any).__grok_last_route_eval = {
                        from: sessionPostId,
                        to: urlPostId,
                        signature: routeEvalSignature,
                        at: evaluationNow,
                    };
                }

                // 3. Storage-based: check if posts are in the same videoGroup (async)
                // This is a fallback in case we missed the initial detection
                if (!hasMatchingMediaId) {
                    const cacheKey = `${sessionPostId}->${urlPostId}`;
                    const wAny = w as any;
                    if (!wAny.__grok_group_check_cache) {
                        wAny.__grok_group_check_cache = {};
                    }
                    const groupCheckCache = wAny.__grok_group_check_cache as Record<string, number>;
                    const lastChecked = groupCheckCache[cacheKey] ?? 0;
                    if (!lastChecked || evaluationNow - lastChecked > 5000) {
                        groupCheckCache[cacheKey] = evaluationNow;
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
                }

                // If any signal indicates they're related, migrate state
                if (isRecentRouteChange || isInSameSidebarGroup || hasMatchingMediaId) {
                    console.log(`[Grok Retry] Route changed during active session: ${sessionPostId} -> ${urlPostId}`);
                    if (isRecentRouteChange) console.log(`[Grok Retry] - Detected via route change flag`);
                    if (isInSameSidebarGroup) console.log(`[Grok Retry] - Old post found in sidebar`);
                    if (hasMatchingMediaId) console.log(`[Grok Retry] - Stable media ID ${sessionMediaId}`);
                    console.log(`[Grok Retry] Will migrate state and use new post ID: ${urlPostId}`);

                    clearPendingRouteEval();

                    // Trigger migration from old post to new post
                    // Preserve the original sessionMediaId to ensure all videos reference the same source image
                    if (w.__grok_migrate_state) {
                        w.__grok_migrate_state(sessionPostId, urlPostId, {
                            fromSessionKey: sessionMediaId ?? sessionPostId,
                            toSessionKey: nextMediaId ?? sessionMediaId ?? urlPostId,
                        });
                    }
                    clearPendingRouteEval();
                    // Update session tracking to use new post ID, but keep original media ID
                    w.__grok_session_post_id = urlPostId;
                    // Preserve sessionMediaId (original image ID) rather than replacing with nextMediaId
                    if (!w.__grok_session_media_id && sessionMediaId) {
                        w.__grok_session_media_id = sessionMediaId;
                    }

                    // Clear route change flag
                    delete w.__grok_route_changed;

                    // Use the new URL post ID
                    updateIdentity(urlPostId, nextMediaId ?? sessionMediaId ?? null);
                    return;
                }

                // Otherwise, this is likely user-initiated navigation - end the session
                const now = evaluationNow;
                const existingPending = w.__grok_pending_route_eval as PendingRouteEvaluation | undefined;
                const isSamePending = existingPending &&
                    existingPending.from === sessionPostId &&
                    existingPending.to === urlPostId;

                const pendingRouteEval: PendingRouteEvaluation = isSamePending
                    ? existingPending as PendingRouteEvaluation
                    : {
                        from: sessionPostId,
                        to: urlPostId,
                        firstSeen: now,
                        forceMigrated: false,
                    };

                const scheduleDeferredEvaluation = (delay: number) => {
                    if (pendingRouteEval.timeoutId) {
                        window.clearTimeout(pendingRouteEval.timeoutId);
                    }

                    const timeoutId = window.setTimeout(() => {
                        const current = (window as any).__grok_pending_route_eval as PendingRouteEvaluation | undefined;
                        if (current && current.timeoutId === timeoutId) {
                            delete current.timeoutId;
                        }

                        try {
                            extractPostIdentity();
                        } catch (err) {
                            console.warn('[Grok Retry] Deferred route evaluation failed:', err);
                        }
                    }, delay);

                    pendingRouteEval.timeoutId = timeoutId;
                    w.__grok_pending_route_eval = pendingRouteEval;
                };

                if (!isSamePending) {
                    if (existingPending?.timeoutId) {
                        window.clearTimeout(existingPending.timeoutId);
                    }
                    w.__grok_pending_route_eval = pendingRouteEval;
                    console.log('[Grok Retry] Deferring session end — waiting for additional route signals');
                    scheduleDeferredEvaluation(400);
                    return;
                }

                const elapsedMs = now - pendingRouteEval.firstSeen;
                const GRACE_MS = 120000; // allow two minutes for Grok edge-case navigations
                if (elapsedMs < GRACE_MS) {
                    if (!pendingRouteEval.graceSummaryLogged) {
                        console.log('[Grok Retry] Grace window active for route change', {
                            sessionPostId,
                            urlPostId,
                            graceMs: GRACE_MS,
                        });
                        pendingRouteEval.graceSummaryLogged = true;
                    }
                    scheduleDeferredEvaluation(400);
                    return;
                }

                if (!pendingRouteEval.graceExpiryLogged) {
                    console.log('[Grok Retry] Grace window expired for route change', {
                        sessionPostId,
                        urlPostId,
                        waitedMs: elapsedMs,
                    });
                    pendingRouteEval.graceExpiryLogged = true;
                }

                if (!pendingRouteEval.forceMigrated) {
                    // Check Grok's storage as source of truth for video completion
                    // IMPORTANT: Only apply grace period logic if video appears complete or stuck
                    // Don't cancel during active generation (progress < 100%)
                    let hasCompletedVideos = false;
                    let hasActiveGeneratingVideo = false;
                    try {
                        const storeData = sessionStorage.getItem('useMediaStore');
                        if (storeData) {
                            const store = JSON.parse(storeData);
                            const mediaIdToCheck = sessionMediaId || sessionPostId;
                            const videos = store.state?.videoByMediaId?.[mediaIdToCheck] || [];

                            // Check if any video shows completion (moderated or 100% progress)
                            hasCompletedVideos = videos.some((v: any) => v && (v.moderated || v.progress >= 100));

                            // Check if any video is still actively generating (progress > 0 but < 99)
                            hasActiveGeneratingVideo = videos.some((v: any) => v && v.progress > 0 && v.progress < 99);

                            if (hasCompletedVideos) {
                                console.log('[Grok Retry] Grace period check: Grok storage shows completed videos - treating as source of truth', {
                                    sessionMediaId: mediaIdToCheck,
                                    moderatedVideos: videos.filter((v: any) => v && v.moderated).length,
                                    completedVideos: videos.filter((v: any) => v && v.progress >= 100).length,
                                });
                            } else if (hasActiveGeneratingVideo) {
                                console.log('[Grok Retry] Grace period check: Video still actively generating - not applying cancellation logic', {
                                    sessionMediaId: mediaIdToCheck,
                                    activeVideos: videos.filter((v: any) => v && v.progress > 0 && v.progress < 99).length,
                                });
                            }
                        }
                    } catch (err) {
                        console.warn('[Grok Retry] Failed to check Grok storage during grace period:', err);
                    }

                    if (!hasCompletedVideos && !hasActiveGeneratingVideo) {
                        try {
                            const now = Date.now();
                            const localCandidates = new Set<string>();
                            if (sessionMediaId) localCandidates.add(sessionMediaId);
                            if (sessionPostId) localCandidates.add(sessionPostId);

                            const localStoreRaw = sessionStorage.getItem(VIDEO_SESSIONS_STORE_KEY);
                            if (localStoreRaw) {
                                const localStore = JSON.parse(localStoreRaw);
                                const sessionByMediaId = localStore?.state?.sessionByMediaId || {};
                                const activeSessionMediaId = localStore?.state?.activeSessionMediaId;
                                if (typeof activeSessionMediaId === 'string') {
                                    localCandidates.add(activeSessionMediaId);
                                }

                                for (const candidate of Array.from(localCandidates)) {
                                    const sessionState = sessionByMediaId?.[candidate];
                                    const entries = Array.isArray(sessionState?.attemptProgress) ? sessionState.attemptProgress : [];
                                    if (!entries.length) continue;
                                    const latest = entries[entries.length - 1];
                                    if (!latest || typeof latest.percent !== 'number' || typeof latest.recordedAt !== 'number') continue;
                                    const nearComplete = latest.percent >= 99 && latest.percent < 100;
                                    if (latest.percent <= 0 || latest.percent >= 100) continue;
                                    const recencyLimit = nearComplete ? NEAR_COMPLETE_RECENCY_MS : PROGRESS_RECENCY_MS;
                                    if (now - latest.recordedAt > recencyLimit) continue;

                                    hasActiveGeneratingVideo = true;
                                    console.log('[Grok Retry] Grace period check: Local session store shows active generation', {
                                        mediaId: candidate,
                                        percent: latest.percent,
                                        recordedAgoMs: now - latest.recordedAt,
                                        nearComplete,
                                        recencyLimit,
                                    });
                                    break;
                                }

                                if (!hasActiveGeneratingVideo && !sessionMediaId && typeof activeSessionMediaId === 'string') {
                                    const sessionState = sessionByMediaId?.[activeSessionMediaId];
                                    const entries = Array.isArray(sessionState?.attemptProgress) ? sessionState.attemptProgress : [];
                                    if (entries.length > 0) {
                                        const latest = entries[entries.length - 1];
                                        if (latest && typeof latest.percent === 'number' && typeof latest.recordedAt === 'number') {
                                            const nearComplete = latest.percent >= 99 && latest.percent < 100;
                                            if (latest.percent > 0 && latest.percent < 100) {
                                                const recencyLimit = nearComplete ? NEAR_COMPLETE_RECENCY_MS : PROGRESS_RECENCY_MS;
                                                if (now - latest.recordedAt <= recencyLimit) {
                                                    hasActiveGeneratingVideo = true;
                                                    console.log('[Grok Retry] Grace period check: Active session tracker shows generation', {
                                                        mediaId: activeSessionMediaId,
                                                        percent: latest.percent,
                                                        recordedAgoMs: now - latest.recordedAt,
                                                        nearComplete,
                                                        recencyLimit,
                                                    });
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            if (!hasActiveGeneratingVideo) {
                                const legacyKeys: string[] = [];
                                if (sessionMediaId) legacyKeys.push(`${SESSION_STORAGE_PREFIX}${sessionMediaId}`);
                                if (sessionPostId) legacyKeys.push(`${SESSION_STORAGE_PREFIX}${sessionPostId}`);

                                for (const key of legacyKeys) {
                                    const raw = sessionStorage.getItem(key);
                                    if (!raw) continue;
                                    const parsed = JSON.parse(raw);
                                    const entries = Array.isArray(parsed?.attemptProgress) ? parsed.attemptProgress : [];
                                    if (!entries.length) continue;
                                    const latest = entries[entries.length - 1];
                                    if (!latest || typeof latest.percent !== 'number' || typeof latest.recordedAt !== 'number') continue;
                                    const nearComplete = latest.percent >= 99 && latest.percent < 100;
                                    if (latest.percent <= 0 || latest.percent >= 100) continue;
                                    const recencyLimit = nearComplete ? NEAR_COMPLETE_RECENCY_MS : PROGRESS_RECENCY_MS;
                                    if (now - latest.recordedAt > recencyLimit) continue;

                                    hasActiveGeneratingVideo = true;
                                    console.log('[Grok Retry] Grace period check: Legacy session key shows active generation', {
                                        sessionKey: key,
                                        percent: latest.percent,
                                        recordedAgoMs: now - latest.recordedAt,
                                        nearComplete,
                                        recencyLimit,
                                    });
                                    break;
                                }
                            }
                        } catch (err) {
                            console.warn('[Grok Retry] Failed to inspect local progress during grace period:', err);
                        }
                    }

                    // If video is still generating, don't apply grace period logic yet
                    if (hasActiveGeneratingVideo && !hasCompletedVideos) {
                        if (!pendingRouteEval.lastDeferredLog || now - pendingRouteEval.lastDeferredLog > 2000) {
                            console.log('[Grok Retry] Deferring grace period check - video still generating');
                            pendingRouteEval.lastDeferredLog = now;
                        }
                        scheduleDeferredEvaluation(400);
                        return;
                    }

                    if (hasCompletedVideos) {
                        // Storage shows completion - trigger force reload to process the attempts
                        console.log('[Grok Retry] Grace period: Triggering force reload to process completed videos from Grok storage');
                        clearPendingRouteEval();
                        try {
                            if (w.__grok_force_reload) {
                                w.__grok_force_reload();
                            } else {
                                console.warn('[Grok Retry] __grok_force_reload not available');
                            }
                        } catch (e) {
                            console.warn('[Grok Retry] Failed to trigger force reload:', e);
                        }
                        return;
                    }

                    // No completion in storage AND no active generation - cancel the session (genuinely stuck)
                    console.warn('[Grok Retry] Grace period elapsed with no completion in Grok storage - canceling session', {
                        sessionPostId,
                        urlPostId,
                        sessionMediaId,
                    });
                    delete w.__grok_session_post_id;
                    delete w.__grok_session_media_id;
                    clearPendingRouteEval();
                    try {
                        w.__grok_test?.endSession?.('cancelled');
                    } catch (e) {
                        console.warn('[Grok Retry] Failed to end session:', e);
                    }
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
            clearPendingRouteEval({ resetLog: true });
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
