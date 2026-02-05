import React, { useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGrokRetry } from "@/hooks/useGrokRetry";
import { useGrokRetryUI } from "@/hooks/useGrokRetryUI";
import { useGrokRetryGrokStorage } from "@/hooks/useGrokRetryGrokStorage";
import { useGrokRetrySuccessDetector } from "@/hooks/useGrokRetrySuccessDetector";
import { useGrokRetryPageTitle } from "@/hooks/useGrokRetryPageTitle";
import { useGrokRetryPromptCapture } from "@/hooks/useGrokRetryPromptCapture";
import { useGrokRetryPanelResize } from "@/hooks/useGrokRetryPanelResize";
import { useGrokRetryMiniToggleDrag } from "@/hooks/useGrokRetryMiniToggleDrag";
import { useGrokRetryRouteMatch } from "@/hooks/useGrokRetryRouteMatch";
import { useGrokRetryPostId } from "@/hooks/useGrokRetryPostId";
import { useGrokRetrySettings } from "@/hooks/useGrokRetrySettings";
import useGrokRetryPromptHistory from "@/hooks/useGrokRetryPromptHistory";
import { useGrokRetryMuteController } from "@/hooks/useGrokRetryMuteController";
import type { PromptHistoryLayer } from "@/lib/promptHistory";
import { writePromptValue } from "@/lib/promptInput";
import { ControlPanel } from "@/components/ControlPanel";
import { MiniToggle } from "@/components/MiniToggle";
import { ImaginePanel } from "@/components/ImaginePanel";
import { GlobalSettingsDialog } from "@/components/GlobalSettingsDialog";
import { Toaster } from "@/components/ui/toaster";

const ImaginePostApp: React.FC = () => {
	// Only show on /imagine/post/* routes
	const isImaginePostRoute = useGrokRetryRouteMatch("^/imagine/post/");
	const { postId, mediaId } = useGrokRetryPostId();
	const { settings: globalSettings, isLoading: globalSettingsLoading } = useGrokRetrySettings();
	const muteControl = useGrokRetryMuteController(isImaginePostRoute);
	const retry = useGrokRetry({ postId, mediaId });
	const {
		autoRetryEnabled,
		retryCount,
		maxRetries,
		videoGoal,
		videosGenerated,
		lastPromptValue,
		isSessionActive,
		lastAttemptTime,
		markFailureDetected,
		incrementVideosGenerated,
		setAutoRetryEnabled,
		setMaxRetries,
		setVideoGoal,
		resetRetries,
		updatePromptValue,
		clickMakeVideoButton,
		startSession,
		endSession,
		logs = [],
		originalPageTitle,
		isLoading,
		clearLogs,
		lastSessionOutcome,
		lastSessionSummary,
		appendLog, // Now comes from useGrokRetry
	} = retry;

	// Provide global append log helper for detectors (now uses centralized store)
	useEffect(() => {
		(window as any).__grok_append_log = appendLog;
		return () => {
			try {
				delete (window as any).__grok_append_log;
			} catch {}
		};
	}, [appendLog]);

	const { data: uiPrefs, save: saveUIPref } = useGrokRetryUI();
	const { capturePromptFromSite, copyPromptToSite, setupClickListener } = useGrokRetryPromptCapture();
	const { records: promptHistoryRecords, recordOutcome: recordPromptHistoryOutcome } = useGrokRetryPromptHistory();
	const panelResize = useGrokRetryPanelResize();
	const miniDrag = useGrokRetryMiniToggleDrag();
	const [showDebug, setShowDebug] = React.useState(false);
	const [settingsOpen, setSettingsOpen] = React.useState(false);
	const nextVideoTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
	const hasCheckedInterruptedSession = React.useRef(false);
	const [showResults, setShowResults] = React.useState(false);
	const lastSummarySignatureRef = React.useRef<string | null>(null);
	const sessionPromptRef = React.useRef<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		processPendingInlinePrompt(() => cancelled);
		return () => {
			cancelled = true;
		};
	}, [postId, mediaId]);

	const recordPromptOutcome = React.useCallback(
		(status: "success" | "failure", layer?: PromptHistoryLayer | null) => {
			const baseText = sessionPromptRef.current ?? lastPromptValue;
			if (!baseText) {
				return;
			}
			recordPromptHistoryOutcome({
				text: baseText,
				status,
				layer: layer ?? undefined,
			});
		},
		[recordPromptHistoryOutcome, lastPromptValue]
	);

	// Handle moderation detection
	const handleModerationDetected = React.useCallback(() => {
		// Don't retry if session is not active
		if (!isSessionActive) {
			console.log("[Grok Retry] Ignoring moderation - session not active");
			return;
		}

		// Check for rapid failure (≤6 seconds) - indicates immediate automated content check
		if (lastAttemptTime > 0) {
			const timeSinceAttempt = Date.now() - lastAttemptTime;
			if (timeSinceAttempt <= 6000) {
				console.warn("[Grok Retry] Rapid failure detected (<6s) - likely automated content check on prompt/image");
			}
		}

		const shouldRetry = autoRetryEnabled && retryCount < maxRetries;
		console.log("[Grok Retry] Moderation detected, current count:", retryCount);

		let promptSnapshot = sessionPromptRef.current ?? lastPromptValue;
		if (!promptSnapshot && retryCount === 0) {
			const captured = capturePromptFromSite();
			if (captured) {
				promptSnapshot = captured;
				sessionPromptRef.current = captured;
				updatePromptValue(captured);
				console.log("[Grok Retry] Auto-captured prompt on first moderation");
			}
		}

		const failureLayer = markFailureDetected();
		recordPromptOutcome("failure", failureLayer);

		if (!shouldRetry) {
			console.log("[Grok Retry] Moderation detected but not retrying:", {
				autoRetryEnabled,
				retryCount,
				maxRetries,
			});

			if (isSessionActive) {
				console.log("[Grok Retry] Ending session - no retry will occur");
				const outcome = autoRetryEnabled ? "failure" : "cancelled";
				endSession(outcome);
			}
			return;
		}

		if (promptSnapshot) {
			sessionPromptRef.current = promptSnapshot;
		}
	}, [
		isSessionActive,
		lastAttemptTime,
		autoRetryEnabled,
		retryCount,
		maxRetries,
		lastPromptValue,
		capturePromptFromSite,
		updatePromptValue,
		endSession,
		markFailureDetected,
		recordPromptOutcome,
	]);

	// Grok storage monitoring for moderation detection and validation
	// This monitors Grok's sessionStorage for authoritative video data
	// Pass postId (video post ID) - the hook will auto-resolve to parent image ID
	useGrokRetryGrokStorage(postId, {
		onModerationDetected: (video) => {
			console.log("[Grok Storage] Moderation detected/validated:", {
				videoId: video.videoId,
				createTime: video.createTime,
				prompt: video.videoPrompt || "(empty)",
				thumbnailUrl: video.thumbnailImageUrl,
			});

			// Trigger moderation handling as validation/fallback
			// This confirms UI detection or catches it if UI structure changes
			handleModerationDetected();
		},
		onVideoDetected: (video) => {
			console.log("[Grok Storage] Video detected:", {
				videoId: video.videoId,
				moderated: video.moderated,
				mode: video.mode,
				createTime: video.createTime,
			});
		},
		debug: false, // Disable debug logging in production
	});

	// Handle successful video generation
	const handleSuccess = React.useCallback(() => {
		// Only handle success if a session is active
		if (!isSessionActive) {
			console.log("[Grok Retry] Success detected but no active session - ignoring");
			if (nextVideoTimeoutRef.current) {
				clearTimeout(nextVideoTimeoutRef.current);
			}

			// Wait 8 seconds before next generation
			nextVideoTimeoutRef.current = setTimeout(() => {
				// Check if session is still active before proceeding
				if (!isSessionActive) {
					console.log("[Grok Retry] Skipping next video - session cancelled");
					return;
				}
				// Do not reset retryCount; maxRetries applies to whole session
				// Use overridePermit since this is a new video generation, not a retry
				clickMakeVideoButton(lastPromptValue, { overridePermit: true });
				nextVideoTimeoutRef.current = null;
			}, 8000);
		}
	}, [
		incrementVideosGenerated,
		videosGenerated,
		videoGoal,
		endSession,
		isSessionActive,
		clickMakeVideoButton,
		lastPromptValue,
		recordPromptOutcome,
	]);

	// Keep success detector running while on imagine post page, not just when session is active
	// This ensures we detect success even if session timeout occurs during video generation
	useGrokRetrySuccessDetector(handleSuccess, !!postId);

	// Auto-cancel interrupted sessions on mount (after refresh/navigation) - only once
	useEffect(() => {
		if ((window as any).__grok_test?.skipAutoCancel) {
			return;
		}
		console.log(
			"[Grok Retry] Auto-cancel effect - isLoading:",
			isLoading,
			"hasChecked:",
			hasCheckedInterruptedSession.current,
			"isSessionActive:",
			isSessionActive,
			"postId:",
			postId
		);

		// Wait for both loading to complete AND postId to be available
		if (!isLoading && postId && !hasCheckedInterruptedSession.current) {
			console.log("[Grok Retry] Checking for interrupted session - isSessionActive:", isSessionActive);
			if (isSessionActive) {
				console.log("[Grok Retry] Detected active session after page load - auto-canceling interrupted session");
				hasCheckedInterruptedSession.current = true;
				endSession("cancelled");
			} else {
				// Only mark as checked if we've waited long enough for session data to load
				// Use a small delay to ensure session state has fully settled
				setTimeout(() => {
					if (!isSessionActive) {
						console.log("[Grok Retry] No active session found after delay, marking as checked");
						hasCheckedInterruptedSession.current = true;
					}
				}, 50);
			}
		}
	}, [isLoading, isSessionActive, endSession, postId]);

	// Fallback check - run once after a short delay to catch any race conditions
	useEffect(() => {
		if ((window as any).__grok_test?.skipAutoCancel) {
			return;
		}
		const timeoutId = setTimeout(() => {
			console.log(
				"[Grok Retry] Fallback timeout - hasChecked:",
				hasCheckedInterruptedSession.current,
				"isSessionActive:",
				isSessionActive,
				"postId:",
				postId
			);
			if (!hasCheckedInterruptedSession.current && isSessionActive && postId) {
				console.log("[Grok Retry] Fallback: Detected active session after delay - auto-canceling");
				hasCheckedInterruptedSession.current = true;
				endSession("cancelled");
			}
		}, 200);

		return () => clearTimeout(timeoutId);
	}, []);

	// Set up page title updates
	useGrokRetryPageTitle(
		originalPageTitle,
		retryCount,
		maxRetries,
		autoRetryEnabled,
		false, // isRateLimited - no longer using UI-based rate limit detection
		videoGoal,
		videosGenerated,
		isSessionActive,
		lastSessionOutcome
	);

	React.useEffect(() => {
		if (!isSessionActive) {
			sessionPromptRef.current = null;
		}
	}, [isSessionActive]);

	// Auto-toggle debug panel based on session state and global settings preference
	useEffect(() => {
		if (globalSettingsLoading) {
			return;
		}

		if (!isSessionActive) {
			setShowDebug(false);
			return;
		}

		setShowResults(false);

		if (globalSettings.autoSwitchToDebug) {
			setShowDebug(true);
		}
	}, [isSessionActive, globalSettings.autoSwitchToDebug, globalSettingsLoading]);

	React.useEffect(() => {
		if (!lastSessionSummary) {
			lastSummarySignatureRef.current = null;
			setShowResults(false);
			return;
		}

		const { outcome, endedAt, retriesAttempted, completedVideos } = lastSessionSummary;
		const signature = `${outcome}:${endedAt ?? ""}:${retriesAttempted}:${completedVideos}`;
		if (lastSummarySignatureRef.current === signature) {
			return;
		}

		lastSummarySignatureRef.current = signature;

		if (
			(outcome === "success" || outcome === "failure" || outcome === "cancelled") &&
			globalSettings.autoSwitchToResultsOnComplete
		) {
			setShowResults(true);
			if (showDebug) {
				setShowDebug(false);
			}
		}
	}, [lastSessionSummary, showDebug, setShowDebug, globalSettings.autoSwitchToResultsOnComplete]);

	// Set up click listener for prompt capture
	useEffect(() => {
		return setupClickListener((value) => {
			updatePromptValue(value);
		});
	}, [setupClickListener, updatePromptValue]);

	// Clean up timeout on unmount
	useEffect(() => {
		return () => {
			if (nextVideoTimeoutRef.current) {
				clearTimeout(nextVideoTimeoutRef.current);
			}
		};
	}, []);

	const handlePromptChange = React.useCallback(
		(value: string) => {
			sessionPromptRef.current = value;
			updatePromptValue(value);
		},
		[updatePromptValue]
	);

	const handleCopyFromSite = () => {
		const value = capturePromptFromSite();
		if (value) {
			handlePromptChange(value);
		}
	};

	const handleCopyToSite = () => {
		if (lastPromptValue) {
			copyPromptToSite(lastPromptValue);
		}
	};

	const handlePromptAppend = (partial: string, position: "prepend" | "append") => {
		const currentPrompt = lastPromptValue || "";

		// Check if partial content (trimmed and without period) already exists in prompt
		const partialContent = partial.trim().replace(/\.$/, "");
		if (currentPrompt.toLowerCase().includes(partialContent.toLowerCase())) {
			return; // Already exists, don't add
		}

		const newPrompt = position === "prepend" ? partial + currentPrompt : currentPrompt + partial;

		handlePromptChange(newPrompt);
	};

	const handleGenerateVideo = React.useCallback(() => {
		// Capture prompt if not already captured
		let promptToUse = lastPromptValue;
		if (!promptToUse) {
			const captured = capturePromptFromSite();
			if (captured) {
				promptToUse = captured;
				updatePromptValue(captured);
			}
		}

		sessionPromptRef.current = promptToUse ?? null;

		// Pass the prompt directly to startSession to avoid reading stale state
		startSession(promptToUse);
		// Allow the initial manual click to proceed even before any failure notice
		clickMakeVideoButton(promptToUse, { overridePermit: true });
	}, [capturePromptFromSite, clickMakeVideoButton, lastPromptValue, startSession, updatePromptValue]);

	const handleCancelSession = React.useCallback(() => {
		// Clear any pending next video timeout
		if (nextVideoTimeoutRef.current) {
			clearTimeout(nextVideoTimeoutRef.current);
			nextVideoTimeoutRef.current = null;
			console.log("[Grok Retry] Cleared pending next video timeout");
		}
		endSession("cancelled");
		sessionPromptRef.current = null;
	}, [endSession]);

	const toggleMinimized = React.useCallback(() => {
		saveUIPref("isMinimized", !uiPrefs.isMinimized);
	}, [saveUIPref, uiPrefs.isMinimized]);

	const handleMinimizeClick = React.useCallback(() => {
		if (!miniDrag.dragMoved) {
			toggleMinimized();
		}
	}, [miniDrag.dragMoved, toggleMinimized]);

	const handleMaximizeToggle = React.useCallback(() => {
		saveUIPref("isMaximized", !uiPrefs.isMaximized);
	}, [saveUIPref, uiPrefs.isMaximized]);

	// Don't render if not on imagine/post route
	if (!isImaginePostRoute) {
		return null;
	}

	if (uiPrefs.isMinimized) {
		return (
			<div className="dark animate-in fade-in duration-200">
				<TooltipProvider>
					<MiniToggle
						position={miniDrag.position}
						isDragging={miniDrag.isDragging}
						dragMoved={miniDrag.dragMoved}
						onDragStart={miniDrag.handleDragStart}
						onRestore={handleMinimizeClick}
					/>
				</TooltipProvider>
			</div>
		);
	}

	return (
		<div className={`dark animate-in fade-in duration-300 ${!uiPrefs.isMaximized ? "slide-in-from-right-4" : ""}`}>
			<TooltipProvider>
				<ControlPanel
					width={panelResize.width}
					height={panelResize.height}
					fontSize={panelResize.fontSize}
					isMaximized={uiPrefs.isMaximized}
					autoRetryEnabled={autoRetryEnabled}
					retryCount={retryCount}
					maxRetries={maxRetries}
					videoGoal={videoGoal}
					videosGenerated={videosGenerated}
					promptValue={lastPromptValue}
					isSessionActive={isSessionActive}
					onResizeStart={panelResize.handleResizeStart}
					onMinimize={() => saveUIPref("isMinimized", true)}
					onMaximizeToggle={handleMaximizeToggle}
					onAutoRetryChange={setAutoRetryEnabled}
					onMaxRetriesChange={setMaxRetries}
					onVideoGoalChange={setVideoGoal}
					onResetRetries={resetRetries}
					onPromptChange={handlePromptChange}
					onPromptAppend={handlePromptAppend}
					onCopyFromSite={handleCopyFromSite}
					onCopyToSite={handleCopyToSite}
					onGenerateVideo={handleGenerateVideo}
					onCancelSession={handleCancelSession}
					logs={logs || []}
					showDebug={showDebug}
					setShowDebug={setShowDebug}
					onSettingsClick={() => setSettingsOpen(true)}
					onClearLogs={clearLogs}
					showResults={showResults}
					setShowResults={setShowResults}
					lastSessionSummary={lastSessionSummary}
					promptHistoryRecords={promptHistoryRecords}
					muteControl={muteControl}
				/>
				<GlobalSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
			</TooltipProvider>
		</div>
	);
};

const PENDING_INLINE_PROMPT_KEY = "grokRetry_pendingInlinePrompt";
const MAX_PENDING_INLINE_AGE_MS = 30000;

const delay = (ms: number) =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});

const normalizePrompt = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();

const clearPendingInlinePrompt = () => {
	try {
		sessionStorage.removeItem(PENDING_INLINE_PROMPT_KEY);
	} catch {}
};

const enqueuePendingInlinePrompt = (value: string) => {
	try {
		console.warn("[Grok Retry] Queueing prompt for inline retry after navigation");
		sessionStorage.setItem(PENDING_INLINE_PROMPT_KEY, JSON.stringify({ prompt: value, createdAt: Date.now() }));
	} catch {}
};

const getPendingInlinePrompt = (): { prompt: string; createdAt?: number } | null => {
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

const findPromptSection = (targetPrompt: string) => {
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

const ensureInlineEditor = async (targetPrompt: string): Promise<boolean> => {
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
			} catch {
				trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			}
			for (let attempt = 0; attempt < 20; attempt += 1) {
				await delay(50);
				editor = lookupEditor();
				if (editor) {
					console.log("[Grok Retry] Inline editor opened after click");
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

const processPendingInlinePrompt = async (shouldCancel: () => boolean) => {
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

const ImagineRootApp: React.FC = () => {
	const { data: uiPrefs, save: saveUIPref } = useGrokRetryUI();
	const panelResize = useGrokRetryPanelResize();
	const miniDrag = useGrokRetryMiniToggleDrag();
	const { capturePromptFromSite, copyPromptToSite, setupClickListener } = useGrokRetryPromptCapture();
	const initialStoredPrompt = uiPrefs.imaginePromptValue ?? "";
	const [promptValue, setPromptValue] = React.useState(initialStoredPrompt);
	const [settingsOpen, setSettingsOpen] = React.useState(false);
	const lastStoredPromptRef = React.useRef(initialStoredPrompt);

	useEffect(() => {
		return setupClickListener((value) => {
			setPromptValue(value);
		});
	}, [setupClickListener]);

	useEffect(() => {
		const storedPrompt = uiPrefs.imaginePromptValue ?? "";
		if (storedPrompt !== lastStoredPromptRef.current) {
			lastStoredPromptRef.current = storedPrompt;
			setPromptValue(storedPrompt);
		}
	}, [uiPrefs.imaginePromptValue]);

	useEffect(() => {
		const handle = setTimeout(() => {
			saveUIPref("imaginePromptValue", promptValue);
			lastStoredPromptRef.current = promptValue;
		}, 300);
		return () => clearTimeout(handle);
	}, [promptValue, saveUIPref]);

	const handlePromptChange = React.useCallback((value: string) => {
		setPromptValue(value);
	}, []);

	const handleCopyFromSite = React.useCallback(() => {
		const value = capturePromptFromSite();
		if (value) {
			setPromptValue(value);
		}
	}, [capturePromptFromSite]);

	const handleCopyToSite = React.useCallback(() => {
		if (promptValue) {
			copyPromptToSite(promptValue);
		}
	}, [copyPromptToSite, promptValue]);

	const handlePromptAppend = React.useCallback((partial: string, position: "prepend" | "append") => {
		setPromptValue((currentPrompt) => {
			const partialContent = partial.trim().replace(/\.$/, "");
			if (currentPrompt.toLowerCase().includes(partialContent.toLowerCase())) {
				return currentPrompt;
			}
			return position === "prepend" ? partial + currentPrompt : currentPrompt + partial;
		});
	}, []);

	const submitViaBottomPrompt = React.useCallback(
		async (targetPrompt: string): Promise<boolean> => {
			const copied = copyPromptToSite(targetPrompt);
			if (!copied) {
				console.warn("[Grok Retry] Failed to copy prompt into bottom textarea");
				return false;
			}

			const submitButton = document.querySelector<HTMLButtonElement>('form button[type="submit"]');
			if (!submitButton) {
				console.warn("[Grok Retry] Bottom submit button missing");
				return false;
			}

			if (submitButton.disabled) {
				submitButton.removeAttribute("disabled");
			}
			submitButton.focus();
			await delay(50); // allow composer state to register the copied text
			const form = submitButton.form;
			if (form && typeof form.requestSubmit === "function") {
				form.requestSubmit(submitButton);
			} else {
				submitButton.click();
			}
			console.warn("[Grok Retry] Submitted prompt through bottom form fallback");
			return true;
		},
		[copyPromptToSite]
	);

	const handleGenerateImages = React.useCallback(() => {
		const trimmed = promptValue.trim();
		if (!trimmed) {
			return;
		}

		(async () => {
			if (await ensureInlineEditor(trimmed)) {
				clearPendingInlinePrompt();
				return;
			}

			const submitted = await submitViaBottomPrompt(trimmed);
			if (!submitted) {
				return;
			}

			enqueuePendingInlinePrompt(trimmed);
			for (let attempt = 0; attempt < 20; attempt += 1) {
				await delay(200);
				if (await ensureInlineEditor(trimmed)) {
					clearPendingInlinePrompt();
					return;
				}
			}
		})().catch((error) => {
			console.error("[Grok Retry] Failed to submit image prompt", error);
		});
	}, [promptValue, submitViaBottomPrompt]);

	const toggleMinimized = React.useCallback(() => {
		saveUIPref("isMinimized", !uiPrefs.isMinimized);
	}, [saveUIPref, uiPrefs.isMinimized]);

	const handleMinimizeClick = React.useCallback(() => {
		if (!miniDrag.dragMoved) {
			toggleMinimized();
		}
	}, [miniDrag.dragMoved, toggleMinimized]);

	const handleMaximizeToggle = React.useCallback(() => {
		saveUIPref("isMaximized", !uiPrefs.isMaximized);
	}, [saveUIPref, uiPrefs.isMaximized]);

	if (uiPrefs.isMinimized) {
		return (
			<div className="dark animate-in fade-in duration-200">
				<TooltipProvider>
					<MiniToggle
						position={miniDrag.position}
						isDragging={miniDrag.isDragging}
						dragMoved={miniDrag.dragMoved}
						onDragStart={miniDrag.handleDragStart}
						onRestore={handleMinimizeClick}
					/>
				</TooltipProvider>
			</div>
		);
	}

	return (
		<div className={`dark animate-in fade-in duration-300 ${!uiPrefs.isMaximized ? "slide-in-from-right-4" : ""}`}>
			<TooltipProvider>
				<ImaginePanel
					width={panelResize.width}
					height={panelResize.height}
					fontSize={panelResize.fontSize}
					isMaximized={uiPrefs.isMaximized}
					promptValue={promptValue}
					onPromptChange={handlePromptChange}
					onPromptAppend={handlePromptAppend}
					onCopyFromSite={handleCopyFromSite}
					onCopyToSite={handleCopyToSite}
					onResizeStart={panelResize.handleResizeStart}
					onMinimize={() => saveUIPref("isMinimized", true)}
					onMaximizeToggle={handleMaximizeToggle}
					onGenerateImages={handleGenerateImages}
					onSettingsClick={() => setSettingsOpen(true)}
				/>
				<GlobalSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
			</TooltipProvider>
		</div>
	);
};

const App: React.FC = () => {
	const isImaginePostRoute = useGrokRetryRouteMatch("^/imagine/post/");
	const isImagineRootRoute = useGrokRetryRouteMatch("^/imagine/?$");

	let content: React.ReactNode = null;

	if (isImaginePostRoute) {
		content = <ImaginePostApp />;
	} else if (isImagineRootRoute) {
		content = <ImagineRootApp />;
	}

	if (!content) {
		return null;
	}

	return (
		<>
			{content}
			<Toaster />
		</>
	);
};

export default App;
