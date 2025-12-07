export const selectors = {
    pageType: {
        imaginePost: 'link[rel="canonical"][href*="/imagine/post/"]',
    },
    containers: {
        main: 'main',
    },
    notifications: {
        section: 'section[aria-label*="Notifications"][aria-live="polite"]',
        toast: 'section[aria-label*="Notifications"] li.toast',
        moderationToastText: 'section[aria-label*="Notifications"] li.toast[data-type="error"] :is(span, div)',
    },
    success: {
        imageTag: 'main img[src*="imagine-public.x.ai"], main img[src*="/imagine/post/"]',
        ogImageMeta: 'meta[property="og:image"], meta[name="twitter:image"]',
        legacyVideo: 'video[id="sd-video"]',
        iconOnlyGenerateButton: 'button[aria-label="Make video"]',
    },
    prompt: {
        textarea: 'textarea[name*="prompt"], [contenteditable="true"]',
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