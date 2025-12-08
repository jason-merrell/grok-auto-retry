import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePromptCapture } from '../../src/hooks/usePromptCapture';

type Clock = {
    now: () => number;
    set: (value: number) => void;
    advance: (delta: number) => void;
    restore: () => void;
};

const createClock = (): Clock => {
    let current = 0;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => current);
    return {
        now: () => current,
        set: (value: number) => {
            current = value;
        },
        advance: (delta: number) => {
            current += delta;
        },
        restore: () => spy.mockRestore(),
    };
};

describe('usePromptCapture', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        vi.restoreAllMocks();
        document.body.innerHTML = '';
    });

    it('captures prompt text from the textarea and respects cooldown', () => {
        const clock = createClock();
        clock.set(1_000);

        const textarea = document.createElement('textarea');
        textarea.setAttribute('aria-label', 'Make a video');
        textarea.setAttribute('placeholder', 'Type to customize video...');
        textarea.value = 'First prompt';
        document.body.appendChild(textarea);

        const { result } = renderHook(() => usePromptCapture());

        let captured: string | null = null;
        act(() => {
            captured = result.current.capturePromptFromSite();
        });
        expect(captured).toBe('First prompt');

        textarea.value = 'Updated prompt too soon';
        let second: string | null = null;
        act(() => {
            second = result.current.capturePromptFromSite();
        });
        expect(second).toBeNull();

        clock.advance(600);
        textarea.value = 'Updated prompt after cooldown';
        let third: string | null = null;
        act(() => {
            third = result.current.capturePromptFromSite();
        });
        expect(third).toBe('Updated prompt after cooldown');

        clock.restore();
    });

    it('captures prompt text from the ProseMirror editor when textarea missing', () => {
        const clock = createClock();
        clock.set(2_000);

        const editor = document.createElement('div');
        editor.className = 'tiptap ProseMirror';
        editor.setAttribute('contenteditable', 'true');
        editor.textContent = 'Editor prompt';
        document.body.appendChild(editor);

        const { result } = renderHook(() => usePromptCapture());
        let captured: string | null = null;
        act(() => {
            captured = result.current.capturePromptFromSite();
        });
        expect(captured).toBe('Editor prompt');

        clock.restore();
    });

    it('copies prompt text into textarea inputs', () => {
        const textarea = document.createElement('textarea');
        textarea.setAttribute('aria-label', 'Make a video');
        textarea.setAttribute('placeholder', 'Type to customize video...');
        document.body.appendChild(textarea);

        const inputListener = vi.fn();
        textarea.addEventListener('input', inputListener);

        const { result } = renderHook(() => usePromptCapture());
        const success = result.current.copyPromptToSite('Pasted prompt');

        expect(success).toBe(true);
        expect(textarea.value).toBe('Pasted prompt');
        expect(inputListener).toHaveBeenCalled();
    });

    it('copies prompt text into ProseMirror editor when textarea missing', () => {
        const editor = document.createElement('div');
        editor.className = 'tiptap ProseMirror';
        editor.setAttribute('contenteditable', 'true');
        document.body.appendChild(editor);

        const addEventListenerSpy = vi.spyOn(editor, 'dispatchEvent');

        const originalExecCommand = (document as Document & { execCommand?: typeof document.execCommand }).execCommand;
        if (!originalExecCommand) {
            Object.defineProperty(document, 'execCommand', {
                value: vi.fn(),
                configurable: true,
                writable: true,
            });
        }

        const execCommand = vi.spyOn(document as Document & { execCommand: typeof document.execCommand }, 'execCommand').mockImplementation((commandId, _showUI, value) => {
            if (commandId === 'insertText') {
                editor.innerHTML = '';
                editor.appendChild(document.createTextNode(String(value)));
                return true;
            }
            return true;
        });

        const { result } = renderHook(() => usePromptCapture());
        const success = result.current.copyPromptToSite('Editor pasted prompt');

        expect(success).toBe(true);
        expect(editor.textContent).toBe('Editor pasted prompt');
        expect(addEventListenerSpy).toHaveBeenCalledWith(expect.any(InputEvent));
        expect(execCommand).toHaveBeenCalledWith('insertText', false, 'Editor pasted prompt');

        execCommand.mockRestore();
        if (!originalExecCommand) {
            delete (document as any).execCommand;
        }
    });

    it('returns a cleanup function from setupClickListener', () => {
        const { result } = renderHook(() => usePromptCapture());
        const cleanup = result.current.setupClickListener(() => { });
        expect(typeof cleanup).toBe('function');
        cleanup();
    });
});
