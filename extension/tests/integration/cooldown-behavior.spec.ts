import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSelectorSnapshot } from '../support/selectorsSnapshot';

const TEST_POST_ID = '1234567890abcdef1234567890abcdef';
const SCENE_URL = `http://grok.test/imagine/post/${TEST_POST_ID}`;
const STORAGE_BRIDGE_VERSION = 'storage-hook@1';

// Assert scheduler respects 8s cooldown using app test bridge
test('scheduler respects cooldown timing', async ({ page }) => {
  test.setTimeout(20000);

  page.on('console', (msg) => {
    console.log('page console:', msg.text());
  });

  const selectors = getSelectorSnapshot();
  await page.addInitScript((seed) => {
    (window as any).__grok_append_log = () => {};
    (window as any).selectors = seed;
    const w = window as any;
    w.__grok_test = w.__grok_test || {};
    w.__grok_test.skipAutoCancel = true;
    const listeners: Record<string, Array<(...args: any[]) => void>> = {};
    const acquire = (key: string) => {
      listeners[key] = listeners[key] || [];
      return listeners[key];
    };
    const emit = (key: string, ...args: any[]) => {
      acquire(key).forEach((handler) => {
        try {
          handler(...args);
        } catch {}
      });
    };
    const makeStorageArea = (areaName: 'local' | 'sync') => {
      const store: Record<string, any> = {};
      return {
        get(keys: string[] | string, callback: (items: Record<string, any>) => void) {
          const result: Record<string, any> = {};
          const keyArray = Array.isArray(keys) ? keys : [keys];
          keyArray.forEach((key) => {
            result[key] = store[key];
          });
          callback(result);
        },
        set(items: Record<string, any>, callback?: () => void) {
          const changes: Record<string, { oldValue: any; newValue: any }> = {};
          Object.entries(items).forEach(([key, value]) => {
            const oldValue = store[key];
            store[key] = value;
            changes[key] = { oldValue, newValue: value };
          });
          callback?.();
          if (Object.keys(changes).length > 0) {
            emit('storage.onChanged', changes, areaName);
          }
        },
        remove(keys: string[] | string, callback?: () => void) {
          const keyArray = Array.isArray(keys) ? keys : [keys];
          const changes: Record<string, { oldValue: any; newValue: any }> = {};
          keyArray.forEach((key) => {
            if (key in store) {
              changes[key] = { oldValue: store[key], newValue: undefined };
              delete store[key];
            }
          });
          callback?.();
          if (Object.keys(changes).length > 0) {
            emit('storage.onChanged', changes, areaName);
          }
        },
        clear(callback?: () => void) {
          const keys = Object.keys(store);
          const changes: Record<string, { oldValue: any; newValue: any }> = {};
          keys.forEach((key) => {
            changes[key] = { oldValue: store[key], newValue: undefined };
            delete store[key];
          });
          callback?.();
          if (Object.keys(changes).length > 0) {
            emit('storage.onChanged', changes, areaName);
          }
        },
      };
    };
    const storageLocal = makeStorageArea('local');
    const storageSync = makeStorageArea('sync');
    (window as any).chrome = {
      storage: {
        local: storageLocal,
        sync: storageSync,
        onChanged: {
          addListener: (handler: (...args: any[]) => void) => {
            acquire('storage.onChanged').push(handler);
          },
          removeListener: (handler: (...args: any[]) => void) => {
            const list = acquire('storage.onChanged');
            const idx = list.indexOf(handler);
            if (idx >= 0) list.splice(idx, 1);
          },
        },
      },
      runtime: {
        lastError: null,
        onMessage: {
          addListener: (handler: (...args: any[]) => void) => {
            acquire('runtime.onMessage').push(handler);
          },
          removeListener: (handler: (...args: any[]) => void) => {
            const list = acquire('runtime.onMessage');
            const idx = list.indexOf(handler);
            if (idx >= 0) list.splice(idx, 1);
          },
        },
        sendMessage: (_message: any, responseCallback?: (response?: any) => void) => {
          emit('runtime.onMessage', _message, {}, responseCallback || (() => {}));
        },
      },
    };
  });

  const sceneHtml = `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>Cooldown Test</title>
      <link rel="canonical" href="https://grok.test/imagine/post/${TEST_POST_ID}" />
    </head>
    <body>
      <main>
        <section aria-label="Notifications" aria-live="polite"><ul></ul></section>
        <button aria-label="Make video"></button>
        <textarea aria-label="Make a video" name="prompt-text" placeholder="Type to customize video..."></textarea>
      </main>
    </body>
  </html>`;

  const routeHandler = (route: any) => {
    route.fulfill({ status: 200, contentType: 'text/html', body: sceneHtml });
  };
  await page.route(SCENE_URL, routeHandler);
  await page.goto(SCENE_URL);
  await page.unroute(SCENE_URL, routeHandler);

  // Inject built content script
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const contentJs = path.resolve(__dirname, '../../dist/content.js');
  await page.addScriptTag({ path: contentJs });

  // Ensure content loaded and debug available
  await page.waitForFunction(() => !!(window as any).__grok_content_loaded, { timeout: 5000 });
  const debugPresent = await page.evaluate(() => !!(window as any).__grok_debug);
  expect(debugPresent).toBe(true);

  await page.waitForFunction(() => !!(window as any).__grok_test, { timeout: 5000 });
  await page.waitForFunction((expected) => {
    return (window as any).__grok_test?.__bridgeVersion === expected;
  }, STORAGE_BRIDGE_VERSION, { timeout: 5000 });
  await page.waitForFunction((expected) => {
    return (window as any).__grok_test?.__retryBridgeVersion === expected;
  }, 'grok-retry@1', { timeout: 5000 });
  await page.waitForFunction((expected) => {
    return (window as any).__grok_test?.__retryPostId === expected;
  }, TEST_POST_ID, { timeout: 5000 });
  await page.evaluate(() => {
    const t = (window as any).__grok_test;
    if (t) {
      t.skipAutoCancel = true;
    }
  });
  await page.evaluate((id) => {
    const t = (window as any).__grok_test;
    t?.setActivePostId?.(id);
  }, TEST_POST_ID);
  const debugState = await page.evaluate(() => {
    const t = (window as any).__grok_test;
    return {
      forced: t?.getForcedPostId?.() || null,
      active: t?.getActivePostId?.() || null,
      rawActive: (window as any).__grok_activePostId || null,
      path: window.location.pathname,
    };
  });
  expect(debugState.active).toBe(TEST_POST_ID);
  await page.waitForFunction((id) => {
    const t = (window as any).__grok_test;
    return t?.getHookPostId?.() === id;
  }, TEST_POST_ID, { timeout: 5000 });
  await page.waitForFunction(() => {
    const t = (window as any).__grok_test;
    return t?.__storageHydrated === true;
  }, { timeout: 5000 });

  // Use test API bridge to start session and enable permit deterministically
  await page.waitForTimeout(100);
  await page.evaluate((id) => {
    const t = (window as any).__grok_test;
    if (!t?.startSession || !t?.markFailureDetected) {
      throw new Error('Test bridge missing session helpers');
    }
    if (t.startSession.length !== 0) {
      throw new Error('Retry bridge not ready: startSession length mismatch');
    }
    t.startSession();
    t.mergeSession?.({ lastPromptValue: 'Retry prompt from test', autoRetryEnabled: true, maxRetries: 3 }, id);
    t.markFailureDetected();
    t.mergeSession?.({ isSessionActive: true, canRetry: true }, id);
  }, TEST_POST_ID);
  const lastSave = await page.evaluate(() => (window as any).__grok_lastSave ?? null);
  console.log('last save', lastSave);
  const immediateSetStateCount = await page.evaluate(() => (window as any).__grok_lastSetStateCount ?? 0);
  console.log('immediate setState count', immediateSetStateCount);
  await page.waitForFunction(() => ((window as any).__grok_lastSetStateCount ?? 0) > 0, { timeout: 1000 }).catch(() => {});
  await page.waitForFunction(() => {
    const snapshot = (window as any).__grok_test?.getSessionSnapshot?.();
    return snapshot && snapshot.canRetry === true;
  }, { timeout: 5000 });

  const sessionSnapshot = await page.evaluate(() => (window as any).__grok_test.getSessionSnapshot?.());
  expect(sessionSnapshot?.isSessionActive).toBe(true);
  expect(sessionSnapshot?.canRetry).toBe(true);

  // Within 2s (<8s), expect no increment
  await page.waitForTimeout(2000);
  const early = await page.evaluate(() => {
    const snapshot = (window as any).__grok_test?.getSessionSnapshot?.();
    return snapshot?.retryCount ?? 0;
  });
  const earlySnapshot = await page.evaluate(() => (window as any).__grok_test?.getSessionSnapshot?.());
  console.log('early snapshot', earlySnapshot);
  expect(early).toBe(0);

  // After waiting past cooldown window, scheduler should increment and consume permit
  await page.waitForTimeout(10000);
  const afterSnapshot = await page.evaluate(() => (window as any).__grok_test?.getSessionSnapshot?.());
  const debugRetryCount = await page.evaluate(() => (window as any).__grok_debug?.retryCount ?? null);
  const debugCanRetry = await page.evaluate(() => (window as any).__grok_debug?.canRetry ?? null);
  const rawSession = await page.evaluate((id) => window.sessionStorage.getItem(`grokRetrySession_${id}`), TEST_POST_ID);
  const persistent = await page.evaluate((id) => new Promise((resolve) => {
    window.chrome.storage.local.get([`grokRetryPost_${id}`], (result: Record<string, unknown>) => {
      resolve(result[`grokRetryPost_${id}`] ?? null);
    });
  }), TEST_POST_ID);
  const schedulerTicks = await page.evaluate(() => (window as any).__grok_schedulerTick ?? 0);
  const schedulerGate = await page.evaluate(() => (window as any).__grok_schedulerGate ?? null);
  const hookState = await page.evaluate(() => (window as any).__grok_retryState ?? null);
  const lastSetState = await page.evaluate(() => (window as any).__grok_lastSetState ?? null);
  const setStateCount = await page.evaluate(() => (window as any).__grok_lastSetStateCount ?? 0);
  console.log('logs after run', afterSnapshot?.logs || []);
  console.log('debug retry', debugRetryCount, 'debug canRetry', debugCanRetry);
  console.log('raw session', rawSession);
  console.log('persistent snapshot', persistent);
  console.log('scheduler ticks', schedulerTicks);
  console.log('scheduler gate', schedulerGate);
  console.log('hook state', hookState);
  console.log('last setState', lastSetState);
  console.log('setState count', setStateCount);
  expect(afterSnapshot?.retryCount ?? 0).toBeGreaterThan(0);
  expect(afterSnapshot?.canRetry).toBe(false);
});
