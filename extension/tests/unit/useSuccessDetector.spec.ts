import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

const mockIsSuccessState = vi.fn(() => true);

vi.mock('../../src/config/selectors', () => ({
  selectors: {
    success: {
      legacyVideo: '#mock-video',
      iconOnlyGenerateButton: '#mock-generate-button',
      imageTag: 'img.mock-success',
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

    await act(async () => {});

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
    const attempts: Record<string, number> = { 'post-1': Date.now() };
    (window as any).__grok_attempts = attempts;

    const onSuccess = vi.fn();
    renderHook(() => useSuccessDetector(onSuccess, true));

    await act(async () => {});

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
    const attempts: Record<string, number> = { 'post-1': Date.now() };
    (window as any).__grok_attempts = attempts;

    const onSuccess = vi.fn();
    renderHook(() => useSuccessDetector(onSuccess, true));

    await act(async () => {});

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
});
