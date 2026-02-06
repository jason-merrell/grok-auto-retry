import React, { useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGrokRetry } from "@/hooks/useGrokRetry";
import { useGrokRetryUI } from "@/hooks/useGrokRetryUI";
import { useGrokRetryPageTitle } from "@/hooks/useGrokRetryPageTitle";
import { useGrokRetryPromptCapture } from "@/hooks/useGrokRetryPromptCapture";
import { useGrokRetryPanelResize } from "@/hooks/useGrokRetryPanelResize";
import { useGrokRetryMiniToggleDrag } from "@/hooks/useGrokRetryMiniToggleDrag";
import { useGrokRetryRouteMatch } from "@/hooks/useGrokRetryRouteMatch";
import { useGrokRetryPostId } from "@/hooks/useGrokRetryPostId";
import { useGrokRetrySettings } from "@/hooks/useGrokRetrySettings";
import useGrokRetryPromptHistory from "@/hooks/useGrokRetryPromptHistory";
import { useGrokRetryMuteController } from "@/hooks/useGrokRetryMuteController";
import { useGrokRetrySessionController } from "@/hooks/useGrokRetrySessionController";
import { useGrokRetryVideoSessions } from "@/hooks/useGrokRetryVideoSessions";
import { useGrokRetryResumeGuard } from "@/hooks/useGrokRetryResumeGuard";
import {
	clearPendingInlinePrompt,
	delay,
	enqueuePendingInlinePrompt,
	ensureInlineEditor,
	processPendingInlinePrompt,
} from "@/lib/inlinePrompt";
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
	const generationDelayMs = globalSettings?.videoGenerationDelay ?? 8000;
	const muteControl = useGrokRetryMuteController(isImaginePostRoute);
	const store = useGrokRetryVideoSessions(postId, mediaId);
	const retry = useGrokRetry({ postId, mediaId, store });
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
		startProgressObserver,
		startSession,
		endSession,
		setProgressTerminalHandler,
		logs = [],
		originalPageTitle,
		isLoading,
		clearLogs,
		lastSessionOutcome,
		lastSessionSummary,
		forceReload, // Force reload store when DOM triggers detected
		pendingRetryAt,
		pendingRetryPrompt,
		pendingRetryOverride,
		updateSession,
		addLogEntry,
	} = retry;

	// Wire up test bridge for endSession so grace period auto-cancel works
	useEffect(() => {
		const w = window as any;
		if (w.__grok_test) {
			w.__grok_test.endSession = (outcome?: string) => {
				console.log("[Grok Retry] Test bridge endSession called with outcome:", outcome);
				// Type guard to ensure outcome is a valid SessionOutcome
				const validOutcome =
					outcome === "success" || outcome === "failure" || outcome === "cancelled" ? outcome : "cancelled";
				endSession(validOutcome);
			};
		}
		return () => {
			if (w.__grok_test) {
				delete w.__grok_test.endSession;
			}
		};
	}, [endSession]);

	// Expose forceReload globally for grace period logic to trigger attempt processing
	useEffect(() => {
		const w = window as any;
		w.__grok_force_reload = forceReload;
		return () => {
			delete w.__grok_force_reload;
		};
	}, [forceReload]);

	const { data: uiPrefs, save: saveUIPref } = useGrokRetryUI();
	const { capturePromptFromSite, copyPromptToSite, setupClickListener } = useGrokRetryPromptCapture();
	const { records: promptHistoryRecords, recordOutcome: recordPromptHistoryOutcome } = useGrokRetryPromptHistory();
	const panelResize = useGrokRetryPanelResize();
	const miniDrag = useGrokRetryMiniToggleDrag();
	const [showDebug, setShowDebug] = React.useState(false);
	const [settingsOpen, setSettingsOpen] = React.useState(false);
	const hasCheckedInterruptedSession = React.useRef(false);
	const [showResults, setShowResults] = React.useState(false);
	const lastSummarySignatureRef = React.useRef<string | null>(null);

	const { nextVideoTimeoutRef, pendingModerationRetryRef, sessionPromptRef, scheduleRetryAttempt, rateLimitDetected } =
		useGrokRetrySessionController({
			isImaginePostRoute,
			postId,
			generationDelayMs,
			capturePromptFromSite,
			recordPromptHistoryOutcome,
			markFailureDetected,
			incrementVideosGenerated,
			updatePromptValue,
			clickMakeVideoButton,
			startProgressObserver,
			endSession,
			updateSession,
			setProgressTerminalHandler,
			forceReload,
			isSessionActive,
			autoRetryEnabled,
			retryCount,
			maxRetries,
			videoGoal,
			videosGenerated,
			lastPromptValue,
			lastAttemptTime,
			pendingRetryAt,
			addLogEntry,
		});

	useEffect(() => {
		let cancelled = false;
		processPendingInlinePrompt(() => cancelled);
		return () => {
			cancelled = true;
		};
	}, [postId, mediaId]);

	useGrokRetryResumeGuard({
		isLoading,
		isSessionActive,
		postId,
		pendingRetryAt,
		pendingModerationRetryRef,
		hasCheckedInterruptedSession,
		endSession,
	});

	useGrokRetryPageTitle(
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
			pendingModerationRetryRef.current = false;
			if (nextVideoTimeoutRef.current) {
				clearTimeout(nextVideoTimeoutRef.current);
				nextVideoTimeoutRef.current = null;
			}
		}
	}, [isSessionActive, nextVideoTimeoutRef, pendingModerationRetryRef, sessionPromptRef]);

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

	useEffect(() => {
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
	}, [globalSettings.autoSwitchToResultsOnComplete, lastSessionSummary, showDebug]);

	useEffect(() => {
		return setupClickListener((value) => {
			sessionPromptRef.current = value;
			updatePromptValue(value);
		});
	}, [setupClickListener, updatePromptValue, sessionPromptRef]);

	useEffect(() => {
		return () => {
			if (nextVideoTimeoutRef.current) {
				clearTimeout(nextVideoTimeoutRef.current);
			}
		};
	}, [nextVideoTimeoutRef]);

	React.useEffect(() => {
		if (!isSessionActive || !autoRetryEnabled || !pendingRetryAt) {
			return;
		}

		if (nextVideoTimeoutRef.current || pendingModerationRetryRef.current) {
			return;
		}

		const delayMs = Math.max(0, pendingRetryAt - Date.now());
		const persistedPrompt = pendingRetryPrompt ?? null;
		console.log("[Grok Retry] Resuming persisted retry", {
			delayMs,
			hasPersistedPrompt: !!persistedPrompt,
			sessionPromptCached: !!sessionPromptRef.current,
			retryCount,
			maxRetries,
		});
		scheduleRetryAttempt(
			persistedPrompt,
			delayMs,
			"persisted-resume",
			pendingRetryOverride ? { overrideGuard: true } : undefined
		);
	}, [
		autoRetryEnabled,
		isSessionActive,
		maxRetries,
		nextVideoTimeoutRef,
		pendingModerationRetryRef,
		pendingRetryAt,
		pendingRetryPrompt,
		pendingRetryOverride,
		retryCount,
		scheduleRetryAttempt,
		sessionPromptRef,
	]);

	const handlePromptChange = React.useCallback(
		(value: string) => {
			sessionPromptRef.current = value;
			updatePromptValue(value);
		},
		[sessionPromptRef, updatePromptValue]
	);

	const handleCopyFromSite = React.useCallback(() => {
		const value = capturePromptFromSite();
		if (value) {
			handlePromptChange(value);
		}
	}, [capturePromptFromSite, handlePromptChange]);

	const handleCopyToSite = React.useCallback(() => {
		if (lastPromptValue) {
			copyPromptToSite(lastPromptValue);
		}
	}, [copyPromptToSite, lastPromptValue]);

	const handlePromptAppend = React.useCallback(
		(partial: string, position: "prepend" | "append") => {
			const currentPrompt = lastPromptValue || "";
			const partialContent = partial.trim().replace(/\.$/, "");
			if (currentPrompt.toLowerCase().includes(partialContent.toLowerCase())) {
				return;
			}

			const newPrompt = position === "prepend" ? partial + currentPrompt : currentPrompt + partial;
			handlePromptChange(newPrompt);
		},
		[handlePromptChange, lastPromptValue]
	);

	const handleGenerateVideo = React.useCallback(() => {
		let promptToUse = lastPromptValue;
		if (!promptToUse) {
			const captured = capturePromptFromSite();
			if (captured) {
				promptToUse = captured;
				updatePromptValue(captured);
			}
		}

		sessionPromptRef.current = promptToUse ?? null;
		startSession(promptToUse);
		clickMakeVideoButton(promptToUse, { overridePermit: true });
	}, [capturePromptFromSite, clickMakeVideoButton, lastPromptValue, sessionPromptRef, startSession, updatePromptValue]);

	const handleCancelSession = React.useCallback(() => {
		// Clear any pending next video timeout
		if (nextVideoTimeoutRef.current) {
			clearTimeout(nextVideoTimeoutRef.current);
			nextVideoTimeoutRef.current = null;
			console.log("[Grok Retry] Cleared pending next video timeout");
		}
		pendingModerationRetryRef.current = false;
		endSession("cancelled");
		sessionPromptRef.current = null;
	}, [endSession, nextVideoTimeoutRef, pendingModerationRetryRef, sessionPromptRef]);

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
			await delay(50);
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
