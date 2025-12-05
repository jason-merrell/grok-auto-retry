import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ResizeHandle } from "./ResizeHandle";
import { PanelHeader } from "./PanelHeader";
import { RetryControls } from "./RetryControls";
import { RetryStats } from "./RetryStats";
import { MaxRetriesControls } from "./MaxRetriesControls";
import { VideoGoalControls } from "./VideoGoalControls";
import { PromptTextarea } from "./PromptTextarea";
import { PromptPartials } from "./PromptPartials";
import { ActionButton } from "./ActionButton";

interface ControlPanelProps {
	width: number;
	height: number;
	fontSize: number;
	isMaximized: boolean;
	autoRetryEnabled: boolean;
	retryCount: number;
	maxRetries: number;
	videoGoal: number;
	videosGenerated: number;
	promptValue: string;
	isSessionActive: boolean;
	rapidFailureDetected: boolean;
	onResizeStart: (e: React.MouseEvent) => void;
	onMinimize: () => void;
	onMaximizeToggle: () => void;
	onAutoRetryChange: (enabled: boolean) => void;
	onMaxRetriesChange: (value: number) => void;
	onVideoGoalChange: (value: number) => void;
	onResetRetries: () => void;
	onPromptChange: (value: string) => void;
	onPromptAppend: (value: string, position: "prepend" | "append") => void;
	onCopyFromSite: () => void;
	onCopyToSite: () => void;
	onGenerateVideo: () => void;
	onCancelSession: () => void;
	logs?: string[];
	showDebug: boolean;
	setShowDebug: (value: boolean) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
	width,
	height,
	fontSize,
	isMaximized,
	autoRetryEnabled,
	retryCount,
	maxRetries,
	videoGoal,
	videosGenerated,
	promptValue,
	isSessionActive,
	rapidFailureDetected,
	onResizeStart,
	onMinimize,
	onMaximizeToggle,
	onAutoRetryChange,
	onMaxRetriesChange,
	onVideoGoalChange,
	onResetRetries,
	onPromptChange,
	onPromptAppend,
	onCopyFromSite,
	onCopyToSite,
	onGenerateVideo,
	onCancelSession,
	logs = [],
	showDebug,
	setShowDebug,
}) => {
	const logsContainerRef = React.useRef<HTMLDivElement>(null);
	const [isUserScrolledUp, setIsUserScrolledUp] = React.useState(false);

	// Auto-scroll to bottom when new logs arrive, unless user has scrolled up
	React.useEffect(() => {
		if (showDebug && logs.length > 0 && !isUserScrolledUp && logsContainerRef.current) {
			logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
		}
	}, [logs, showDebug, isUserScrolledUp]);

	// Handle scroll events to detect if user scrolled away from bottom
	const handleScroll = React.useCallback(() => {
		if (logsContainerRef.current) {
			const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current;
			const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10; // 10px threshold
			setIsUserScrolledUp(!isAtBottom);
		}
	}, []);

	return (
		<Card
			className="fixed shadow-xl flex flex-col bg-background"
			style={{
				...(isMaximized
					? {
							top: 0,
							left: 0,
							right: 0,
							bottom: 0,
							width: "100vw",
							height: "100vh",
							borderRadius: 0,
					  }
					: {
							bottom: "16px",
							right: "16px",
							width: `${width}px`,
							height: `${height}px`,
					  }),
				fontSize: `${fontSize}px`,
			}}
		>
			{!isMaximized && <ResizeHandle onResizeStart={onResizeStart} />}

			<CardHeader className="pb-3 shrink-0">
				<PanelHeader
					isMaximized={isMaximized}
					isSessionActive={isSessionActive}
					onMinimize={onMinimize}
					onMaximizeToggle={onMaximizeToggle}
					onToggleDebug={() => setShowDebug(!showDebug)}
					isDebug={showDebug}
					retryCount={retryCount}
					videosGenerated={videosGenerated}
				/>
			</CardHeader>

			<CardContent
				ref={logsContainerRef}
				className="space-y-3 overflow-auto flex-1"
				style={isMaximized ? {} : { maxHeight: `${height - 140}px` }}
				onScroll={handleScroll}
			>
				{showDebug ? (
					<div className="font-mono text-xs whitespace-pre-wrap break-words">
						<div className="flex items-center justify-between mb-2">
							<div className="flex items-center gap-2">
								<p className="text-sm font-semibold">Session Logs</p>
								{isMaximized && isSessionActive && (
									<>
										{(() => {
											// Retry badge color logic (same as RetryStats)
											const retryPercentage = maxRetries > 0 ? (retryCount / maxRetries) * 100 : 0;
											let retryClassName = "h-5 px-1.5 text-[10px] ";
											if (retryPercentage === 0) {
												retryClassName +=
													"bg-green-500/20 text-green-700 dark:text-green-400 hover:bg-green-500/30";
											} else if (retryPercentage >= 80) {
												retryClassName +=
													"bg-red-500/20 text-red-700 dark:text-red-400 hover:bg-red-500/30";
											} else if (retryPercentage >= 50) {
												retryClassName +=
													"bg-orange-500/20 text-orange-700 dark:text-orange-400 hover:bg-orange-500/30";
											} else {
												retryClassName +=
													"bg-green-500/20 text-green-700 dark:text-green-400 hover:bg-green-500/30";
											}
											return (
												<Badge className={retryClassName}>
													{retryCount}/{maxRetries} retries
												</Badge>
											);
										})()}
										{(() => {
											// Video badge color logic (same as RetryStats)
											let videoClassName = "h-5 px-1.5 text-[10px] ";
											if (videosGenerated === 0) {
												videoClassName +=
													"bg-secondary text-secondary-foreground hover:bg-secondary/80";
											} else if (videosGenerated >= videoGoal) {
												videoClassName +=
													"bg-green-500/20 text-green-700 dark:text-green-400 hover:bg-green-500/30";
											} else {
												videoClassName +=
													"bg-orange-500/20 text-orange-700 dark:text-orange-400 hover:bg-orange-500/30";
											}
											return (
												<Badge className={videoClassName}>
													{videosGenerated}/{videoGoal} videos
												</Badge>
											);
										})()}
									</>
								)}
							</div>
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									try {
										const text = (logs || []).join("\n");
										if (!text) return;
										navigator.clipboard.writeText(text);
									} catch (e) {
										console.error("[Grok Retry] Failed to copy logs", e);
									}
								}}
							>
								Copy Logs
							</Button>
						</div>
						{logs && logs.length ? (
							<ul className="space-y-1">
								{logs.map((line, i) => {
									const isWarn = line.includes(" — WARN — ");
									const isError = line.includes(" — ERROR — ");
									const isSuccess = line.includes(" — SUCCESS — ");
									const cls = isError
										? "text-red-500"
										: isWarn
										? "text-yellow-500"
										: isSuccess
										? "text-green-500"
										: "text-muted-foreground";
									return (
										<li key={i} className={cls}>
											{line}
										</li>
									);
								})}
							</ul>
						) : (
							<p className="text-muted-foreground">No logs yet for this session.</p>
						)}
					</div>
				) : (
					<>
						<RetryControls autoRetryEnabled={autoRetryEnabled} onAutoRetryChange={onAutoRetryChange} />

						<RetryStats
							retryCount={retryCount}
							maxRetries={maxRetries}
							videosGenerated={videosGenerated}
							videoGoal={videoGoal}
							rapidFailureDetected={rapidFailureDetected}
						/>

						<MaxRetriesControls
							maxRetries={maxRetries}
							retryCount={retryCount}
							onMaxRetriesChange={onMaxRetriesChange}
							onResetRetries={onResetRetries}
							disabled={!autoRetryEnabled}
						/>

						<VideoGoalControls
							videoGoal={videoGoal}
							videosGenerated={videosGenerated}
							isSessionActive={isSessionActive}
							onVideoGoalChange={onVideoGoalChange}
							disabled={!autoRetryEnabled}
						/>

						<PromptTextarea
							value={promptValue}
							onChange={onPromptChange}
							onCopyFromSite={onCopyFromSite}
							onCopyToSite={onCopyToSite}
							disabled={!autoRetryEnabled}
						/>

						<PromptPartials onAppendPartial={onPromptAppend} disabled={!autoRetryEnabled} />
					</>
				)}
			</CardContent>

			<div className="px-6 pb-4 shrink-0 border-t border-border pt-3">
				<ActionButton isSessionActive={isSessionActive} onGenerate={onGenerateVideo} onCancel={onCancelSession} />
			</div>
		</Card>
	);
};
