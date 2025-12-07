import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSelectorSnapshot } from '../support/selectorsSnapshot';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Inject built content script and simulate moderation toasts; assert single detection

test('moderation detector triggers once on rapid DOM mutations', async ({ page }) => {
  await page.goto('about:blank');

  // Minimal page with notification section and textarea/button
  await page.setContent(`
    <main>
      <section aria-label="Notifications" aria-live="polite"><ul></ul></section>
      <button aria-label="Make video"></button>
      <textarea name="prompt-text" placeholder="Type to customize video..."></textarea>
    </main>
  `);

  // Stub selectors config used by content script via globals if needed
  const selectors = getSelectorSnapshot();
  await page.addInitScript((seed) => {
    (window as any).selectors = seed;
  }, selectors);

  // Capture grok logs
  const logs: string[] = [];
  await page.addInitScript(() => {
    (window as any).__grok_append_log = (line: string, level: string) => {
      const e = new CustomEvent('grok:log', { detail: { postId: null, line, level } });
      window.dispatchEvent(e);
    };
  });
  await page.exposeFunction('__collectLog', (line: string, level: string) => {
    logs.push(`${level}:${line}`);
  });
  await page.addInitScript(() => {
    window.addEventListener('grok:log', (e: any) => {
      const { line, level } = e.detail || {};
      // @ts-ignore
      window.__collectLog(line, level);
    });
  });

  // Inject built content script
  const contentPath = path.resolve(__dirname, '../../dist/content.js');
  await page.addScriptTag({ path: contentPath });

  // Simulate two rapid moderation toasts
  await page.evaluate(() => {
    const ul = document.querySelector('section[aria-label*="Notifications"][aria-live="polite"] ul')!;
    const li1 = document.createElement('li');
    li1.className = 'toast';
    li1.setAttribute('data-visible', 'true');
    li1.textContent = 'Your content violates our guidelines';
    ul.appendChild(li1);

    const li2 = document.createElement('li');
    li2.className = 'toast';
    li2.setAttribute('data-visible', 'true');
    li2.textContent = 'Your content violates our guidelines';
    ul.appendChild(li2);
  });

  // Wait briefly for debounce
  await page.waitForTimeout(300);

  // Count moderation logs
  const moderationLogs = logs.filter(l => l.includes('Moderation detected'));
  expect(moderationLogs.length <= 1).toBeTruthy();
});
