import React, { useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGrokRetry } from "@/hooks/useGrokRetry";
import { useStorage } from "@/hooks/useStorage";
import { useModerationDetector } from "@/hooks/useModerationDetector";
import { useSuccessDetector } from "@/hooks/useSuccessDetector";
import { usePageTitle } from "@/hooks/usePageTitle";
import { usePromptCapture } from "@/hooks/usePromptCapture";
import { usePanelResize } from "@/hooks/usePanelResize";
import { useMiniToggleDrag } from "@/hooks/useMiniToggleDrag";
import { useRouteMatch } from "@/hooks/useRouteMatch";
import { usePostId } from "@/hooks/usePostId";
import { useGlobalSettings } from "@/hooks/useGlobalSettings";
import usePromptHistory from "@/hooks/usePromptHistory";
import { useMuteController } from "@/hooks/useMuteController";
import type { PromptHistoryLayer } from "@/lib/promptHistory";
import { ControlPanel } from "@/components/ControlPanel";
import { MiniToggle } from "@/components/MiniToggle";
import { ImaginePanel } from "@/components/ImaginePanel";
import { GlobalSettingsDialog } from "@/components/GlobalSettingsDialog";
import { Toaster } from "@/components/ui/toaster";

const ImaginePostApp: React.FC = () => {
	// Only show on /imagine/post/* routes
	const isImaginePostRoute = useRouteMatch("^/imagine/post/");
	const postId = usePostId();
	const { settings: globalSettings, isLoading: globalSettingsLoading } = useGlobalSettings();
	const muteControl = useMuteController(isImaginePostRoute);
	// Provide a global append log helper used by detectors
	useEffect(() => {
		(window as any).__grok_append_log = (line: string, level: "info" | "warn" | "error" | "success" = "info") => {
			const key = `grokRetrySession_${postId}`;
			try {
				const stored = sessionStorage.getItem(key);
				const existing = stored ? JSON.parse(stored) : {};
				const logs = Array.isArray(existing.logs) ? existing.logs : [];
				const next = [...logs, `${new Date().toLocaleTimeString()} — ${level.toUpperCase()} — ${line}`].slice(-200);
				sessionStorage.setItem(key, JSON.stringify({ ...existing, logs: next }));
				// Notify listeners for live updates with level
				window.dispatchEvent(new CustomEvent("grok:log", { detail: { postId, line, level } }));
			} catch {}
		};
		return () => {
			try {
				delete (window as any).__grok_append_log;
			} catch {}
		};
	}, [postId]);

	const retry = useGrokRetry(postId);
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
	} = retry;
	const { data: uiPrefs, save: saveUIPref } = useStorage();
	const { capturePromptFromSite, copyPromptToSite, setupClickListener } = usePromptCapture();
	const { records: promptHistoryRecords, recordOutcome: recordPromptHistoryOutcome } = usePromptHistory();
	const panelResize = usePanelResize();
	const miniDrag = useMiniToggleDrag();
	const [showDebug, setShowDebug] = React.useState(false);
	const [settingsOpen, setSettingsOpen] = React.useState(false);
	const nextVideoTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
	const hasCheckedInterruptedSession = React.useRef(false);
	const [showResults, setShowResults] = React.useState(false);
	const lastSummarySignatureRef = React.useRef<string | null>(null);
	const sessionPromptRef = React.useRef<string | null>(null);

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

	const handleRateLimitDetected = React.useCallback(() => {
		if (nextVideoTimeoutRef.current) {
			clearTimeout(nextVideoTimeoutRef.current);
			nextVideoTimeoutRef.current = null;
		}

		if (!isSessionActive) {
			return;
		}

		console.warn("[Grok Retry] Cancelling session due to rate limit");
		endSession("cancelled");
		sessionPromptRef.current = null;
	}, [isSessionActive, endSession]);

	const { rateLimitDetected } = useModerationDetector({
		onModerationDetected: handleModerationDetected,
		onRateLimitDetected: handleRateLimitDetected,
		enabled: autoRetryEnabled,
	});

	// Handle successful video generation
	const handleSuccess = React.useCallback(() => {
		console.log("[Grok Retry] Video generated successfully!");
		incrementVideosGenerated();
		recordPromptOutcome("success");

		const newCount = videosGenerated + 1;

		// Check if we've reached the video goal
		if (newCount >= videoGoal) {
			console.log(`[Grok Retry] Video goal reached! Generated ${newCount}/${videoGoal} videos`);
			endSession("success");
			sessionPromptRef.current = null;
		} else {
			// Continue generating - restart the cycle
			console.log(`[Grok Retry] Progress: ${newCount}/${videoGoal} videos generated, continuing...`);

			// Clear any existing timeout
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

	useSuccessDetector(handleSuccess, isSessionActive);

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
	usePageTitle(
		originalPageTitle,
		retryCount,
		maxRetries,
		autoRetryEnabled,
		rateLimitDetected,
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

const ImagineRootApp: React.FC = () => {
	const { data: uiPrefs, save: saveUIPref } = useStorage();
	const panelResize = usePanelResize();
	const miniDrag = useMiniToggleDrag();
	const { capturePromptFromSite, copyPromptToSite, setupClickListener } = usePromptCapture();
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

	const handleGenerateImages = React.useCallback(() => {
		const trimmed = promptValue.trim();
		if (!trimmed) {
			return;
		}

		const copied = copyPromptToSite(trimmed);
		if (!copied) {
			return;
		}

		const submitButton = document.querySelector<HTMLButtonElement>('form button[type="submit"]');
		if (submitButton) {
			if (submitButton.disabled) {
				submitButton.removeAttribute("disabled");
			}
			submitButton.focus();
			submitButton.click();
		}
	}, [copyPromptToSite, promptValue]);

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
	const isImaginePostRoute = useRouteMatch("^/imagine/post/");
	const isImagineRootRoute = useRouteMatch("^/imagine/?$");

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
