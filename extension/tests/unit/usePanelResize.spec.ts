import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

const saveMock = vi.fn();
let storageSnapshot: any;

vi.mock('../../src/hooks/useStorage', () => ({
  useStorage: () => storageSnapshot,
}));

let usePanelResize: typeof import('../../src/hooks/usePanelResize').usePanelResize;

describe('usePanelResize', () => {
  beforeAll(async () => {
    ({ usePanelResize } = await import('../../src/hooks/usePanelResize'));
  });

  beforeEach(() => {
    saveMock.mockReset();
    storageSnapshot = {
      data: {
        panelWidth: 320,
        panelHeight: 400,
        isMinimized: false,
        isMaximized: false,
        imaginePromptValue: '',
      },
      save: saveMock,
      saveAll: vi.fn(),
      isLoading: false,
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('tracks resize movements and persists final size', () => {
    const { result } = renderHook(() => usePanelResize());

    const startEvent = {
      preventDefault: vi.fn(),
      clientX: 600,
      clientY: 500,
    } as any;

    act(() => {
      result.current.handleResizeStart(startEvent);
    });

    act(() => {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 540, clientY: 460 }));
    });

    expect(result.current.isResizing).toBe(true);
    expect(result.current.width).toBeGreaterThan(320);
    expect(result.current.height).toBeGreaterThan(400);
    expect(result.current.fontSize).toBeLessThanOrEqual(16);

    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup'));
    });

    expect(result.current.isResizing).toBe(false);
    expect(saveMock).toHaveBeenCalledWith('panelWidth', result.current.width);
    expect(saveMock).toHaveBeenCalledWith('panelHeight', result.current.height);
  });

  it('clamps dimensions to allowed bounds', () => {
    storageSnapshot = {
      ...storageSnapshot,
      data: {
        panelWidth: 500,
        panelHeight: 700,
        isMinimized: false,
        isMaximized: false,
        imaginePromptValue: '',
      },
      save: saveMock,
      saveAll: vi.fn(),
      isLoading: false,
    };

    const { result } = renderHook(() => usePanelResize());

    const startEvent = {
      preventDefault: vi.fn(),
      clientX: 400,
      clientY: 300,
    } as any;

    act(() => {
      result.current.handleResizeStart(startEvent);
    });

    act(() => {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 50 }));
    });

    expect(result.current.width).toBeLessThanOrEqual(520);
    expect(result.current.height).toBeLessThanOrEqual(800);

    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup'));
    });

    expect(saveMock).toHaveBeenCalledWith('panelWidth', result.current.width);
    expect(saveMock).toHaveBeenCalledWith('panelHeight', result.current.height);
  });
});
