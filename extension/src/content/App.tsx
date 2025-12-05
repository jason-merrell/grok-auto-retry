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

const App: React.FC = () => {
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
	const { data: uiPrefs, save: saveUIPref } = useStorage();
	const { capturePromptFromSite, copyPromptToSite, setupClickListener } = usePromptCapture();
	const panelResize = usePanelResize();
	const miniDrag = useMiniToggleDrag();
	const [rapidFailureDetected, setRapidFailureDetected] = React.useState(false);
	const [showDebug, setShowDebug] = React.useState(false);
	const nextVideoTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
	const hasCheckedInterruptedSession = React.useRef(false);

	// Handle moderation detection
	const handleModerationDetected = React.useCallback(() => {
		// Don't retry if session is not active
		if (!retry.isSessionActive) {
			console.log("[Grok Retry] Ignoring moderation - session not active");
			return;
		}

		// Check for rapid failure (≤6 seconds) - indicates immediate automated content check
		if (retry.lastAttemptTime > 0) {
			const timeSinceAttempt = Date.now() - retry.lastAttemptTime;
			if (timeSinceAttempt <= 6000) {
				console.warn("[Grok Retry] Rapid failure detected (<6s) - likely automated content check on prompt/image");
				setRapidFailureDetected(true);
			}
		}

		// Check if we should retry
		const shouldRetry = retry.autoRetryEnabled && retry.retryCount < retry.maxRetries;

		if (!shouldRetry) {
			console.log("[Grok Retry] Moderation detected but not retrying:", {
				autoRetryEnabled: retry.autoRetryEnabled,
				retryCount: retry.retryCount,
				maxRetries: retry.maxRetries,
			});

			// End session if we're not going to retry
			if (retry.isSessionActive) {
				console.log("[Grok Retry] Ending session - no retry will occur");
				retry.endSession();
			}
			return;
		}

		console.log("[Grok Retry] Moderation detected, current count:", retry.retryCount);

		// If this is the first retry and we don't have a prompt, try to capture it
		let promptToUse = retry.lastPromptValue;
		if (retry.retryCount === 0 && !promptToUse) {
			const captured = capturePromptFromSite();
			if (captured) {
				promptToUse = captured;
				retry.updatePromptValue(captured);
				console.log("[Grok Retry] Auto-captured prompt on first moderation");
			}
		}

		// Mark failure detected and allow scheduler to perform the next retry
		retry.markFailureDetected();
	}, [retry, capturePromptFromSite]);

	const { rateLimitDetected } = useModerationDetector(handleModerationDetected, retry.autoRetryEnabled);

	// Handle successful video generation
	const handleSuccess = React.useCallback(() => {
		console.log("[Grok Retry] Video generated successfully!");
		retry.incrementVideosGenerated();

		const newCount = retry.videosGenerated + 1;

		// Check if we've reached the video goal
		if (newCount >= retry.videoGoal) {
			console.log(`[Grok Retry] Video goal reached! Generated ${newCount}/${retry.videoGoal} videos`);
			retry.endSession();
		} else {
			// Continue generating - restart the cycle
			console.log(`[Grok Retry] Progress: ${newCount}/${retry.videoGoal} videos generated, continuing...`);

			// Clear any existing timeout
			if (nextVideoTimeoutRef.current) {
				clearTimeout(nextVideoTimeoutRef.current);
			}

			// Wait 8 seconds before next generation
			nextVideoTimeoutRef.current = setTimeout(() => {
				// Check if session is still active before proceeding
				if (!retry.isSessionActive) {
					console.log("[Grok Retry] Skipping next video - session cancelled");
					return;
				}
				retry.resetRetries(); // Reset retry count for next video
				// Use overridePermit since this is a new video generation, not a retry
				retry.clickMakeVideoButton(retry.lastPromptValue, { overridePermit: true });
				nextVideoTimeoutRef.current = null;
			}, 8000);
		}
	}, [retry]);

	useSuccessDetector(handleSuccess, retry.isSessionActive);

	// Auto-cancel interrupted sessions on mount (after refresh/navigation) - only once
	useEffect(() => {
		console.log(
			"[Grok Retry] Auto-cancel effect - isLoading:",
			retry.isLoading,
			"hasChecked:",
			hasCheckedInterruptedSession.current,
			"isSessionActive:",
			retry.isSessionActive,
			"postId:",
			postId
		);

		// Wait for both loading to complete AND postId to be available
		if (!retry.isLoading && postId && !hasCheckedInterruptedSession.current) {
			console.log("[Grok Retry] Checking for interrupted session - isSessionActive:", retry.isSessionActive);
			if (retry.isSessionActive) {
				console.log("[Grok Retry] Detected active session after page load - auto-canceling interrupted session");
				hasCheckedInterruptedSession.current = true;
				retry.endSession();
			} else {
				// Only mark as checked if we've waited long enough for session data to load
				// Use a small delay to ensure session state has fully settled
				setTimeout(() => {
					if (!retry.isSessionActive) {
						console.log("[Grok Retry] No active session found after delay, marking as checked");
						hasCheckedInterruptedSession.current = true;
					}
				}, 50);
			}
		}
	}, [retry.isLoading, retry.isSessionActive, retry.endSession, postId]);

	// Fallback check - run once after a short delay to catch any race conditions
	useEffect(() => {
		const timeoutId = setTimeout(() => {
			console.log(
				"[Grok Retry] Fallback timeout - hasChecked:",
				hasCheckedInterruptedSession.current,
				"isSessionActive:",
				retry.isSessionActive,
				"postId:",
				postId
			);
			if (!hasCheckedInterruptedSession.current && retry.isSessionActive && postId) {
				console.log("[Grok Retry] Fallback: Detected active session after delay - auto-canceling");
				hasCheckedInterruptedSession.current = true;
				retry.endSession();
			}
		}, 200);

		return () => clearTimeout(timeoutId);
	}, []);

	// Set up page title updates
	usePageTitle(
		retry.originalPageTitle,
		retry.retryCount,
		retry.maxRetries,
		retry.autoRetryEnabled,
		rateLimitDetected,
		retry.videoGoal,
		retry.videosGenerated,
		retry.isSessionActive
	);

	// Auto-toggle debug panel based on session state
	useEffect(() => {
		setShowDebug(retry.isSessionActive);
	}, [retry.isSessionActive]);

	// Set up click listener for prompt capture
	useEffect(() => {
		return setupClickListener((value) => {
			retry.updatePromptValue(value);
		});
	}, [setupClickListener, retry]);

	// Clean up timeout on unmount
	useEffect(() => {
		return () => {
			if (nextVideoTimeoutRef.current) {
				clearTimeout(nextVideoTimeoutRef.current);
			}
		};
	}, []);

	const handlePromptChange = (value: string) => {
		retry.updatePromptValue(value);
		// Clear rapid failure warning when user changes the prompt
		if (rapidFailureDetected) {
			setRapidFailureDetected(false);
		}
	};

	const handleCopyFromSite = () => {
		const value = capturePromptFromSite();
		if (value) {
			handlePromptChange(value);
		}
	};

	const handleCopyToSite = () => {
		if (retry.lastPromptValue) {
			copyPromptToSite(retry.lastPromptValue);
		}
	};

	const handlePromptAppend = (partial: string, position: "prepend" | "append") => {
		const currentPrompt = retry.lastPromptValue || "";

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
		let promptToUse = retry.lastPromptValue;
		if (!promptToUse) {
			const captured = capturePromptFromSite();
			if (captured) {
				promptToUse = captured;
				retry.updatePromptValue(captured);
			}
		}

		setRapidFailureDetected(false);
		retry.startSession();
		// Allow the initial manual click to proceed even before any failure notice
		retry.clickMakeVideoButton(promptToUse, { overridePermit: true });
	};

	const handleCancelSession = () => {
		// Clear any pending next video timeout
		if (nextVideoTimeoutRef.current) {
			clearTimeout(nextVideoTimeoutRef.current);
			nextVideoTimeoutRef.current = null;
			console.log("[Grok Retry] Cleared pending next video timeout");
		}
		retry.endSession();
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
					autoRetryEnabled={retry.autoRetryEnabled}
					retryCount={retry.retryCount}
					maxRetries={retry.maxRetries}
					videoGoal={retry.videoGoal}
					videosGenerated={retry.videosGenerated}
					promptValue={retry.lastPromptValue}
					isSessionActive={retry.isSessionActive}
					rapidFailureDetected={rapidFailureDetected}
					onResizeStart={panelResize.handleResizeStart}
					onMinimize={() => saveUIPref("isMinimized", true)}
					onMaximizeToggle={handleMaximizeToggle}
					onAutoRetryChange={retry.setAutoRetryEnabled}
					onMaxRetriesChange={retry.setMaxRetries}
					onVideoGoalChange={retry.setVideoGoal}
					onResetRetries={retry.resetRetries}
					onPromptChange={handlePromptChange}
					onPromptAppend={handlePromptAppend}
					onCopyFromSite={handleCopyFromSite}
					onCopyToSite={handleCopyToSite}
					onGenerateVideo={handleGenerateVideo}
					onCancelSession={handleCancelSession}
					logs={retry?.logs || []}
					showDebug={showDebug}
					setShowDebug={setShowDebug}
				/>
			</TooltipProvider>
		</div>
	);
};

export default App;
