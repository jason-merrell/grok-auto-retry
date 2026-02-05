import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useStreamModerationDetector } from '../../src/hooks/useStreamModerationDetector';
import { ingestGrokStreamPayload, resetGrokStreamStateForTests } from '../../src/lib/grokStream';

describe('useStreamModerationDetector', () => {
    beforeEach(() => {
        resetGrokStreamStateForTests();
    });

    afterEach(() => {
        resetGrokStreamStateForTests();
    });

    it('should detect moderation when stream reports moderated=true', async () => {
        const onModerationDetected = vi.fn();
        const parentPostId = 'test-parent-123';

        const { result } = renderHook(() =>
            useStreamModerationDetector({
                parentPostId,
                onModerationDetected,
                enabled: true,
            })
        );

        // Simulate prompt submission
        ingestGrokStreamPayload({
            result: {
                response: {
                    userResponse: {
                        responseId: 'user-response-1',
                        message: 'test prompt',
                        metadata: {
                            modelConfigOverride: {
                                modelMap: {
                                    videoGenModelConfig: {
                                        parentPostId,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        // Simulate video generation start
        ingestGrokStreamPayload({
            result: {
                response: {
                    streamingVideoGenerationResponse: {
                        videoId: 'video-123',
                        videoPostId: 'video-123',
                        parentPostId,
                        progress: 1,
                        moderated: false,
                        videoPrompt: 'test prompt',
                    },
                },
            },
        });

        // Simulate progress updates
        ingestGrokStreamPayload({
            result: {
                response: {
                    streamingVideoGenerationResponse: {
                        videoId: 'video-123',
                        videoPostId: 'video-123',
                        parentPostId,
                        progress: 50,
                        moderated: false,
                    },
                },
            },
        });

        // Simulate moderation at 100% (like the example)
        ingestGrokStreamPayload({
            result: {
                response: {
                    streamingVideoGenerationResponse: {
                        videoId: 'video-123',
                        videoPostId: 'video-123',
                        parentPostId,
                        progress: 100,
                        moderated: true, // Moderation detected!
                    },
                },
            },
        });

        // Wait for the hook to process the moderation
        await waitFor(() => {
            expect(onModerationDetected).toHaveBeenCalledTimes(1);
        });

        expect(result.current.lastProcessedAttempt).toBe('video-123');
        expect(result.current.latestAttempt?.moderated).toBe(true);
        expect(result.current.latestAttempt?.status).toBe('moderated');
    });

    it('should not detect moderation when disabled', async () => {
        const onModerationDetected = vi.fn();
        const parentPostId = 'test-parent-456';

        renderHook(() =>
            useStreamModerationDetector({
                parentPostId,
                onModerationDetected,
                enabled: false, // Disabled
            })
        );

        // Simulate moderated video
        ingestGrokStreamPayload({
            result: {
                response: {
                    streamingVideoGenerationResponse: {
                        videoId: 'video-456',
                        videoPostId: 'video-456',
                        parentPostId,
                        progress: 100,
                        moderated: true,
                    },
                },
            },
        });

        // Wait a bit to ensure it doesn't fire
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(onModerationDetected).not.toHaveBeenCalled();
    });

    it('should not fire duplicate detections for the same attempt', async () => {
        const onModerationDetected = vi.fn();
        const parentPostId = 'test-parent-789';

        renderHook(() =>
            useStreamModerationDetector({
                parentPostId,
                onModerationDetected,
                enabled: true,
            })
        );

        // Simulate moderation
        ingestGrokStreamPayload({
            result: {
                response: {
                    streamingVideoGenerationResponse: {
                        videoId: 'video-789',
                        videoPostId: 'video-789',
                        parentPostId,
                        progress: 100,
                        moderated: true,
                    },
                },
            },
        });

        await waitFor(() => {
            expect(onModerationDetected).toHaveBeenCalledTimes(1);
        });

        // Simulate the same moderation event again (shouldn't fire again)
        ingestGrokStreamPayload({
            result: {
                response: {
                    streamingVideoGenerationResponse: {
                        videoId: 'video-789',
                        videoPostId: 'video-789',
                        parentPostId,
                        progress: 100,
                        moderated: true,
                    },
                },
            },
        });

        // Wait a bit to ensure it doesn't fire again
        await new Promise((resolve) => setTimeout(resolve, 600));

        expect(onModerationDetected).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple attempts on the same parent', async () => {
        const onModerationDetected = vi.fn();
        const parentPostId = 'test-parent-multi';

        renderHook(() =>
            useStreamModerationDetector({
                parentPostId,
                onModerationDetected,
                enabled: true,
            })
        );

        // First attempt - moderated
        ingestGrokStreamPayload({
            result: {
                response: {
                    streamingVideoGenerationResponse: {
                        videoId: 'video-1',
                        videoPostId: 'video-1',
                        parentPostId,
                        progress: 100,
                        moderated: true,
                    },
                },
            },
        });

        await waitFor(() => {
            expect(onModerationDetected).toHaveBeenCalledTimes(1);
        });

        // Second attempt - also moderated
        ingestGrokStreamPayload({
            result: {
                response: {
                    streamingVideoGenerationResponse: {
                        videoId: 'video-2',
                        videoPostId: 'video-2',
                        parentPostId,
                        progress: 100,
                        moderated: true,
                    },
                },
            },
        });

        await waitFor(() => {
            expect(onModerationDetected).toHaveBeenCalledTimes(2);
        });
    });

    it('should reset when parentPostId changes', async () => {
        const onModerationDetected = vi.fn();
        let parentPostId = 'test-parent-1';

        const { rerender, result } = renderHook(
            ({ parentId }) =>
                useStreamModerationDetector({
                    parentPostId: parentId,
                    onModerationDetected,
                    enabled: true,
                }),
            { initialProps: { parentId: parentPostId } }
        );

        // Simulate moderation for first parent
        ingestGrokStreamPayload({
            result: {
                response: {
                    streamingVideoGenerationResponse: {
                        videoId: 'video-1',
                        videoPostId: 'video-1',
                        parentPostId: 'test-parent-1',
                        progress: 100,
                        moderated: true,
                    },
                },
            },
        });

        await waitFor(() => {
            expect(onModerationDetected).toHaveBeenCalledTimes(1);
        });

        expect(result.current.lastProcessedAttempt).toBe('video-1');

        // Change parent
        parentPostId = 'test-parent-2';
        rerender({ parentId: parentPostId });

        // lastProcessedAttempt should reset
        expect(result.current.lastProcessedAttempt).toBe(null);

        // Simulate moderation for new parent
        ingestGrokStreamPayload({
            result: {
                response: {
                    streamingVideoGenerationResponse: {
                        videoId: 'video-2',
                        videoPostId: 'video-2',
                        parentPostId: 'test-parent-2',
                        progress: 100,
                        moderated: true,
                    },
                },
            },
        });

        await waitFor(() => {
            expect(onModerationDetected).toHaveBeenCalledTimes(2);
        });

        expect(result.current.lastProcessedAttempt).toBe('video-2');
    });
});
