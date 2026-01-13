// Minimal test-only debug surface. Safe no-op in non-test builds.
export function setupDebug() {
    try {
        const w = window as any;
        if (!w.__grok_debug) {
            w.__grok_debug = {
                // Placeholders; can be wired to real state later
                get retryCount() { return w.__grok_retryCount ?? 0; },
                get canRetry() { return !!w.__grok_canRetry; },
                get cooldownPending() { return !!w.__grok_cooldownPending; },
                version: '1',
            };
        }

        // Test-only control surface
        if (!w.__grok_test) {
            w.__grok_test = {
                activateSession(postId?: string) {
                    try {
                        // Prefer app-side bridge if available
                        if (w.__grok_test && typeof w.__grok_test.activateSession === 'function' && w.__grok_test !== this) {
                            w.__grok_test.activateSession(postId);
                            return;
                        }
                        const id = postId || w.__grok_test?.__retrySessionKey || w.__grok_activePostId || '__unknown__';
                        const key = `grokRetrySession_${id}`;
                        const stored = w.sessionStorage.getItem(key);
                        const existing = stored ? JSON.parse(stored) : {};
                        w.sessionStorage.setItem(key, JSON.stringify({ ...existing, isSessionActive: true }));
                    } catch { }
                },
                setActivePostId(postId?: string) {
                    try {
                        const id = postId || '__unknown__';
                        w.__grok_forcedPostId = id;
                        w.__grok_activePostId = id;
                        w.__grok_activeSessionKey = id;
                    } catch { }
                },
                getActivePostId() {
                    try {
                        return w.__grok_activePostId || null;
                    } catch {
                        return null;
                    }
                },
                getSessionSnapshot(postId?: string) {
                    try {
                        const id = postId || w.__grok_test?.__retrySessionKey || w.__grok_activeSessionKey || w.__grok_activePostId || w.__grok_forcedPostId || '__unknown__';
                        const key = `grokRetrySession_${id}`;
                        const stored = w.sessionStorage.getItem(key);
                        return stored ? JSON.parse(stored) : null;
                    } catch {
                        return null;
                    }
                },
                startSession(postId?: string) {
                    try {
                        const now = Date.now();
                        w.__grok_attempts = w.__grok_attempts || {};
                        const attemptKey = postId || w.__grok_test?.__retrySessionKey || w.__grok_activeSessionKey || '__unknown__';
                        w.__grok_attempts[attemptKey] = now;
                        // Reflect into sessionStorage so hooks read it
                        const id = attemptKey;
                        const key = `grokRetrySession_${id}`;
                        const stored = w.sessionStorage.getItem(key);
                        const existing = stored ? JSON.parse(stored) : {};
                        w.sessionStorage.setItem(key, JSON.stringify({ ...existing, isSessionActive: true, retryCount: existing.retryCount ?? 0 }));
                        w.__grok_canRetry = true;
                    } catch { }
                },
                endSession() {
                    try { w.__grok_canRetry = false; } catch { }
                },
                enableRetry(postId?: string) {
                    try {
                        // Prefer app-side bridge if available
                        if (w.__grok_test && typeof w.__grok_test.enableRetry === 'function' && w.__grok_test !== this) {
                            w.__grok_test.enableRetry(postId);
                            return;
                        }
                        const id = postId || w.__grok_test?.__retrySessionKey || w.__grok_activeSessionKey || w.__grok_activePostId || '__unknown__';
                        w.__grok_canRetry = true;
                        const key = `grokRetrySession_${id}`;
                        const stored = w.sessionStorage.getItem(key);
                        const existing = stored ? JSON.parse(stored) : {};
                        w.sessionStorage.setItem(key, JSON.stringify({ ...existing, canRetry: true }));
                        if (typeof w.__grok_retryCount !== 'number') w.__grok_retryCount = 0;
                    } catch { }
                },
                disableRetry(postId?: string) {
                    try {
                        const id = postId || w.__grok_test?.__retrySessionKey || w.__grok_activeSessionKey || w.__grok_activePostId || '__unknown__';
                        const key = `grokRetrySession_${id}`;
                        const stored = w.sessionStorage.getItem(key);
                        const existing = stored ? JSON.parse(stored) : {};
                        w.sessionStorage.setItem(key, JSON.stringify({ ...existing, canRetry: false }));
                        w.__grok_canRetry = false;
                    } catch { }
                },
                getForcedPostId() { return w.__grok_forcedPostId || null; },
                getRetryCount() { return w.__grok_retryCount ?? 0; },
                isCooldownPending() { return !!w.__grok_cooldownPending; },
                getLastAttemptTime() {
                    const attemptKey = w.__grok_test?.__retrySessionKey || w.__grok_activeSessionKey || '__unknown__';
                    return (w.__grok_attempts && w.__grok_attempts[attemptKey]) || 0;
                },
            };
        }
    } catch { }
}
