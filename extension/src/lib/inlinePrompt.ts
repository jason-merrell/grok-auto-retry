import { writePromptValue } from "@/lib/promptInput";

export const PENDING_INLINE_PROMPT_KEY = "grokRetry_pendingInlinePrompt";
export const MAX_PENDING_INLINE_AGE_MS = 30000;

export const delay = (ms: number) =>
    new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });

export const normalizePrompt = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();

export const clearPendingInlinePrompt = () => {
    try {
        sessionStorage.removeItem(PENDING_INLINE_PROMPT_KEY);
    } catch { }
};

export const enqueuePendingInlinePrompt = (value: string) => {
    try {
        console.warn("[Grok Retry] Queueing prompt for inline retry after navigation");
        sessionStorage.setItem(PENDING_INLINE_PROMPT_KEY, JSON.stringify({ prompt: value, createdAt: Date.now() }));
    } catch { }
};

export const getPendingInlinePrompt = (): { prompt: string; createdAt?: number } | null => {
    try {
        const stored = sessionStorage.getItem(PENDING_INLINE_PROMPT_KEY);
        if (!stored) {
            return null;
        }
        const parsed = JSON.parse(stored);
        if (!parsed || typeof parsed.prompt !== "string") {
            clearPendingInlinePrompt();
            return null;
        }
        return parsed;
    } catch {
        clearPendingInlinePrompt();
        return null;
    }
};

export const findPromptSection = (targetPrompt: string) => {
    const normalized = normalizePrompt(targetPrompt);
    const normalizedWithoutDeterminer = normalized.replace(/^(an?|the)\s+/, "");
    if (!normalized) {
        return null;
    }

    const sections = Array.from(document.querySelectorAll<HTMLElement>('[id^="imagine-masonry-section-"]'));
    for (const section of sections) {
        const sticky = section.querySelector<HTMLElement>('div.sticky, div[class*="sticky"]');
        const rawText = sticky?.textContent ?? "";
        const text = normalizePrompt(rawText);
        const textWithoutDeterminer = text.replace(/^(an?|the)\s+/, "");
        if (
            text === normalized ||
            textWithoutDeterminer === normalizedWithoutDeterminer ||
            text.includes(normalized) ||
            normalized.includes(text) ||
            textWithoutDeterminer.includes(normalizedWithoutDeterminer)
        ) {
            console.log("[Grok Retry] Matched inline section by prompt", rawText);
            return section;
        }
    }

    const fallback = sections.length > 0 ? sections[sections.length - 1] : null;
    if (!fallback) {
        console.warn("[Grok Retry] No matching inline section found for prompt");
    } else {
        console.warn("[Grok Retry] Falling back to last inline section");
    }
    return fallback ?? null;
};

export const ensureInlineEditor = async (targetPrompt: string): Promise<boolean> => {
    const section = findPromptSection(targetPrompt);
    if (!section) {
        console.warn("[Grok Retry] Inline section unavailable for prompt, will retry");
        return false;
    }

    const lookupEditor = () =>
        section.querySelector<HTMLElement>(
            'textarea[aria-label="Image prompt"], textarea, [role="textbox"][aria-label="Image prompt"], [role="textbox"], [contenteditable="true"]'
        );

    let editor = lookupEditor();
    if (!editor) {
        const trigger = section.querySelector<HTMLElement>('div.sticky, div[class*="sticky"]');
        if (trigger) {
            try {
                trigger.click();
            } catch { }
            for (let attempt = 0; attempt < 20; attempt += 1) {
                await delay(50);
                editor = lookupEditor();
                if (editor) {
                    break;
                }
            }
        }
    }

    if (!editor) {
        console.warn("[Grok Retry] Inline editor not found after trigger");
        return false;
    }

    const writeSucceeded = writePromptValue(editor, targetPrompt);
    if (!writeSucceeded) {
        console.warn("[Grok Retry] Failed to write prompt into inline editor");
        return false;
    }

    const submitButton = section.querySelector<HTMLButtonElement>('button[type="submit"], button[aria-label="Submit"]');
    if (!submitButton) {
        console.warn("[Grok Retry] Inline submit button missing");
        return false;
    }

    if (submitButton.disabled) {
        submitButton.removeAttribute("disabled");
    }
    submitButton.focus();
    submitButton.click();
    console.log("[Grok Retry] Submitted prompt through inline editor");
    return true;
};

export const processPendingInlinePrompt = async (shouldCancel: () => boolean) => {
    const parsed = getPendingInlinePrompt();
    if (!parsed?.prompt) {
        return;
    }

    if (parsed.createdAt && Date.now() - parsed.createdAt > MAX_PENDING_INLINE_AGE_MS) {
        clearPendingInlinePrompt();
        return;
    }

    for (let attempt = 0; attempt < 40 && !shouldCancel(); attempt += 1) {
        if (await ensureInlineEditor(parsed.prompt)) {
            clearPendingInlinePrompt();
            return;
        }
        await delay(200);
    }
};
