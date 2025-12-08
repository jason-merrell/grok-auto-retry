import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';

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
        renderHook(() => mod.useModerationDetector(onDetected, true));

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
