/**
 * Grok Auto Retry – Main World Fetch Interceptor
 *
 * This script is injected into the PAGE's main world via manifest "world":"MAIN".
 * It intercepts Grok's fetch calls to capture streaming video-generation events
 * and dispatches them to the content-script world via CustomEvent on document.
 */
(function () {
	"use strict";

	var BUILD_ID = "MW-20260316C";

	if (window.__grokRetryInterceptorInstalled) return;
	window.__grokRetryInterceptorInstalled = true;

	/* ---- Force tab to appear always-visible to Grok ---- */
	try {
		Object.defineProperty(document, "visibilityState", {
			get: function () {
				return "visible";
			},
			configurable: true,
		});
		Object.defineProperty(document, "hidden", {
			get: function () {
				return false;
			},
			configurable: true,
		});
		document.addEventListener(
			"visibilitychange",
			function (e) {
				e.stopImmediatePropagation();
			},
			true
		);
		console.log("[Grok Retry MW] Page Visibility API overridden — tab always appears active");
	} catch (e) {
		console.warn("[Grok Retry MW] Failed to override visibility API:", e);
	}

	var decoder = new TextDecoder();

	function shouldIntercept(input) {
		try {
			var url;
			if (typeof input === "string") url = input;
			else if (input instanceof URL) url = input.href;
			else if (input instanceof Request) url = input.url;
			else return null;

			if (url.includes("/rest/app-chat/conversations/new") || url.includes("/rest/media/post/list")) {
				return url;
			}
		} catch (_) {
			/* ignore */
		}
		return null;
	}

	function dispatch(type, payload) {
		try {
			window.postMessage({ source: "grok-retry-mw", type: type, payload: payload }, "*");
		} catch (_) {
			/* ignore */
		}
	}

	function parseJSON(raw) {
		try {
			return JSON.parse(raw);
		} catch (_) {
			return null;
		}
	}

	/* ---- streaming chat response parser ---- */

	async function processStream(response) {
		var reader = response.body && response.body.getReader();
		if (!reader) return;

		var buffer = "";
		var inString = false;
		var escapeNext = false;
		var braceDepth = 0;

		function flush(isFinal) {
			if (!buffer) return;
			var startIndex = 0;
			inString = false;
			escapeNext = false;
			braceDepth = 0;

			for (var i = 0; i < buffer.length; i++) {
				var ch = buffer[i];
				if (escapeNext) {
					escapeNext = false;
					continue;
				}
				if (ch === "\\") {
					escapeNext = true;
					continue;
				}
				if (ch === '"') {
					inString = !inString;
					continue;
				}
				if (inString) continue;

				if (ch === "{") {
					if (braceDepth === 0) startIndex = i;
					braceDepth++;
				} else if (ch === "}") {
					braceDepth--;
					if (braceDepth === 0) {
						var chunk = buffer.slice(startIndex, i + 1).trim();
						if (chunk) {
							var parsed = parseJSON(chunk);
							if (parsed) dispatch("grok-retry:payload", parsed);
						}
					}
				}
			}
			buffer = braceDepth > 0 && !isFinal ? buffer.slice(startIndex) : "";
		}

		try {
			while (true) {
				var result = await reader.read();
				if (result.done) break;
				if (!result.value) continue;
				buffer += decoder.decode(result.value, { stream: true });
				flush(false);
			}
			buffer += decoder.decode();
			flush(true);
		} catch (e) {
			console.warn("[Grok Retry MW] Stream read error:", e);
		}
	}

	/* ---- media/post/list JSON response ---- */

	async function processMediaList(response) {
		try {
			var data = await response.json();
			dispatch("grok-retry:media-list", data);
		} catch (e) {
			console.warn("[Grok Retry MW] Media list parse error:", e);
		}
	}

	/* ---- fetch monkey-patch ---- */

	var originalFetch = window.fetch;
	var loggedUrls = {};

	window.fetch = async function (input, init) {
		// Diagnostic: log unique Grok API paths we see
		try {
			var rawUrl =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.href
						: input instanceof Request
							? input.url
							: "";
			if (rawUrl.includes("/rest/") || rawUrl.includes("/api/")) {
				var shortUrl = rawUrl.replace(/\?.*/, "").replace(/https:\/\/[^/]+/, "");
				if (!loggedUrls[shortUrl]) {
					loggedUrls[shortUrl] = true;
					console.log("[Grok Retry MW] Fetch seen:", shortUrl);
				}
			}
		} catch (_) {}

		var response = await originalFetch.call(window, input, init);
		try {
			var url = shouldIntercept(input);
			if (url && response && response.body) {
				console.log("[Grok Retry MW] Intercepting:", url.replace(/https:\/\/[^/]+/, ""));
				if (url.includes("/rest/app-chat/conversations/new")) {
					processStream(response.clone());
				} else if (url.includes("/rest/media/post/list")) {
					processMediaList(response.clone());
				}
			}
		} catch (e) {
			console.warn("[Grok Retry MW] Intercept error:", e);
		}
		return response;
	};

	/* ---- prompt-writing bridge (isolated world -> main world) ---- */

	window.addEventListener("message", function (event) {
		if (event.source !== window) return;
		var msg = event.data;
		if (!msg || msg.source !== "grok-retry-cs") return;

		if (msg.type === "write-prompt") {
			var selector = msg.selector;
			var value = msg.value;
			if (!selector || !value) return;

			var el = document.querySelector(selector);
			if (!el) {
				console.warn("[Grok Retry MW] write-prompt: element not found for", selector);
				return;
			}

			var written = false;
			if (el instanceof HTMLTextAreaElement) {
				var setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
				if (setter && setter.set) {
					setter.set.call(el, value);
				} else {
					el.value = value;
				}
				el.dispatchEvent(new Event("input", { bubbles: true }));
				el.dispatchEvent(new Event("change", { bubbles: true }));
				written = true;
			} else if (el instanceof HTMLInputElement) {
				var setter2 = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
				if (setter2 && setter2.set) {
					setter2.set.call(el, value);
				} else {
					el.value = value;
				}
				el.dispatchEvent(new Event("input", { bubbles: true }));
				el.dispatchEvent(new Event("change", { bubbles: true }));
				written = true;
			} else if (el.isContentEditable || el.getAttribute("contenteditable") === "true") {
				el.focus();
				try {
					document.execCommand("selectAll");
					var ok = document.execCommand("insertText", false, value);
					if (!ok) {
						el.innerHTML = "";
						el.appendChild(document.createTextNode(value));
					}
				} catch (_) {
					el.innerHTML = "";
					el.appendChild(document.createTextNode(value));
				}
				el.dispatchEvent(new Event("input", { bubbles: true }));
				written = true;
			}

			console.log("[Grok Retry MW] write-prompt:", written ? "OK" : "unsupported element", el.tagName);
		}

		if (msg.type === "click-button") {
			var btnSelector = msg.selector;
			if (!btnSelector) return;
			var btn = document.querySelector(btnSelector);
			if (btn) {
				btn.click();
				console.log("[Grok Retry MW] click-button: clicked", btnSelector);
			} else {
				console.warn("[Grok Retry MW] click-button: not found", btnSelector);
			}
		}
	});

	console.log("[Grok Retry] Main world fetch interceptor installed (" + BUILD_ID + ")");
})();
