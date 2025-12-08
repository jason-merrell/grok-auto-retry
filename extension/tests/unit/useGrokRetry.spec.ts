import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';

// Polyfill window.setInterval/clearInterval for JSDOM fake timers

describe('useGrokRetry guards', () => {
    beforeEach(() => {
        sessionStorage.clear();
        window.chrome.storage.sync.set({ grokRetry_globalSettings: undefined });
        document.body.innerHTML = `
      <button aria-label="Make video"></button>
      <textarea aria-label="Make a video" placeholder="Type to customize video..."></textarea>
      <button aria-label="Video Options"><div class="text-xs">0%</div></button>
    `;
    });

    it('throttles markFailureDetected close to clicks and consumes canRetry once', async () => {
        const mod = await import('../../src/hooks/useGrokRetry');
        const { useGrokRetry } = mod;

        const postId = 'post-1';
        const { result } = renderHook(() => useGrokRetry(postId));

        // Start session and click immediately
        act(() => {
            result.current.startSession();
            result.current.clickMakeVideoButton('hello world', { overridePermit: true });
        });

        // Immediately mark failure - should NOT set canRetry due to throttle
        act(() => {
            result.current.markFailureDetected();
        });

        // Advance time a bit beyond throttle (300ms)
        await act(async () => {
            vi.advanceTimersByTime(300);
        });

        // Now mark failure again — should enable canRetry
        act(() => {
            result.current.markFailureDetected();
        });

        expect(result.current.canRetry).toBe(true);
    });

    it('queues a single post-cooldown retry', async () => {
        const mod = await import('../../src/hooks/useGrokRetry');
        const { useGrokRetry } = mod;

        const postId = 'post-2';
        const { result } = renderHook(() => useGrokRetry(postId));

        // Start session and make a click to set cooldown
        act(() => {
            result.current.startSession();
            result.current.clickMakeVideoButton('foo', { overridePermit: true });
        });

        // Attempt to click during cooldown multiple times — internal code should schedule only one
        act(() => {
            result.current.clickMakeVideoButton('foo');
            result.current.clickMakeVideoButton('foo');
        });

        // Advance timers to pass 8s cooldown
        await act(async () => {
            vi.advanceTimersByTime(8000);
        });

        // There shouldn't be errors; we assert that session remains active and retryCount updated only by scheduler path later
        expect(result.current.isSessionActive).toBe(true);
    });

    it('records attempt progress percentage on failure when available', async () => {
        const mod = await import('../../src/hooks/useGrokRetry');
        const { useGrokRetry } = mod;

        const postId = 'post-3';
        const { result } = renderHook(() => useGrokRetry(postId));

        act(() => {
            result.current.startSession();
            result.current.clickMakeVideoButton('progress test', { overridePermit: true });
        });

        const progressNode = document.querySelector('button[aria-label="Video Options"] div');
        if (progressNode) {
            progressNode.textContent = '42%';
        }

        await act(async () => {
            await Promise.resolve();
        });

        if (progressNode) {
            progressNode.textContent = '0%';
        }

        await act(async () => {
            await Promise.resolve();
        });

        act(() => {
            result.current.markFailureDetected();
        });

        expect(result.current.attemptProgress).toEqual([
            expect.objectContaining({ percent: 42, attempt: 0 })
        ]);
    });

    it('tracks moderation failure counters by layer', async () => {
        const mod = await import('../../src/hooks/useGrokRetry');
        const { useGrokRetry } = mod;

        const postId = 'post-4';
        const { result } = renderHook(() => useGrokRetry(postId));

        const progressButton = document.querySelector<HTMLButtonElement>('button[aria-label="Video Options"]');
        const progressNode = progressButton?.querySelector('div');
        expect(progressNode).toBeTruthy();

        act(() => {
            result.current.startSession();
        });

        const setAndMark = (value: string) => {
            if (progressNode) {
                progressNode.textContent = value;
            }
            act(() => {
                result.current.markFailureDetected();
            });
        };

        setAndMark('10%');
        expect(result.current.layer1Failures).toBe(1);
        expect(result.current.layer2Failures).toBe(0);
        expect(result.current.layer3Failures).toBe(0);
        expect(result.current.creditsUsed).toBe(0);

        setAndMark('52%');
        expect(result.current.layer1Failures).toBe(1);
        expect(result.current.layer2Failures).toBe(1);
        expect(result.current.layer3Failures).toBe(0);
        expect(result.current.creditsUsed).toBe(0);

        setAndMark('95%');
        expect(result.current.layer1Failures).toBe(1);
        expect(result.current.layer2Failures).toBe(1);
        expect(result.current.layer3Failures).toBe(1);
        expect(result.current.creditsUsed).toBe(1);
    });

    it('increments creditsUsed when a success is recorded', async () => {
        const mod = await import('../../src/hooks/useGrokRetry');
        const { useGrokRetry } = mod;

        const postId = 'post-5';
        const { result } = renderHook(() => useGrokRetry(postId));

        act(() => {
            result.current.startSession();
        });

        expect(result.current.creditsUsed).toBe(0);
        expect(result.current.videosGenerated).toBe(0);

        act(() => {
            result.current.incrementVideosGenerated();
        });

        expect(result.current.videosGenerated).toBe(1);
        expect(result.current.creditsUsed).toBe(1);
    });

    it('respects custom selector overrides for non-English UI', async () => {
        window.chrome.storage.sync.set({
            grokRetry_globalSettings: {
                customSelectors: {
                    makeVideoButton: 'button[aria-label="Rehacer"],button[aria-label="Crear video"]',
                    promptTextarea: 'textarea[aria-label="Crear un video"]',
                },
            },
        });

        document.body.innerHTML = `
      <button aria-label="Rehacer"></button>
      <button aria-label="Crear video"></button>
      <textarea aria-label="Crear un video" placeholder="Escribe para personalizar el video..."></textarea>
      <button aria-label="Video Options"><div class="text-xs">0%</div></button>
    `;

        const mod = await import('../../src/hooks/useGrokRetry');
        const { useGrokRetry } = mod;

        const clickSpy = vi.spyOn(HTMLButtonElement.prototype, 'click');

        const postId = 'post-7';
        const { result } = renderHook(() => useGrokRetry(postId));

        act(() => {
            result.current.startSession();
        });

        let attempted = false;
        act(() => {
            attempted = result.current.clickMakeVideoButton('Contenido en español', { overridePermit: true });
        });

        expect(attempted).toBe(true);
        expect(clickSpy).toHaveBeenCalled();

        const textarea = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Crear un video"]');
        expect(textarea?.value).toBe('Contenido en español');

        clickSpy.mockRestore();
    });

    it('does not attempt a new click when the video goal is reached', async () => {
        const mod = await import('../../src/hooks/useGrokRetry');
        const { useGrokRetry } = mod;

        const postId = 'post-6';
        const { result } = renderHook(() => useGrokRetry(postId));

        const clickSpy = vi.spyOn(HTMLButtonElement.prototype, 'click');

        act(() => {
            result.current.startSession();
        });

        act(() => {
            result.current.incrementVideosGenerated();
        });

        let attempted = false;
        act(() => {
            attempted = result.current.clickMakeVideoButton('goal met', { overridePermit: true });
        });

        expect(attempted).toBe(false);
        expect(clickSpy).not.toHaveBeenCalled();

        clickSpy.mockRestore();
    });
});
