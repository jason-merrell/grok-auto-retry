import { useEffect, useCallback, useRef } from "react";
import { selectors } from "../config/selectors";

const MODERATION_TEXT = "Content Moderated. Try a different idea.";
const RATE_LIMIT_TEXT = "Rate limit reached";
const MODERATION_TRIGGER_COOLDOWN_MS = 5000; // minimum ms between callback invocations

interface ModerationDetectorOptions {
	onModerationDetected: () => void;
	onRateLimitDetected?: () => void;
	enabled: boolean;
}

export const useModerationDetector = ({ onModerationDetected, onRateLimitDetected, enabled }: ModerationDetectorOptions) => {
	// All gating state lives in refs to avoid stale-closure issues with useCallback
	const lastTriggerAtRef = useRef<number>(0);
	const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const rateLimitFiredRef = useRef(false);
	const moderationVisibleRef = useRef(false);
	const diagLoggedRef = useRef(false);

	// Keep latest callbacks in refs so the check function never goes stale
	const onModRef = useRef(onModerationDetected);
	onModRef.current = onModerationDetected;
	const onRLRef = useRef(onRateLimitDetected);
	onRLRef.current = onRateLimitDetected;

	const checkForModeration = useCallback(() => {
		let isModerationDetected = false;
		let isRateLimitDetected = false;

		const notificationsSection = document.querySelector(selectors.notifications.section);

		// One-time diagnostic
		if (!diagLoggedRef.current) {
			diagLoggedRef.current = true;
			console.log("[Grok Retry] ModerationDetector diag", {
				selectorUsed: selectors.notifications.section,
				notifSectionFound: !!notificationsSection,
				notifSectionTag: notificationsSection?.tagName,
				notifSectionHTML: notificationsSection?.innerHTML?.substring(0, 200),
			});
		}

		if (notificationsSection) {
			const sectionText = notificationsSection.textContent ?? "";
			if (sectionText.includes(MODERATION_TEXT)) isModerationDetected = true;
			if (sectionText.includes(RATE_LIMIT_TEXT)) isRateLimitDetected = true;
		}

		// Fallback: full body scan
		if (!isModerationDetected) {
			const bodyText = document.body?.textContent ?? "";
			if (bodyText.includes(MODERATION_TEXT)) isModerationDetected = true;
			if (!isRateLimitDetected && bodyText.includes(RATE_LIMIT_TEXT)) isRateLimitDetected = true;
		}

		// --- Moderation handling ---
		if (isModerationDetected) {
			// Track edge: was NOT visible last check → IS visible now  (rising edge)
			const isRisingEdge = !moderationVisibleRef.current;
			moderationVisibleRef.current = true;

			if (isRisingEdge && !pendingTimerRef.current) {
				// Schedule callback (debounce 100ms)
				pendingTimerRef.current = setTimeout(() => {
					pendingTimerRef.current = null;
					const now = Date.now();
					if (now - lastTriggerAtRef.current < MODERATION_TRIGGER_COOLDOWN_MS) {
						console.log("[Grok Retry] Moderation detected but cooldown active, skipping callback");
						// Reset so the next poll cycle re-fires after cooldown expires
						moderationVisibleRef.current = false;
						return;
					}
					lastTriggerAtRef.current = now;
					// Reset edge tracker AFTER firing so repeated presence re-triggers
					// (gated by the cooldown above)
					moderationVisibleRef.current = false;
					console.log("[Grok Retry] Moderation detected — firing callback");
					try {
						(window as any).__grok_append_log?.("Moderation detected", "warn");
					} catch {}
					onModRef.current();
				}, 100);
			}
		} else {
			// Text disappeared → reset edge tracker so the NEXT appearance fires again
			moderationVisibleRef.current = false;
		}

		// --- Rate limit handling ---
		if (isRateLimitDetected && !rateLimitFiredRef.current) {
			rateLimitFiredRef.current = true;
			if (pendingTimerRef.current) {
				clearTimeout(pendingTimerRef.current);
				pendingTimerRef.current = null;
			}
			console.warn("[Grok Retry] Rate limit detected — cancelling active sessions");
			try {
				(window as any).__grok_append_log?.(
					"Rate limit detected — cancelling active sessions. Please wait before retrying.",
					"warn"
				);
			} catch {}
			onRLRef.current?.();
		} else if (!isRateLimitDetected) {
			rateLimitFiredRef.current = false;
		}
	}, []); // No deps — everything is refs

	useEffect(() => {
		if (!enabled) return;

		// Reset edge tracker when hook re-enables so existing toast is treated as new
		moderationVisibleRef.current = false;

		// Initial check
		checkForModeration();

		// Observe notifications section + body
		const notifSection = document.querySelector(selectors.notifications.section);
		const targets: Node[] = [];
		if (notifSection) targets.push(notifSection);
		targets.push(document.body);

		const observer = new MutationObserver((mutations) => {
			if (mutations.some((m) => m.type === "childList")) {
				checkForModeration();
			}
		});

		for (const target of targets) {
			observer.observe(target, { childList: true, subtree: true });
		}

		// Polling fallback
		const pollId = setInterval(checkForModeration, 1500);

		return () => {
			observer.disconnect();
			clearInterval(pollId);
			if (pendingTimerRef.current) {
				clearTimeout(pendingTimerRef.current);
				pendingTimerRef.current = null;
			}
		};
	}, [enabled, checkForModeration]);

	return {
		moderationDetected: moderationVisibleRef.current,
		rateLimitDetected: rateLimitFiredRef.current,
		checkForModeration,
	};
};
