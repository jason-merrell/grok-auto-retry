import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, act, cleanup } from '@testing-library/react';
import { ingestGrokStreamPayload, resetGrokStreamStateForTests } from '../../src/lib/grokStream';

// We'll dynamically import the hook to avoid DOM dependencies during module load

describe('useModerationDetector debounce + fingerprint', () => {
    beforeEach(() => {
        window.chrome.storage.sync.set({ grokRetry_globalSettings: undefined });
        document.body.innerHTML = '<div id="root"></div>';
        // Basic structure to simulate notification toasts
        const section = document.createElement('div');
        section.setAttribute('data-notifications', 'section');
        section.innerHTML = '<ul><li class="toast" data-visible="true">Your content violates our guidelines</li></ul>';
        document.body.appendChild(section);
    });

    it('guards against scheduling multiple timeouts for same event', async () => {
        window.chrome.storage.sync.set({
            grokRetry_globalSettings: {
                customSelectors: {
                    notificationSection: '[data-notifications="section"]',
                },
            },
        });

        const mod = await import('../../src/hooks/useModerationDetector');

        const onDetected = vi.fn();
        renderHook(() =>
            mod.useModerationDetector({ onModerationDetected: onDetected, enabled: true })
        );

        // Two rapid mutations: emulate by changing DOM attributes quickly
        const toast = document.querySelector('li.toast')!;
        act(() => {
            toast.setAttribute('data-visible', 'true');
            toast.textContent = 'Your content violates our guidelines';
        });

        // Trigger observer callbacks twice rapidly
        (global as any).__triggerMutations();
        (global as any).__triggerMutations();

        // Advance small debounce window
        await act(async () => {
            vi.advanceTimersByTime(150);
        });

        // Only one detection should be scheduled/called
        expect(onDetected.mock.calls.length <= 1).toBe(true);
    });
});

describe('useModerationDetector stream-based detection', () => {
    beforeEach(() => {
        resetGrokStreamStateForTests();
        document.body.innerHTML = '<div id="root"></div>';
    });

    afterEach(() => {
        cleanup();
    });

    const emitModeration = (
        overrides: Partial<Record<'videoId' | 'videoPostId' | 'parentPostId', string>> & { progress?: number } = {}
    ) => {
        act(() => {
            ingestGrokStreamPayload({
                result: {
                    response: {
                        streamingVideoGenerationResponse: {
                            videoId: overrides.videoId ?? 'video-1',
                            videoPostId: overrides.videoPostId ?? overrides.videoId ?? 'video-1',
                            parentPostId: overrides.parentPostId ?? 'parent-1',
                            progress: overrides.progress ?? 50,
                            moderated: true,
                        },
                    },
                },
            });
        });
    };

    it('fires onModerationDetected when stream reports moderated attempt', async () => {
        const mod = await import('../../src/hooks/useModerationDetector');
        const onDetected = vi.fn();
        renderHook(() =>
            mod.useModerationDetector({
                onModerationDetected: onDetected,
                enabled: true,
                parentPostId: 'parent-1',
            })
        );

        emitModeration();
        expect(onDetected).toHaveBeenCalledTimes(1);
    });

    it('does not fire for moderated attempts of a different parent', async () => {
        const mod = await import('../../src/hooks/useModerationDetector');
        const onDetected = vi.fn();
        renderHook(() =>
            mod.useModerationDetector({
                onModerationDetected: onDetected,
                enabled: true,
                parentPostId: 'parent-1',
            })
        );

        emitModeration({ parentPostId: 'parent-other', videoId: 'video-other' });
        expect(onDetected).not.toHaveBeenCalled();
    });

    it('does not fire twice for the same moderated attempt', async () => {
        const mod = await import('../../src/hooks/useModerationDetector');
        const onDetected = vi.fn();
        renderHook(() =>
            mod.useModerationDetector({
                onModerationDetected: onDetected,
                enabled: true,
                parentPostId: 'parent-1',
            })
        );

        emitModeration();
        emitModeration(); // same videoId
        expect(onDetected).toHaveBeenCalledTimes(1);
    });

    it('fires again for a new moderated attempt after cooldown', async () => {
        const mod = await import('../../src/hooks/useModerationDetector');
        const onDetected = vi.fn();
        renderHook(() =>
            mod.useModerationDetector({
                onModerationDetected: onDetected,
                enabled: true,
                parentPostId: 'parent-1',
            })
        );

        emitModeration({ videoId: 'video-1', videoPostId: 'video-1' });
        expect(onDetected).toHaveBeenCalledTimes(1);

        // Advance past cooldown (5s)
        vi.advanceTimersByTime(5100);

        emitModeration({ videoId: 'video-2', videoPostId: 'video-2' });
        expect(onDetected).toHaveBeenCalledTimes(2);
    });

    it('skips stream moderation when cooldown is active', async () => {
        const mod = await import('../../src/hooks/useModerationDetector');
        const onDetected = vi.fn();
        renderHook(() =>
            mod.useModerationDetector({
                onModerationDetected: onDetected,
                enabled: true,
                parentPostId: 'parent-1',
            })
        );

        emitModeration({ videoId: 'video-1', videoPostId: 'video-1' });
        expect(onDetected).toHaveBeenCalledTimes(1);

        // Within cooldown — new attempt but should be skipped
        emitModeration({ videoId: 'video-2', videoPostId: 'video-2' });
        expect(onDetected).toHaveBeenCalledTimes(1);
    });
});
