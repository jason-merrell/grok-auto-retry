// Custom selectors will be loaded asynchronously, but we provide sync defaults
let customSelectors: {
    notificationSection?: string;
    makeVideoButton?: string;
    videoElement?: string;
    promptTextarea?: string;
} = {};

// Load custom selectors from chrome.storage.sync
if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.sync.get('grokRetry_globalSettings', (result) => {
        if (result.grokRetry_globalSettings?.customSelectors) {
            customSelectors = result.grokRetry_globalSettings.customSelectors;
            console.log('[Selectors] Loaded custom selectors:', customSelectors);
        }
    });
}

export const selectors = {
    pageType: {
        imaginePost: 'link[rel="canonical"][href*="/imagine/post/"]',
    },
    containers: {
        main: 'main',
    },
    notifications: {
        section: customSelectors.notificationSection || 'section[aria-label*="Notifications"][aria-live="polite"]',
        toast: 'section[aria-label*="Notifications"] li.toast',
        moderationToastText: 'section[aria-label*="Notifications"] li.toast[data-type="error"] :is(span, div)',
    },
    success: {
        imageTag: 'main img[src*="imagine-public.x.ai"], main img[src*="/imagine/post/"]',
        ogImageMeta: 'meta[property="og:image"], meta[name="twitter:image"]',
        legacyVideo: customSelectors.videoElement || 'video[id="sd-video"]',
        iconOnlyGenerateButton: customSelectors.makeVideoButton || 'button[aria-label="Make video"]',
    },
    prompt: {
        textarea: customSelectors.promptTextarea || 'textarea[name*="prompt"], [contenteditable="true"]',
    },
} as const;

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

// Default button selectors supporting multiple languages
export const DEFAULT_BUTTON_SELECTORS = [
    'button[aria-label="Redo"]',           // English - retries after first generation
    'button[aria-label="Rehacer"]',        // Spanish - retries after first generation
    'button[aria-label="Make video"]',     // English - first generation
    'button[aria-label="Crear video"]',    // Spanish - first generation
];

// Helper to resolve button selectors (custom or default multi-language)
export function getButtonSelectors(customSelector?: string): string[] {
    return customSelector ? [customSelector] : DEFAULT_BUTTON_SELECTORS;
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
    // Support both English "Redo" and Spanish "Rehacer"
    const isRedoText = (text === 'Redo' || text === 'Rehacer') && cls.includes('h-8');
    
    return isIconOnly || isRedoText;
}