import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const POST_ID = '1234567890abcdef1234567890abcdef';

test('rate limit detection cancels the active session immediately', async ({ page }) => {
    // Provide chrome.storage shim before any extension code runs
    await page.addInitScript(() => {
        const memoryLocal: Record<string, any> = {};
        const memorySync: Record<string, any> = {};
        const ensureKeys = (keys: any): string[] => {
            if (!keys) return [];
            if (Array.isArray(keys)) return keys;
            if (typeof keys === 'string') return [keys];
            return Object.keys(keys);
        };

        window.chrome = {
            runtime: { lastError: null },
            storage: {
                local: {
                    get: (keys: any, cb: (res: Record<string, any>) => void) => {
                        const result: Record<string, any> = {};
                        for (const key of ensureKeys(keys)) {
                            result[key] = memoryLocal[key];
                        }
                        cb(result);
                    },
                    set: (obj: Record<string, any>, cb?: () => void) => {
                        Object.assign(memoryLocal, obj);
                        cb?.();
                    },
                    remove: (keys: string | string[], cb?: () => void) => {
                        const list = Array.isArray(keys) ? keys : [keys];
                        for (const key of list) {
                            delete memoryLocal[key];
                        }
                        cb?.();
                    },
                },
                sync: {
                    get: (keys: any, cb: (res: Record<string, any>) => void) => {
                        const result: Record<string, any> = {};
                        for (const key of ensureKeys(keys)) {
                            result[key] = memorySync[key];
                        }
                        cb(result);
                    },
                    set: (obj: Record<string, any>, cb?: () => void) => {
                        Object.assign(memorySync, obj);
                        cb?.();
                    },
                },
                onChanged: {
                    addListener: () => undefined,
                    removeListener: () => undefined,
                    hasListener: () => false,
                },
            },
        } as any;
    });

    await page.goto(`https://example.com/imagine/post/${POST_ID}`);

    await page.evaluate(() => {
        document.body.innerHTML = `
      <main>
        <section aria-label="Notifications" aria-live="polite"><ul></ul></section>
        <button aria-label="Make video"></button>
        <textarea aria-label="Make a video" placeholder="Type to customize video..."></textarea>
      </main>
    `;
    });

    const contentPath = path.resolve(__dirname, '../../dist/content.js');
    await page.addScriptTag({ path: contentPath });

    await page.waitForFunction(() => !!(window as any).__grok_test?.setActivePostId);

    await page.evaluate(() => {
        (window as any).__grok_test = (window as any).__grok_test || {};
        (window as any).__grok_test.skipAutoCancel = true;
    });

    await page.evaluate((id) => {
        (window as any).__grok_test.setActivePostId(id);
        window.dispatchEvent(new Event('popstate'));
    }, POST_ID);

    await page.waitForFunction((id) => (window as any).__grok_test?.getHookPostId?.() === id, POST_ID);

    const currentPostId = await page.evaluate(() => (window as any).__grok_test?.getHookPostId?.());
    expect(currentPostId).toBe(POST_ID);

    await page.waitForFunction(() => typeof (window as any).__grok_test?.startSession === 'function');

    await page.evaluate(() => {
        (window as any).__grok_test.startSession();
    });

    const startedSnapshot = await page.evaluate(() => (window as any).__grok_test?.getSessionSnapshot?.());
    expect(startedSnapshot).not.toBeNull();
    expect(startedSnapshot?.isSessionActive).toBe(true);

    await page.evaluate(() => {
        const section = document.querySelector('section[aria-live="polite"][aria-label*="Notifications"]');
        if (!section) throw new Error('Notifications section not found');
        const list = section.querySelector('ul') || section.appendChild(document.createElement('ul'));
        const toast = document.createElement('li');
        toast.className = 'toast';
        toast.setAttribute('data-visible', 'true');
        const text = document.createElement('span');
        text.textContent = 'Rate limit reached. Please slow down.';
        toast.appendChild(text);
        list.appendChild(toast);
    });

    await page.waitForFunction(() => {
        const snapshot = (window as any).__grok_test?.getSessionSnapshot?.();
        return snapshot?.isSessionActive === false && snapshot?.lastSessionOutcome === 'cancelled';
    });

    const finalSnapshot = await page.evaluate(() => (window as any).__grok_test?.getSessionSnapshot?.());

    expect(finalSnapshot).not.toBeNull();
    expect(finalSnapshot.isSessionActive).toBe(false);
    expect(finalSnapshot.lastSessionOutcome).toBe('cancelled');
});
