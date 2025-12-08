import { getPromptSelectorCandidates } from '../config/selectors';

export type PromptInputEntry = {
    element: HTMLElement;
    type: 'textarea' | 'input' | 'contenteditable';
};

const PROSEMIRROR_SELECTOR = 'div.tiptap.ProseMirror[contenteditable="true"]';

const isContentEditableTarget = (element: HTMLElement) => {
    const attr = element.getAttribute('contenteditable');
    if (typeof element.isContentEditable === 'boolean') {
        return element.isContentEditable || attr?.toLowerCase() === 'true';
    }
    return attr?.toLowerCase() === 'true';
};

const createInputEvent = () => {
    try {
        if (typeof InputEvent === 'function') {
            return new InputEvent('input', { bubbles: true });
        }
    } catch {
        // ignore
    }
    return new Event('input', { bubbles: true });
};

const ensureDefaultSelectors = () => {
    // No-op placeholder in case we need to lazily register defaults later
};

const describeEntry = (element: HTMLElement): PromptInputEntry => {
    if (element instanceof HTMLTextAreaElement) {
        return { element, type: 'textarea' };
    }

    if (element instanceof HTMLInputElement) {
        return { element, type: 'input' };
    }

    if (isContentEditableTarget(element)) {
        return { element, type: 'contenteditable' };
    }

    // Fallback to treat unknown matches as contenteditable for logging purposes
    return { element, type: 'contenteditable' };
};

export const findPromptInput = (): PromptInputEntry | null => {
    ensureDefaultSelectors();
    const selectors = getPromptSelectorCandidates();
    for (const selector of selectors) {
        const candidate = document.querySelector<HTMLElement>(selector);
        if (candidate) {
            return describeEntry(candidate);
        }
    }

    const proseMirror = document.querySelector<HTMLElement>(PROSEMIRROR_SELECTOR);
    return proseMirror ? describeEntry(proseMirror) : null;
};

export const readPromptValue = (target: HTMLElement | null): string | null => {
    if (!target) return null;

    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
        return target.value || null;
    }

    if (isContentEditableTarget(target)) {
        const text = target.textContent?.trim();
        return text && text.length > 0 ? text : null;
    }

    return null;
};

export const writePromptValue = (target: HTMLElement, value: string): boolean => {
    if (!value) return false;

    if (target instanceof HTMLTextAreaElement) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        if (setter) {
            setter.call(target, value);
        } else {
            target.value = value;
        }
        target.dispatchEvent(createInputEvent());
        return true;
    }

    if (target instanceof HTMLInputElement) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) {
            setter.call(target, value);
        } else {
            target.value = value;
        }
        target.dispatchEvent(createInputEvent());
        return true;
    }

    if (isContentEditableTarget(target)) {
        const editable = target;
        editable.focus();
        try {
            document.execCommand('selectAll');
            const inserted = document.execCommand('insertText', false, value);
            if (!inserted) {
                editable.innerHTML = '';
                editable.appendChild(document.createTextNode(value));
            }
        } catch {
            editable.innerHTML = '';
            editable.appendChild(document.createTextNode(value));
        }
        editable.dispatchEvent(createInputEvent());
        return true;
    }

    return false;
};
