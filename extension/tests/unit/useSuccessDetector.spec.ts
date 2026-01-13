import { describe, it, beforeEach, beforeAll, afterEach, vi, type Mock } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { ingestGrokStreamPayload, resetGrokStreamStateForTests } from '../../src/lib/grokStream';
import { strict as assert } from 'node:assert';

vi.mock('../../src/hooks/usePostId', () => ({
    usePostId: vi.fn(() => ({ postId: 'post-1', mediaId: 'media-1' })),
}));

let useSuccessDetector: typeof import('../../src/hooks/useSuccessDetector').useSuccessDetector;
let usePostId: typeof import('../../src/hooks/usePostId').usePostId;

beforeAll(async () => {
    ({ useSuccessDetector } = await import('../../src/hooks/useSuccessDetector'));
    ({ usePostId } = await import('../../src/hooks/usePostId'));
});

const emitProgress = (progress: number, overrides: Partial<Record<'videoId' | 'videoPostId' | 'parentPostId', string>> = {}) => {
    act(() => {
        ingestGrokStreamPayload({
            result: {
                response: {
                    streamingVideoGenerationResponse: {
                        videoId: overrides.videoId ?? 'video-1',
                        videoPostId: overrides.videoPostId ?? overrides.videoId ?? 'video-1',
                        parentPostId: overrides.parentPostId ?? 'media-1',
                        progress,
                    },
                },
            },
        });
    });
};

describe('useSuccessDetector', () => {
    beforeEach(() => {
        resetGrokStreamStateForTests();
        const postIdMock = usePostId as unknown as Mock;
        postIdMock.mockReturnValue({ postId: 'post-1', mediaId: 'media-1' });
        delete (window as any).__grok_session_media_id;
        delete (window as any).__grok_session_post_id;
        if (!(window as any).__grok_test) {
            (window as any).__grok_test = {};
        }
        delete (window as any).__grok_test.__retrySessionKey;
    });

    afterEach(() => {
        cleanup();
    });

    it('uses mocked post id hook', () => {
        const { result } = renderHook(() => usePostId());
        assert.deepEqual(result.current, { postId: 'post-1', mediaId: 'media-1' });
    });

    it('invokes onSuccess when attempt completes', () => {
        const onSuccess = vi.fn();
        renderHook(() => useSuccessDetector(onSuccess, true));

        emitProgress(40);
        assert.equal(onSuccess.mock.calls.length, 0);

        emitProgress(100);
        assert.equal(onSuccess.mock.calls.length, 1);
    });

    it('ignores updates while disabled but fires once re-enabled', () => {
        const onSuccess = vi.fn();
        const { rerender } = renderHook(({ enabled }) => useSuccessDetector(onSuccess, enabled), {
            initialProps: { enabled: false },
        });

        emitProgress(100);
        assert.equal(onSuccess.mock.calls.length, 0);

        rerender({ enabled: true });
        assert.equal(onSuccess.mock.calls.length, 1);
    });

    it('only fires once per completed attempt', () => {
        const onSuccess = vi.fn();
        renderHook(() => useSuccessDetector(onSuccess, true));

        emitProgress(100);
        assert.equal(onSuccess.mock.calls.length, 1);

        emitProgress(100);
        assert.equal(onSuccess.mock.calls.length, 1);
    });

    it('fires again when a new attempt id completes', () => {
        const onSuccess = vi.fn();
        renderHook(() => useSuccessDetector(onSuccess, true));

        emitProgress(100, { videoId: 'video-1', videoPostId: 'video-1' });
        assert.equal(onSuccess.mock.calls.length, 1);

        emitProgress(100, { videoId: 'video-2', videoPostId: 'video-2' });
        assert.equal(onSuccess.mock.calls.length, 2);
    });

    it('ignores attempts for other parent posts', () => {
        const onSuccess = vi.fn();
        renderHook(() => useSuccessDetector(onSuccess, true));

        emitProgress(100, { parentPostId: 'media-2', videoId: 'video-x', videoPostId: 'video-x' });
        assert.equal(onSuccess.mock.calls.length, 0);

        emitProgress(100, { parentPostId: 'media-1', videoId: 'video-y', videoPostId: 'video-y' });
        assert.equal(onSuccess.mock.calls.length, 1);
    });

    it('falls back to active session media key when post hook returns null', () => {
        const postIdMock = usePostId as unknown as Mock;
        postIdMock.mockReturnValue({ postId: 'post-1', mediaId: null });
        (window as any).__grok_session_media_id = 'media-1';

        const onSuccess = vi.fn();
        renderHook(() => useSuccessDetector(onSuccess, true));

        emitProgress(100, { parentPostId: 'media-1', videoId: 'video-1', videoPostId: 'video-1' });
        assert.equal(onSuccess.mock.calls.length, 1);
    });

    it('uses retry bridge session key fallback when available', () => {
        const postIdMock = usePostId as unknown as Mock;
        postIdMock.mockReturnValue({ postId: 'post-1', mediaId: null });
        (window as any).__grok_test = (window as any).__grok_test || {};
        (window as any).__grok_test.__retrySessionKey = 'media-bridge';

        const onSuccess = vi.fn();
        renderHook(() => useSuccessDetector(onSuccess, true));

        emitProgress(100, { parentPostId: 'media-bridge', videoId: 'video-bridge', videoPostId: 'video-bridge' });
        assert.equal(onSuccess.mock.calls.length, 1);
    });
});
