import { useEffect, useMemo } from "react";

/**
 * Parsed keyboard shortcut representation.
 * 
 * @property key - Main key to press (normalized)
 * @property alt - Whether Alt/Option modifier is required
 * @property ctrl - Whether Ctrl/Control modifier is required
 * @property meta - Whether Cmd/Meta/Win modifier is required
 * @property shift - Whether Shift modifier is required
 */
interface ParsedShortcut {
    key: string;
    alt: boolean;
    ctrl: boolean;
    meta: boolean;
    shift: boolean;
}

const MODIFIER_ALIASES: Record<string, keyof Omit<ParsedShortcut, "key">> = {
    alt: "alt",
    option: "alt",
    ctrl: "ctrl",
    control: "ctrl",
    cmd: "meta",
    command: "meta",
    meta: "meta",
    super: "meta",
    win: "meta",
    windows: "meta",
    shift: "shift",
};

const KEY_ALIASES: Record<string, string> = {
    esc: "Escape",
    escape: "Escape",
    space: " ",
    spacebar: " ",
    enter: "Enter",
    return: "Enter",
    tab: "Tab",
    backspace: "Backspace",
    delete: "Delete",
    del: "Delete",
    insert: "Insert",
    home: "Home",
    end: "End",
    pageup: "PageUp",
    pagedown: "PageDown",
    arrowup: "ArrowUp",
    up: "ArrowUp",
    arrowdown: "ArrowDown",
    down: "ArrowDown",
    arrowleft: "ArrowLeft",
    left: "ArrowLeft",
    arrowright: "ArrowRight",
    right: "ArrowRight",
};

const FUNCTION_KEY_REGEX = /^f\d{1,2}$/i;

const normalizeKeyToken = (token: string): string | null => {
    const trimmed = token.trim();
    if (!trimmed) {
        return null;
    }

    const lower = trimmed.toLowerCase();
    if (KEY_ALIASES[lower]) {
        return KEY_ALIASES[lower];
    }

    if (FUNCTION_KEY_REGEX.test(trimmed)) {
        return trimmed.toUpperCase();
    }

    if (trimmed.length === 1) {
        return trimmed.toUpperCase();
    }

    return trimmed;
};

const normalizeEventKey = (key: string): string => {
    if (key.length === 1) {
        return key.toUpperCase();
    }

    const lower = key.toLowerCase();
    if (KEY_ALIASES[lower]) {
        return KEY_ALIASES[lower];
    }

    return key;
};

const parseShortcut = (shortcut?: string | null): ParsedShortcut | null => {
    if (!shortcut) {
        return null;
    }

    const parts = shortcut
        .split("+")
        .map((part) => part.trim())
        .filter((part) => part.length > 0);

    if (parts.length === 0) {
        return null;
    }

    const parsed: ParsedShortcut = {
        key: "",
        alt: false,
        ctrl: false,
        meta: false,
        shift: false,
    };

    for (const part of parts) {
        const lower = part.toLowerCase();
        if (MODIFIER_ALIASES[lower]) {
            const modifier = MODIFIER_ALIASES[lower];
            parsed[modifier] = true;
            continue;
        }

        const key = normalizeKeyToken(part);
        if (key) {
            parsed.key = key;
        }
    }

    if (!parsed.key) {
        return null;
    }

    return parsed;
};

const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    if (target.isContentEditable) {
        return true;
    }

    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return !(target as HTMLInputElement).readOnly;
    }

    return false;
};

const matchesShortcut = (event: KeyboardEvent, shortcut: ParsedShortcut): boolean => {
    const eventKey = normalizeEventKey(event.key);

    return (
        shortcut.key === eventKey &&
        event.altKey === shortcut.alt &&
        event.ctrlKey === shortcut.ctrl &&
        event.metaKey === shortcut.meta &&
        event.shiftKey === shortcut.shift
    );
};

export interface ShortcutBinding {
    shortcut?: string | null;
    handler: () => void;
    allowWhileTyping?: boolean;
}

/**
 * Registers keyboard shortcuts for Grok Retry UI interactions.
 *
 * Normalizes user-provided shortcut strings (including aliases/modifiers),
 * attaches a window-level keydown listener, filters repeated events, and
 * optionally suppresses shortcuts while typing inside editable elements.
 *
 * @param bindings - Shortcut configuration array mapping combos to handlers
 */
export const useGrokRetryKeyboardShortcuts = (bindings: ShortcutBinding[]) => {
    const parsedBindings = useMemo(() => {
        return bindings
            .map((binding) => {
                const parsed = parseShortcut(binding.shortcut);
                if (!parsed) {
                    return null;
                }
                return { ...binding, parsed };
            })
            .filter(Boolean) as Array<ShortcutBinding & { parsed: ParsedShortcut }>;
    }, [bindings]);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        if (parsedBindings.length === 0) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.repeat) {
                return;
            }

            const isTyping = isEditableTarget(event.target);

            for (const binding of parsedBindings) {
                if (!binding.allowWhileTyping && isTyping) {
                    continue;
                }

                if (matchesShortcut(event, binding.parsed)) {
                    event.preventDefault();
                    binding.handler();
                    break;
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [parsedBindings]);
};
