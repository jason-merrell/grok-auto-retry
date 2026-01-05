import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

const mockIsSuccessState = vi.fn(() => true);

vi.mock('../../src/config/selectors', () => ({
    selectors: {
        success: {
            legacyVideo: '#mock-video',
            iconOnlyGenerateButton: '#mock-generate-button',
            imageTag: 'img.mock-success',
            videoHistorySidebar: '.mock-history img[src*="grok.com"]',
            videoHistoryActiveItem: '.mock-history button.ring-2',
            videoHistoryContainer: '.mock-history .flex.flex-col',
        },
        containers: {
            main: '#mock-main',
        },
    },
    isSuccessStateGenerateButton: mockIsSuccessState,
}));

vi.mock('../../src/hooks/usePostId', () => ({
    usePostId: vi.fn(() => 'post-1'),
}));

let useSuccessDetector: typeof import('../../src/hooks/useSuccessDetector').useSuccessDetector;

class MockMutationObserver {
    private readonly callback: MutationCallback;
    public lastTarget: Node | null = null;

    constructor(callback: MutationCallback) {
        this.callback = callback;
        observerRegistry.add(this);
    }

    observe = vi.fn((target: Node) => {
        this.lastTarget = target;
    });

    disconnect = vi.fn(() => {
        this.lastTarget = null;
        observerRegistry.delete(this);
    });

    takeRecords = vi.fn(() => [] as MutationRecord[]);

    trigger(records: MutationRecord[] = []) {
        this.callback(records, this as unknown as MutationObserver);
    }
}

const observerRegistry = new Set<MockMutationObserver>();
const realMutationObserver = global.MutationObserver;

const setupDom = (options: { includeNextVideoButton?: boolean } = {}) => {
    document.body.innerHTML = `
    <main id="mock-main">
      <button id="mock-generate-button"><svg></svg></button>
      <video id="mock-video" src="baseline.mp4"></video>
      ${options.includeNextVideoButton ? '<button aria-label="Next video"></button>' : ''}
    </main>
  `;

    if (options.includeNextVideoButton) {
        document.querySelector('button[aria-label="Next video"]')?.classList.remove('invisible');
    }
};

const getObserver = (predicate: (observer: MockMutationObserver) => boolean) => {
    let match: MockMutationObserver | undefined;
    for (const observer of observerRegistry) {
        if (predicate(observer)) {
            match = observer;
        }
    }
    return match;
};

const triggerVideoMutation = () => {
    const observer = getObserver((item) => item.lastTarget instanceof HTMLVideoElement);
    if (!observer) {
        throw new Error('Video observer not registered');
    }
    observer.trigger();
};

const triggerBodyMutation = () => {
    const target = document.querySelector('#mock-main') ?? document.body;
    const observer = getObserver((item) => item.lastTarget === target);
    if (!observer) {
        throw new Error('Body observer not registered');
    }
    observer.trigger();
};

const createClock = () => {
    let currentTime = 0;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => currentTime);
    return {
        set: (value: number) => {
            currentTime = value;
        },
        advance: (delta: number) => {
            currentTime += delta;
        },
        now: () => currentTime,
        restore: () => spy.mockRestore(),
    };
};

describe('useSuccessDetector', () => {
    beforeAll(async () => {
        (global as any).MutationObserver = MockMutationObserver as unknown as typeof MutationObserver;
        ({ useSuccessDetector } = await import('../../src/hooks/useSuccessDetector'));
    });

    beforeEach(() => {
        observerRegistry.clear();
        mockIsSuccessState.mockReset();
        mockIsSuccessState.mockReturnValue(true);
        document.body.innerHTML = '';
        delete (window as any).__grok_attempts;
        delete (window as any).__grok_route_changed;
        delete (window as any).__grok_session_post_id;
        delete (window as any).__grok_video_history_count;
        delete (window as any).__grok_append_log;

        // Mock location
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { pathname: '/imagine/post/post-1' },
        });
    });

    afterEach(() => {
        cleanup();
    });

    afterAll(() => {
        (global as any).MutationObserver = realMutationObserver;
    });

    it('fires onSuccess when generate button and video change signal completion', async () => {
        const clock = createClock();
        clock.set(1_000);
        setupDom();
        const attempts: Record<string, number> = { 'post-1': Date.now() };
        (window as any).__grok_attempts = attempts;

        const onSuccess = vi.fn();
        renderHook(() => useSuccessDetector(onSuccess, true));

        await act(async () => { });

        const video = document.querySelector<HTMLVideoElement>('#mock-video');
        expect(video).toBeTruthy();

        act(() => {
            if (!video) return;
            video.setAttribute('src', 'first-success.mp4');
            triggerVideoMutation();
            triggerBodyMutation();
        });

        expect(mockIsSuccessState).toHaveBeenCalled();
        expect(onSuccess).toHaveBeenCalledTimes(1);

        clock.restore();
    });

    it('throttles repeated detections within the debounce interval', async () => {
        const clock = createClock();
        clock.set(1_000);
        setupDom();
        const attempts: Record<string, number> = { 'post-1': 1_000 };
        (window as any).__grok_attempts = attempts;

        const onSuccess = vi.fn();
        renderHook(() => useSuccessDetector(onSuccess, true));

        await act(async () => { });

        const video = document.querySelector<HTMLVideoElement>('#mock-video');
        expect(video).toBeTruthy();

        act(() => {
            if (!video) return;
            video.setAttribute('src', 'first-success.mp4');
            triggerVideoMutation();
            triggerBodyMutation();
        });

        expect(onSuccess).toHaveBeenCalledTimes(1);

        clock.advance(100);
        // Same attempt timestamp - should be blocked by guard

        act(() => {
            if (!video) return;
            video.setAttribute('src', 'second-success.mp4');
            triggerVideoMutation();
            triggerBodyMutation();
        });

        // Should still be 1 because same attempt
        expect(onSuccess).toHaveBeenCalledTimes(1);

        clock.advance(400);
        // New attempt timestamp - should allow new detection
        attempts['post-1'] = Date.now();

        act(() => {
            if (!video) return;
            video.setAttribute('src', 'second-success.mp4');
            triggerVideoMutation();
            triggerBodyMutation();
        });

        expect(onSuccess).toHaveBeenCalledTimes(1);

        clock.advance(400);
        attempts['post-1'] = Date.now();

        act(() => {
            if (!video) return;
            video.setAttribute('src', 'third-success.mp4');
            triggerVideoMutation();
            triggerBodyMutation();
        });

        expect(onSuccess).toHaveBeenCalledTimes(2);

        clock.restore();
    });

    it('ignores video changes when the next video button is visible', async () => {
        const clock = createClock();
        clock.set(1_000);
        setupDom({ includeNextVideoButton: true });
        const attempts: Record<string, number> = { 'post-1': 1_000 };
        (window as any).__grok_attempts = attempts;

        const onSuccess = vi.fn();
        renderHook(() => useSuccessDetector(onSuccess, true));

        await act(async () => { });

        const video = document.querySelector<HTMLVideoElement>('#mock-video');
        expect(video).toBeTruthy();

        act(() => {
            if (!video) return;
            video.setAttribute('src', 'ignored-change.mp4');
            triggerVideoMutation();
            triggerBodyMutation();
        });

        expect(mockIsSuccessState).toHaveBeenCalled();
        expect(onSuccess).not.toHaveBeenCalled();

        clock.restore();
    });

    it('detects success via route change signal', async () => {
        const clock = createClock();
        clock.set(10000);
        setupDom();
        const attempts: Record<string, number> = { 'post-1': 10000 };
        (window as any).__grok_attempts = attempts;
        (window as any).__grok_session_post_id = 'post-1';

        const onSuccess = vi.fn();
        renderHook(() => useSuccessDetector(onSuccess, true));

        await act(async () => { });

        // Simulate route change from post-1 to post-2
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { pathname: '/imagine/post/post-2' },
        });

        act(() => {
            (window as any).__grok_route_changed = { from: 'post-1', to: 'post-2', at: 10000 };
            triggerBodyMutation();
        });

        expect(onSuccess).toHaveBeenCalledTimes(1);
        expect((window as any).__grok_route_changed).toBeUndefined(); // Should be cleared

        clock.restore();
    });

    it('ignores stale route change signals', async () => {
        const clock = createClock();
        clock.set(20000);
        setupDom();
        const attempts: Record<string, number> = { 'post-1': 20000 };
        (window as any).__grok_attempts = attempts;

        const onSuccess = vi.fn();
        renderHook(() => useSuccessDetector(onSuccess, true));

        await act(async () => { });

        // Route change signal is more than 10 seconds old
        act(() => {
            (window as any).__grok_route_changed = { from: 'post-1', to: 'post-2', at: 5000 };
            triggerBodyMutation();
        });

        expect(onSuccess).not.toHaveBeenCalled();

        clock.restore();
    });

    it('detects success via history sidebar count increase', async () => {
        const clock = createClock();
        clock.set(10000);

        document.body.innerHTML = `
      <main id="mock-main">
        <button id="mock-generate-button"><svg></svg></button>
        <video id="mock-video" src="baseline.mp4"></video>
        <div class="mock-history">
          <img src="https://assets.grok.com/video1.jpg" />
        </div>
      </main>
    `;

        const attempts: Record<string, number> = { 'post-1': 10000 };
        (window as any).__grok_attempts = attempts;

        const onSuccess = vi.fn();
        renderHook(() => useSuccessDetector(onSuccess, true));

        await act(async () => {
            triggerBodyMutation();
        });

        // Baseline established, no success yet
        expect(onSuccess).not.toHaveBeenCalled();
        expect((window as any).__grok_video_history_count).toBe(1);

        // Add a second video thumbnail
        act(() => {
            const history = document.querySelector('.mock-history');
            const newThumb = document.createElement('img');
            newThumb.src = 'https://assets.grok.com/video2.jpg';
            history?.appendChild(newThumb);
            triggerBodyMutation();
        });

        expect(onSuccess).toHaveBeenCalledTimes(1);
        expect((window as any).__grok_video_history_count).toBe(2);

        clock.restore();
    });

    it('does not count history increase when button is not in success state', async () => {
        const clock = createClock();
        clock.set(10000);

        document.body.innerHTML = `
      <main id="mock-main">
        <button id="mock-generate-button"><svg></svg></button>
        <video id="mock-video" src="baseline.mp4"></video>
        <div class="mock-history">
          <img src="https://assets.grok.com/video1.jpg" />
        </div>
      </main>
    `;

        const attempts: Record<string, number> = { 'post-1': 10000 };
        (window as any).__grok_attempts = attempts;

        // Button NOT in success state (generating)
        mockIsSuccessState.mockReturnValue(false);

        const onSuccess = vi.fn();
        renderHook(() => useSuccessDetector(onSuccess, true));

        await act(async () => {
            triggerBodyMutation();
        });

        // Add a second video thumbnail while generating
        act(() => {
            const history = document.querySelector('.mock-history');
            const newThumb = document.createElement('img');
            newThumb.src = 'https://assets.grok.com/video2.jpg';
            history?.appendChild(newThumb);
            triggerBodyMutation();
        });

        // Should NOT trigger success because button is not in success state
        expect(onSuccess).not.toHaveBeenCalled();

        clock.restore();
    });

    it('ignores progress placeholders in history sidebar', async () => {
        const clock = createClock();
        clock.set(10000);

        document.body.innerHTML = `
      <main id="mock-main">
        <button id="mock-generate-button"><svg></svg></button>
        <video id="mock-video" src="baseline.mp4"></video>
        <div class="mock-history">
          <img src="https://assets.grok.com/video1.jpg" />
          <!-- Progress placeholder without src attribute -->
          <div class="progress-placeholder">43%</div>
        </div>
      </main>
    `;

        const attempts: Record<string, number> = { 'post-1': 10000 };
        (window as any).__grok_attempts = attempts;

        const onSuccess = vi.fn();
        renderHook(() => useSuccessDetector(onSuccess, true));

        await act(async () => {
            triggerBodyMutation();
        });

        // Should only count the one real thumbnail, not the progress placeholder
        expect((window as any).__grok_video_history_count).toBe(1);
        expect(onSuccess).not.toHaveBeenCalled();

        clock.restore();
    });
});
