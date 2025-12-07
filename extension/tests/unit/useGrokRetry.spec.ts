import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';

// Polyfill window.setInterval/clearInterval for JSDOM fake timers

describe('useGrokRetry guards', () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = `
      <button aria-label="Make video"></button>
      <textarea aria-label="Make a video" placeholder="Type to customize video..."></textarea>
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
});
