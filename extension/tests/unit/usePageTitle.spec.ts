import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePageTitle } from '../../src/hooks/usePageTitle';

type TitleHookProps = {
    originalTitle: string;
    retryCount: number;
    maxRetries: number;
    autoRetryEnabled: boolean;
    isRateLimited?: boolean;
    videoGoal?: number;
    videosGenerated?: number;
    isSessionActive?: boolean;
};

const renderPageTitleHook = (props: TitleHookProps) => {
    const merged: Required<TitleHookProps> = {
        isRateLimited: false,
        videoGoal: 1,
        videosGenerated: 0,
        isSessionActive: true,
        ...props,
    } as Required<TitleHookProps>;

    return renderHook((currentProps: Required<TitleHookProps>) =>
        usePageTitle(
            currentProps.originalTitle,
            currentProps.retryCount,
            currentProps.maxRetries,
            currentProps.autoRetryEnabled,
            currentProps.isRateLimited,
            currentProps.videoGoal,
            currentProps.videosGenerated,
            currentProps.isSessionActive,
        ),
        { initialProps: merged });
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
        renderPageTitleHook({
            originalTitle: 'Original Title',
            retryCount: 5,
            maxRetries: 5,
            autoRetryEnabled: true,
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
});
