type CustomSelectors = {
    notificationSection?: string;
    makeVideoButton?: string;
    videoElement?: string;
    promptTextarea?: string;
};

const DEFAULT_NOTIFICATION_SECTION = 'section[aria-label*="Notifications"][aria-live="polite"]';
const DEFAULT_NOTIFICATION_BASE = 'section[aria-label*="Notifications"]';
const DEFAULT_MAKE_VIDEO_BUTTON = 'button[aria-label="Make video"]';
const DEFAULT_VIDEO_ELEMENT = 'video[id="sd-video"]';
const DEFAULT_PROMPT_TEXTAREA = 'textarea[aria-label="Make a video"], textarea[name*="prompt"], [contenteditable="true"]';
const LEGACY_PROMPT_SELECTOR = 'textarea[aria-label="Make a video"][placeholder="Type to customize video..."]';

let customSelectors: CustomSelectors = {};

const normalizeSelectors = (value?: string): string | undefined => {
    if (!value) return undefined;
    const cleaned = value.trim();
    return cleaned.length > 0 ? cleaned : undefined;
};

const applyCustomSelectors = (settings: { customSelectors?: CustomSelectors } | null | undefined) => {
    const overrides = settings?.customSelectors ?? {};
    customSelectors = {
        notificationSection: normalizeSelectors(overrides.notificationSection),
        makeVideoButton: normalizeSelectors(overrides.makeVideoButton),
        videoElement: normalizeSelectors(overrides.videoElement),
        promptTextarea: normalizeSelectors(overrides.promptTextarea),
    };
    console.log('[Selectors] Applied custom selectors:', customSelectors);
};

if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.sync.get('grokRetry_globalSettings', (result) => {
        applyCustomSelectors(result?.grokRetry_globalSettings);
    });

    if (chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'sync') return;
            if (changes?.grokRetry_globalSettings) {
                applyCustomSelectors(changes.grokRetry_globalSettings.newValue);
            }
        });
    }
}

export const selectors = {
    pageType: {
        imaginePost: 'link[rel="canonical"][href*="/imagine/post/"]',
    },
    containers: {
        main: 'main',
    },
    get notifications() {
        const section = customSelectors.notificationSection || DEFAULT_NOTIFICATION_SECTION;
        const base = (customSelectors.notificationSection?.split(',')[0]?.trim()) || DEFAULT_NOTIFICATION_BASE;
        return {
            section,
            toast: `${base} li.toast`,
            moderationToastText: `${base} li.toast[data-type="error"] :is(span, div)`,
        } as const;
    },
    get success() {
        return {
            imageTag: 'main img[src*="imagine-public.x.ai"], main img[src*="/imagine/post/"]',
            ogImageMeta: 'meta[property="og:image"], meta[name="twitter:image"]',
            legacyVideo: customSelectors.videoElement || DEFAULT_VIDEO_ELEMENT,
            iconOnlyGenerateButton: customSelectors.makeVideoButton || DEFAULT_MAKE_VIDEO_BUTTON,
            // New video history sidebar (appears after first video generation)
            // Only count completed videos with actual thumbnails, not progress placeholders
            videoHistorySidebar: '.absolute.top-0.w-fit button img[alt*="Thumbnail"][src*="grok.com"]',
            videoHistoryActiveItem: '.absolute.top-0.w-fit button.ring-2.ring-white',
            videoHistoryContainer: '.absolute.top-0.w-fit .flex.flex-col.overflow-y-auto',
        } as const;
    },
    get prompt() {
        return {
            textarea: customSelectors.promptTextarea || DEFAULT_PROMPT_TEXTAREA,
        } as const;
    },
} as const;

export const defaultSelectors = {
    makeVideoButtons: [DEFAULT_MAKE_VIDEO_BUTTON],
    redoButton: 'button[aria-label="Redo"]',
    promptTextarea: DEFAULT_PROMPT_TEXTAREA,
    legacyPrompt: LEGACY_PROMPT_SELECTOR,
};

export function splitSelectorList(value?: string): string[] {
    if (!value) return [];
    return value
        .split(/[,\n]+/)
        .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
}
const uniqueSelectors = (values: string[]): string[] => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const value of values) {
        const trimmed = value.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        ordered.push(trimmed);
    }
    return ordered;
};

export const getGenerateButtonSelectors = (): string[] => {
    const base = [defaultSelectors.redoButton, ...defaultSelectors.makeVideoButtons];
    const custom = splitSelectorList(selectors.success.iconOnlyGenerateButton);
    return uniqueSelectors([...base, ...custom]);
};

export const getPromptSelectorCandidates = (): string[] => {
    const custom = splitSelectorList(selectors.prompt.textarea);
    const defaults = splitSelectorList(defaultSelectors.promptTextarea);
    return uniqueSelectors([...custom, ...defaults, defaultSelectors.legacyPrompt]);
};

export function queryIn(container: Element | Document, sel: string): Element | null {
    try {
        return container.querySelector(sel);
    } catch {
        return null;
    }
}

export function getMetaContent(sel: string): string | null {
    const el = document.querySelector<HTMLMetaElement>(sel);
    return el?.getAttribute('content') ?? null;
}

// Helper to determine if the generate button is in success state (icon-only or 'Redo' text)
export function isSuccessStateGenerateButton(btn: HTMLButtonElement | null): boolean {
    if (!btn) return false;
    const cls = btn.className || '';
    const hasSvg = !!btn.querySelector('svg');
    if (!hasSvg) return false;

    // Check if we're in active generation state (progress button present)
    const progressButton = document.querySelector('button[aria-label="Video Options"]');
    const hasProgressPercentage = progressButton?.textContent?.match(/\d+%/);
    if (hasProgressPercentage) return false; // Don't trigger during active generation

    const text = btn.textContent?.trim() || '';
    const isIconOnly = text.length === 0 && cls.includes('w-8') && cls.includes('h-8');
    const isRedoText = text === 'Redo' && cls.includes('h-8');

    return isIconOnly || isRedoText;
}