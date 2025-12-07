import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

const saveMock = vi.fn();
let storageReturn: any;

declare const window: Window & typeof globalThis;

Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });

vi.mock('../../src/hooks/useStorage', () => ({
  useStorage: () => storageReturn,
}));

let useMiniToggleDrag: typeof import('../../src/hooks/useMiniToggleDrag').useMiniToggleDrag;

describe('useMiniToggleDrag', () => {
  beforeAll(async () => {
    ({ useMiniToggleDrag } = await import('../../src/hooks/useMiniToggleDrag'));
  });

  beforeEach(() => {
    storageReturn = {
      data: {
        panelWidth: 320,
        panelHeight: 400,
        isMinimized: false,
        isMaximized: false,
        imaginePromptValue: '',
        miniTogglePosition: { x: 120, y: 140 },
      },
      save: saveMock,
      saveAll: vi.fn(),
      isLoading: false,
    };
    saveMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('persists position when dragged beyond threshold', () => {
    const { result } = renderHook(() => useMiniToggleDrag());

    const startEvent = {
      preventDefault: vi.fn(),
      clientX: 300,
      clientY: 300,
    } as any;

    act(() => {
      result.current.handleDragStart(startEvent);
    });

    act(() => {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 340, clientY: 330 }));
    });

    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup'));
    });

    expect(result.current.dragMoved).toBe(true);
    expect(result.current.position.x).toBeGreaterThan(120);
    expect(result.current.position.y).toBeGreaterThan(140);
    expect(saveMock).toHaveBeenCalledWith('miniTogglePosition', result.current.position);
  });

  it('does not save when movement stays below threshold', () => {
    const { result } = renderHook(() => useMiniToggleDrag());

    const startEvent = {
      preventDefault: vi.fn(),
      clientX: 400,
      clientY: 400,
    } as any;

    act(() => {
      result.current.handleDragStart(startEvent);
    });

    act(() => {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 402, clientY: 402 }));
    });

    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup'));
    });

    expect(result.current.dragMoved).toBe(false);
    expect(saveMock).not.toHaveBeenCalled();
  });
});
