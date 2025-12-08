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
import { ControlPanel } from "@/components/ControlPanel";
import { MiniToggle } from "@/components/MiniToggle";
import { ImaginePanel } from "@/components/ImaginePanel";
import { GlobalSettingsDialog } from "@/components/GlobalSettingsDialog";

const ImaginePostApp: React.FC = () => {
	// Only show on /imagine/post/* routes
	const isImaginePostRoute = useRouteMatch("^/imagine/post/");
	const postId = usePostId();
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
	} = retry;
	const { data: uiPrefs, save: saveUIPref } = useStorage();
	const { capturePromptFromSite, copyPromptToSite, setupClickListener } = usePromptCapture();
	const panelResize = usePanelResize();
	const miniDrag = useMiniToggleDrag();
	const [showDebug, setShowDebug] = React.useState(false);
	const [settingsOpen, setSettingsOpen] = React.useState(false);
	const nextVideoTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
	const hasCheckedInterruptedSession = React.useRef(false);

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

		// Check if we should retry
		const shouldRetry = autoRetryEnabled && retryCount < maxRetries;

		if (!shouldRetry) {
			console.log("[Grok Retry] Moderation detected but not retrying:", {
				autoRetryEnabled,
				retryCount,
				maxRetries,
			});

			// End session if we're not going to retry
			if (isSessionActive) {
				console.log("[Grok Retry] Ending session - no retry will occur");
				endSession();
			}
			return;
		}

		console.log("[Grok Retry] Moderation detected, current count:", retryCount);

		// If this is the first retry and we don't have a prompt, try to capture it
		let promptToUse = lastPromptValue;
		if (retryCount === 0 && !promptToUse) {
			const captured = capturePromptFromSite();
			if (captured) {
				promptToUse = captured;
				updatePromptValue(captured);
				console.log("[Grok Retry] Auto-captured prompt on first moderation");
			}
		}

		// Mark failure detected and allow scheduler to perform the next retry
		markFailureDetected();
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
	]);

	const { rateLimitDetected } = useModerationDetector(handleModerationDetected, autoRetryEnabled);

	// Handle successful video generation
	const handleSuccess = React.useCallback(() => {
		console.log("[Grok Retry] Video generated successfully!");
		incrementVideosGenerated();

		const newCount = videosGenerated + 1;

		// Check if we've reached the video goal
		if (newCount >= videoGoal) {
			console.log(`[Grok Retry] Video goal reached! Generated ${newCount}/${videoGoal} videos`);
			endSession();
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
				endSession();
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
				endSession();
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
		isSessionActive
	);

	// Auto-toggle debug panel based on session state
	useEffect(() => {
		setShowDebug(isSessionActive);
	}, [isSessionActive]);

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

	const handlePromptChange = (value: string) => {
		updatePromptValue(value);
	};

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

	const handleGenerateVideo = () => {
		// Capture prompt if not already captured
		let promptToUse = lastPromptValue;
		if (!promptToUse) {
			const captured = capturePromptFromSite();
			if (captured) {
				promptToUse = captured;
				updatePromptValue(captured);
			}
		}

		startSession();
		// Allow the initial manual click to proceed even before any failure notice
		clickMakeVideoButton(promptToUse, { overridePermit: true });
	};

	const handleCancelSession = () => {
		// Clear any pending next video timeout
		if (nextVideoTimeoutRef.current) {
			clearTimeout(nextVideoTimeoutRef.current);
			nextVideoTimeoutRef.current = null;
			console.log("[Grok Retry] Cleared pending next video timeout");
		}
		endSession();
	};

	const handleMinimizeClick = () => {
		if (!miniDrag.dragMoved) {
			saveUIPref("isMinimized", !uiPrefs.isMinimized);
		}
	};

	const handleMaximizeToggle = () => {
		saveUIPref("isMaximized", !uiPrefs.isMaximized);
	};

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

	const handleMinimizeClick = React.useCallback(() => {
		if (!miniDrag.dragMoved) {
			saveUIPref("isMinimized", !uiPrefs.isMinimized);
		}
	}, [miniDrag.dragMoved, saveUIPref, uiPrefs.isMinimized]);

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

	if (isImaginePostRoute) {
		return <ImaginePostApp />;
	}

	if (isImagineRootRoute) {
		return <ImagineRootApp />;
	}

	return null;
};

export default App;
