import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePageTitle } from '../../src/hooks/usePageTitle';
import type { SessionOutcome } from '../../src/hooks/useSessionStorage';

type TitleHookProps = {
    originalTitle: string;
    retryCount: number;
    maxRetries: number;
    autoRetryEnabled: boolean;
    isRateLimited?: boolean;
    videoGoal?: number;
    videosGenerated?: number;
    isSessionActive?: boolean;
    lastSessionOutcome?: SessionOutcome;
};

const renderPageTitleHook = (props: TitleHookProps) => {
    const defaults: TitleHookProps = {
        isRateLimited: false,
        videoGoal: 1,
        videosGenerated: 0,
        isSessionActive: true,
        lastSessionOutcome: 'idle',
        ...props,
    };

    return renderHook((currentProps: TitleHookProps) => {
        const mergedProps: Required<TitleHookProps> = {
            ...defaults,
            ...currentProps,
        } as Required<TitleHookProps>;

        return usePageTitle(
            mergedProps.originalTitle,
            mergedProps.retryCount,
            mergedProps.maxRetries,
            mergedProps.autoRetryEnabled,
            mergedProps.isRateLimited,
            mergedProps.videoGoal,
            mergedProps.videosGenerated,
            mergedProps.isSessionActive,
            mergedProps.lastSessionOutcome,
        );
    }, { initialProps: defaults });
};

describe('usePageTitle', () => {
    beforeEach(() => {
        document.title = 'Original Title';
    });

    it('restores the original title when auto retry is disabled or session inactive', () => {
        const { rerender } = renderPageTitleHook({
            originalTitle: 'Original Title',
            retryCount: 0,
            maxRetries: 3,
            autoRetryEnabled: false,
            isSessionActive: false,
        });

        expect(document.title).toBe('Original Title');

        rerender({
            originalTitle: 'Original Title',
            retryCount: 0,
            maxRetries: 3,
            autoRetryEnabled: true,
            isRateLimited: false,
            videoGoal: 1,
            videosGenerated: 0,
            isSessionActive: false,
        });

        expect(document.title).toBe('Original Title');
    });

    it('shows completion status when video goal reached', () => {
        renderPageTitleHook({
            originalTitle: 'Original Title',
            retryCount: 2,
            maxRetries: 6,
            autoRetryEnabled: true,
            videoGoal: 3,
            videosGenerated: 3,
        });

        expect(document.title).toBe('✅ 3/3 Complete - Original Title');
    });

    it('shows rate limited indicator when applicable', () => {
        renderPageTitleHook({
            originalTitle: 'Original Title',
            retryCount: 2,
            maxRetries: 6,
            autoRetryEnabled: true,
            isRateLimited: true,
        });

        expect(document.title).toBe('⏳ Rate Limited - Original Title');
    });

    it('shows failure indicator when retries exhausted', () => {
        const { rerender } = renderPageTitleHook({
            originalTitle: 'Original Title',
            retryCount: 5,
            maxRetries: 5,
            autoRetryEnabled: true,
            isSessionActive: true,
        });

        expect(document.title).toBe('🔄 5/5 Original Title');

        act(() => {
            rerender({
                originalTitle: 'Original Title',
                retryCount: 0,
                maxRetries: 5,
                autoRetryEnabled: true,
                isRateLimited: false,
                videoGoal: 1,
                videosGenerated: 0,
                isSessionActive: false,
            });
        });

        expect(document.title).toBe('❌ Original Title');
    });

    it('shows combined video and retry progress when video goal larger than one', () => {
        renderPageTitleHook({
            originalTitle: 'Original Title',
            retryCount: 2,
            maxRetries: 6,
            autoRetryEnabled: true,
            videoGoal: 4,
            videosGenerated: 1,
        });

        expect(document.title).toBe('🎬 1/4 | 🔄 2/6 Original Title');
    });

    it('shows retry progress when auto retry active for single goal', () => {
        renderPageTitleHook({
            originalTitle: 'Original Title',
            retryCount: 1,
            maxRetries: 5,
            autoRetryEnabled: true,
            videoGoal: 1,
            videosGenerated: 0,
        });

        expect(document.title).toBe('🔄 1/5 Original Title');
    });

    it('keeps the retry indicator on the final allowed retry while the session is active', () => {
        const { rerender } = renderHook(
            ({ retryCount, isSessionActive }: { retryCount: number; isSessionActive: boolean }) =>
                usePageTitle('Original Title', retryCount, 3, true, false, 1, 0, isSessionActive),
            {
                initialProps: { retryCount: 1, isSessionActive: true },
            }
        );

        expect(document.title).toBe('🔄 1/3 Original Title');

        act(() => {
            rerender({ retryCount: 3, isSessionActive: true });
        });
        expect(document.title).toBe('🔄 3/3 Original Title');

        act(() => {
            rerender({ retryCount: 3, isSessionActive: false });
        });
        expect(document.title).toBe('❌ Original Title');
    });

    it('shows success summary after a single-goal session completes', () => {
        const { rerender } = renderPageTitleHook({
            originalTitle: 'Original Title',
            retryCount: 2,
            maxRetries: 2,
            autoRetryEnabled: true,
            videoGoal: 1,
            videosGenerated: 1,
            isSessionActive: true,
        });

        expect(document.title).toBe('🔄 2/2 Original Title');

        act(() => {
            rerender({
                originalTitle: 'Original Title',
                retryCount: 0,
                maxRetries: 2,
                autoRetryEnabled: true,
                isRateLimited: false,
                videoGoal: 1,
                videosGenerated: 0,
                isSessionActive: false,
            });
        });

        expect(document.title).toBe('✅ 1/1 Complete - Original Title');
    });

    it('shows a success title when the session outcome reports success but counters reset', () => {
        renderPageTitleHook({
            originalTitle: 'Original Title',
            retryCount: 0,
            maxRetries: 2,
            autoRetryEnabled: true,
            videoGoal: 1,
            videosGenerated: 0,
            isSessionActive: false,
            lastSessionOutcome: 'success',
        });

        expect(document.title).toBe('✅ 1/1 Complete - Original Title');
    });

    it('persists completion status after a session ends', () => {
        const { rerender } = renderPageTitleHook({
            originalTitle: 'Original Title',
            retryCount: 1,
            maxRetries: 3,
            autoRetryEnabled: true,
            videoGoal: 3,
            videosGenerated: 2,
            isSessionActive: true,
        });

        expect(document.title).toBe('🎬 2/3 | 🔄 1/3 Original Title');

        act(() => {
            rerender({
                originalTitle: 'Original Title',
                retryCount: 1,
                maxRetries: 3,
                autoRetryEnabled: true,
                isRateLimited: false,
                videoGoal: 3,
                videosGenerated: 3,
                isSessionActive: true,
            });
        });
        expect(document.title).toBe('✅ 3/3 Complete - Original Title');

        act(() => {
            rerender({
                originalTitle: 'Original Title',
                retryCount: 0,
                maxRetries: 3,
                autoRetryEnabled: true,
                isRateLimited: false,
                videoGoal: 3,
                videosGenerated: 0,
                isSessionActive: false,
            });
        });
        expect(document.title).toBe('✅ 3/3 Complete - Original Title');
    });

    it('shows failure summary with video progress after retries are exhausted', () => {
        const { rerender } = renderPageTitleHook({
            originalTitle: 'Original Title',
            retryCount: 3,
            maxRetries: 3,
            autoRetryEnabled: true,
            videoGoal: 3,
            videosGenerated: 1,
            isSessionActive: true,
        });

        expect(document.title).toBe('🔄 3/3 Original Title');

        act(() => {
            rerender({
                originalTitle: 'Original Title',
                retryCount: 0,
                maxRetries: 3,
                autoRetryEnabled: true,
                isRateLimited: false,
                videoGoal: 3,
                videosGenerated: 0,
                isSessionActive: false,
            });
        });

        expect(document.title).toBe('❌🎬 1/3 - Original Title');
    });

    it('shows 0/x failure summary when no videos were generated', () => {
        const { rerender } = renderPageTitleHook({
            originalTitle: 'Original Title',
            retryCount: 2,
            maxRetries: 2,
            autoRetryEnabled: true,
            videoGoal: 2,
            videosGenerated: 0,
            isSessionActive: true,
        });

        expect(document.title).toBe('🔄 2/2 Original Title');

        act(() => {
            rerender({
                originalTitle: 'Original Title',
                retryCount: 0,
                maxRetries: 2,
                autoRetryEnabled: true,
                isRateLimited: false,
                videoGoal: 2,
                videosGenerated: 0,
                isSessionActive: false,
            });
        });

        expect(document.title).toBe('❌🎬 0/2 - Original Title');
    });
});
