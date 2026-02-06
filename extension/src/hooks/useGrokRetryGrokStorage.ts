import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Monitors Grok's internal sessionStorage for video/image data.
 * 
 * This hook provides real-time access to Grok's `useMediaStore` by:
 * - Polling sessionStorage['useMediaStore'] at configurable intervals
 * - Extracting video and image data for specific posts
 * - Detecting new video completions (both successful and moderated)
 * - Tracking post relationships (parent images → generated videos)
 * 
 * **CRITICAL**: Videos appear in Grok storage ONLY AFTER completion.
 * Do not use this for real-time progress tracking during generation.
 * Use DOM observation (progress button) for that instead.
 * 
 * This is the authoritative source for:
 * - Video completion confirmation
 * - Moderation status detection
 * - Media URL retrieval
 * - Video metadata (duration, dimensions, thumbnails)
 * 
 * @param parentPostId - Post ID to monitor (usually the image's post)
 * @param options.onVideoDetected - Callback when new video appears
 * @param options.onImageDetected - Optional callback when image appears
 * @param options.pollInterval - Polling frequency in ms (default: 1000)
 * @returns Current videos and images for the post
 * 
 * @example
 * ```tsx
 * useGrokRetryGrokStorage(postId, {
 *   onVideoDetected: (video) => {
 *     if (!video.moderated) {
 *       console.log('Success!', video.mediaUrl);
 *     }
 *   }
 * });
 * ```
 */

/**
 * Grok's video structure (subset of fields we need from sessionStorage['useMediaStore']).
 * 
 * NOTE: Videos appear in storage ONLY AFTER completion (both moderated and successful).
 * Do not use this for real-time progress tracking during generation.
 */
export interface GrokVideo {
    videoId: string;
    parentPostId: string;
    progress: number;
    moderated: boolean;
    mediaUrl: string;
    videoUrl: string;
    thumbnailImageUrl: string;
    videoPrompt: string;
    createTime: string;
    videoDuration: number;
    mode: string;
    width: number;
    height: number;
}

/**
 * Grok's image structure (subset of fields we need)
 */
export interface GrokImage {
    id: string;
    prompt: string;
    originalPrompt: string;
    mediaUrl: string;
    createTime: string;
    moderated: boolean;
    width: number;
    height: number;
}

/**
 * Combined data we expose from Grok's storage
 */
export interface GrokStorageData {
    videos: GrokVideo[];
    imageData: GrokImage | null;

    // Derived counts
    videosGenerated: number;
    creditsUsed: number;
    moderatedCount: number;
    successfulCount: number;

    // Video groups
    videoIds: string[];
    moderatedVideoIds: string[];
    successfulVideoIds: string[];
}

interface UseGrokRetryGrokStorageOptions {
    /**
     * Called when any new video is detected (moderated or successful)
     */
    onVideoDetected?: (video: GrokVideo) => void;

    /**
     * Called specifically when a moderated video is detected
     */
    onModerationDetected?: (video: GrokVideo) => void;

    /**
     * How often to poll sessionStorage (default: 250ms)
     */
    pollInterval?: number;

    /**
     * Enable debug logging
     */
    debug?: boolean;
}

/**
 * Find the parent image ID by searching for a video post ID in Grok's storage
 * This is used when we only have the video post ID but need the parent image ID
 */
function findParentImageIdByVideoId(videoPostId: string): string | null {
    try {
        const storeData = sessionStorage.getItem('useMediaStore');
        if (!storeData) return null;

        const store = JSON.parse(storeData);
        const videoByMediaId = store.state?.videoByMediaId;

        if (!videoByMediaId || typeof videoByMediaId !== 'object') {
            return null;
        }

        // Search all parent image IDs for one that contains this video
        for (const [parentId, videos] of Object.entries(videoByMediaId)) {
            if (Array.isArray(videos)) {
                const found = videos.find((v: any) => v?.videoId === videoPostId);
                if (found) {
                    console.log(`[Grok Storage] Found parent image ID for video ${videoPostId}: ${parentId}`);
                    return parentId;
                }
            }
        }

        return null;
    } catch (error) {
        console.error('[Grok Storage] Error finding parent image ID:', error);
        return null;
    }
}

/**
 * Hook to monitor Grok's native sessionStorage for video generation state.
 * 
 * This provides:
 * - Moderation detection validation
 * - Video count validation
 * - Session data enrichment (prompts, thumbnails, metadata)
 * - Fallback detection if UI structure changes
 * 
 * @param idHint - Either a parent image ID or video post ID (will auto-detect)
 * @param options - Configuration options
 * @returns GrokStorageData or null if no data available
 * 
 * @example
 * ```typescript
 * const grokData = useGrokRetryGrokStorage(currentPostId, {
 *   onModerationDetected: (video) => {
 *     console.log('Moderation confirmed:', video.videoId);
 *     handleModeration(video);
 *   }
 * });
 * 
 * // Access derived counts
 * const totalVideos = grokData?.videosGenerated ?? 0;
 * const credits = grokData?.creditsUsed ?? 0;
 * ```
 */
export function useGrokRetryGrokStorage(
    idHint: string | null,
    options: UseGrokRetryGrokStorageOptions = {}
): GrokStorageData | null {
    const {
        onVideoDetected,
        onModerationDetected,
        pollInterval = 250,
        debug = false
    } = options;

    const [data, setData] = useState<GrokStorageData | null>(null);
    // Track video state changes instead of just IDs to detect moderation on retries
    const lastVideoStateRef = useRef<string>('');
    const lastModeratedCountRef = useRef(0);
    const resolvedParentIdRef = useRef<string | null>(null);

    const parseGrokStorage = useCallback((): GrokStorageData | null => {
        if (!idHint) return null;

        // Use cached parent ID if available
        let parentImageId = resolvedParentIdRef.current;

        // If not cached, try to resolve it
        if (!parentImageId) {
            try {
                const storeData = sessionStorage.getItem('useMediaStore');
                if (!storeData) {
                    if (debug) {
                        console.log('[Grok Storage] No useMediaStore in sessionStorage');
                    }
                    return null;
                }

                const store = JSON.parse(storeData);
                const videoByMediaId = store.state?.videoByMediaId;

                // Check if idHint is already a parent image ID (exists as key)
                if (videoByMediaId && videoByMediaId[idHint]) {
                    parentImageId = idHint;
                    resolvedParentIdRef.current = parentImageId;
                    if (debug) {
                        console.log('[Grok Storage] Using provided ID as parent image ID:', parentImageId);
                    }
                } else {
                    // Try to find parent by searching for video ID
                    parentImageId = findParentImageIdByVideoId(idHint);
                    if (parentImageId) {
                        resolvedParentIdRef.current = parentImageId;
                    } else {
                        // Suppress warning during navigation grace periods
                        const isNavigating = (window as any).__grok_route_eval_suppress_until;
                        const now = Date.now();
                        if (!isNavigating || now > isNavigating) {
                            if (debug) {
                                console.log('[Grok Storage] Could not resolve parent image ID for:', idHint);
                            }
                        }
                        return null;
                    }
                }
            } catch (error) {
                console.error('[Grok Storage] Error resolving parent ID:', error);
                return null;
            }
        }

        if (!parentImageId) return null;

        try {
            const storeData = sessionStorage.getItem('useMediaStore');
            if (!storeData) {
                if (debug) {
                    console.log('[Grok Storage] No useMediaStore in sessionStorage');
                }
                return null;
            }

            const store = JSON.parse(storeData);

            // Validate structure version
            if (store.version !== 1) {
                console.warn('[Grok Storage] Unexpected store version:', store.version);
            }

            // Extract videos for this parent image
            const videos: GrokVideo[] = (store.state?.videoByMediaId?.[parentImageId] || [])
                .filter((v: any) => v && v.videoId); // Filter out null/undefined entries

            // Extract image metadata
            const imageData: GrokImage | null =
                store.state?.imageByMediaId?.[parentImageId]?.[0] || null;

            // Compute derived values
            const moderatedVideos = videos.filter(v => v.moderated);
            const successfulVideos = videos.filter(v => !v.moderated && v.mediaUrl);

            const result: GrokStorageData = {
                videos,
                imageData,
                videosGenerated: videos.length,
                creditsUsed: videos.length, // Each video = 1 credit
                moderatedCount: moderatedVideos.length,
                successfulCount: successfulVideos.length,
                videoIds: videos.map(v => v.videoId),
                moderatedVideoIds: moderatedVideos.map(v => v.videoId),
                successfulVideoIds: successfulVideos.map(v => v.videoId)
            };

            if (debug) {
                console.log('[Grok Storage] Parsed data:', {
                    parentImageId,
                    videoCount: result.videosGenerated,
                    moderatedCount: result.moderatedCount,
                    successfulCount: result.successfulCount
                });
            }

            return result;
        } catch (error) {
            console.error('[Grok Storage] Parse error:', error);
            return null;
        }
    }, [idHint, debug]);

    useEffect(() => {
        if (!idHint) {
            setData(null);
            return;
        }

        // Initial parse
        const initialData = parseGrokStorage();
        if (initialData) {
            setData(initialData);
        }

        // Poll for updates
        const checkInterval = setInterval(() => {
            const newData = parseGrokStorage();

            if (newData) {
                // Check for video state changes (handles retry moderations)
                if (onVideoDetected || onModerationDetected) {
                    // Serialize current state for comparison
                    const currentState = JSON.stringify(
                        newData.videos.map(v => ({
                            id: v.videoId,
                            moderated: v.moderated,
                            progress: v.progress,
                            mediaUrl: v.mediaUrl
                        }))
                    );

                    // Detect state changes
                    if (currentState !== lastVideoStateRef.current) {
                        const previousVideos = lastVideoStateRef.current
                            ? JSON.parse(lastVideoStateRef.current)
                            : [];

                        // Find new or changed videos
                        newData.videos.forEach(video => {
                            const prevVideo = previousVideos.find((p: any) => p.id === video.videoId);
                            const isNewVideo = !prevVideo;
                            const moderationChanged = prevVideo && !prevVideo.moderated && video.moderated;

                            if (isNewVideo) {
                                if (debug) {
                                    console.log('[Grok Storage] New video detected:', {
                                        videoId: video.videoId,
                                        moderated: video.moderated,
                                        createTime: video.createTime
                                    });
                                }
                                onVideoDetected?.(video);

                                if (video.moderated) {
                                    if (debug) {
                                        console.log('[Grok Storage] New moderated video detected:', video.videoId);
                                    }
                                    onModerationDetected?.(video);
                                }
                            } else if (moderationChanged) {
                                if (debug) {
                                    console.log('[Grok Storage] Video moderation status changed:', {
                                        videoId: video.videoId,
                                        wasModerated: prevVideo.moderated,
                                        nowModerated: video.moderated
                                    });
                                }
                                onModerationDetected?.(video);
                            }
                        });

                        lastVideoStateRef.current = currentState;
                    }

                    // Track moderation count for additional safety
                    if (newData.moderatedCount > lastModeratedCountRef.current) {
                        const countDiff = newData.moderatedCount - lastModeratedCountRef.current;
                        if (debug) {
                            console.log('[Grok Storage] Moderation count increased:', {
                                from: lastModeratedCountRef.current,
                                to: newData.moderatedCount,
                                diff: countDiff
                            });
                        }
                        lastModeratedCountRef.current = newData.moderatedCount;
                    }
                }

                setData(newData);
            }
        }, pollInterval);

        return () => {
            clearInterval(checkInterval);
        };
    }, [idHint, pollInterval, parseGrokStorage, onVideoDetected, onModerationDetected, debug]);

    // Clear state tracking when parent changes
    useEffect(() => {
        lastVideoStateRef.current = '';
        lastModeratedCountRef.current = 0;
        if (debug) {
            console.log('[Grok Storage] ID changed, resetting state tracking:', idHint);
        }
    }, [idHint, debug]);

    return data;
}
