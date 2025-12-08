import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRouteMatch } from '../../src/hooks/useRouteMatch';

const setPathname = (path: string) => {
    window.history.replaceState({}, '', path);
};

const flushEffects = async () => {
    await act(async () => {
        await Promise.resolve();
    });
};

const renderRouteHook = async (pattern: string) => {
    let hookResult: ReturnType<typeof renderHook> | undefined;
    await act(async () => {
        hookResult = renderHook(() => useRouteMatch(pattern));
    });
    if (!hookResult) {
        throw new Error('Failed to render hook');
    }
    return hookResult;
};

describe('useRouteMatch', () => {
    const navigationStub = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    } as Record<string, unknown> as any;

    beforeEach(() => {
        Object.defineProperty(window, 'navigation', {
            value: navigationStub,
            configurable: true,
        });
        setPathname('/');
    });

    afterEach(() => {
        setPathname('/');
        vi.restoreAllMocks();
        delete (window as any).navigation;
    });

    it('detects the initial route match', async () => {
        setPathname('/imagine/post/123');

        const { result } = await renderRouteHook('^/imagine/post/');
        await flushEffects();

        expect(result.current).toBe(true);
    });

    it('updates when pushState changes the path', async () => {
        setPathname('/home');

        const { result } = await renderRouteHook('^/imagine/post/');
        await flushEffects();
        expect(result.current).toBe(false);

        await act(async () => {
            window.history.pushState({}, '', '/imagine/post/abc');
        });
        await flushEffects();

        expect(result.current).toBe(true);

        await act(async () => {
            window.history.pushState({}, '', '/settings');
        });
        await flushEffects();

        expect(result.current).toBe(false);
    });

    it('reacts to popstate events', async () => {
        setPathname('/imagine/post/123');
        const { result } = await renderRouteHook('^/imagine/post/');
        await flushEffects();
        expect(result.current).toBe(true);

        act(() => {
            window.history.pushState({}, '', '/home');
            window.dispatchEvent(new PopStateEvent('popstate'));
        });
        await flushEffects();

        expect(result.current).toBe(false);
    });
});
