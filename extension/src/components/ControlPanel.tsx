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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ModerationLayerDetails {
	title: string;
	shortName: string;
	description: string;
	bullets: string[];
	actions: string[];
}

const MODERATION_LAYER_DETAILS: Record<string, ModerationLayerDetails> = {
	"SECURITY LAYER 1: PROMPT FILTERING": {
		title: "Security Layer 1: Prompt Filtering",
		shortName: "Prompt Filtering",
		description:
			"Semantic intent checks and normalization trip these failures before the model starts generating anything.",
		bullets: [
			"Semantic intent detection (not keyword-only)",
			"Unicode normalization catches character smuggling (Test 52)",
			"Adaptive moderation rules evolve continuously",
			"Grok 3 reasoning assist backs the filter",
			"No credit charged for blocked attempts",
			"Keyword failures will fail fast",
		],
		actions: [
			"Remove disallowed themes or graphic requests from the prompt",
			"Avoid obfuscated characters or mixed unicode styles",
			"Rephrase goals in neutral, policy-compliant language",
		],
	},
	"SECURITY LAYER 2: MODEL-LEVEL ALIGNMENT": {
		title: "Security Layer 2: Model-Level Alignment",
		shortName: "Model-Level Alignment",
		description:
			"The Aurora base model, tuned with RLHF, halts unsafe generations mid-stream when it detects a policy conflict.",
		bullets: [
			"Failures do not result in spent credits",
			"Aurora model reinforced via RLHF",
			"Bias against producing overly explicit or harmful output",
			"Can't be bypassed via prompt engineering tricks",
			"Result is temporarily cached for subsequent retries",
		],
		actions: [
			"Reduce the prompt to a safe core idea to produce a successful pass. Avoid explicit or suggestive content in clothing, poses, or scenarios.",
			"Follow a successful pass with incremental additions to the prompt to reach the desired result before the cache expires.",
		],
	},
	"SECURITY LAYER 3: POST-GENERATION VALIDATION": {
		title: "Security Layer 3: Post-Generation Validation",
		shortName: "Post-Generation Validation",
		description:
			"Completed videos are scanned after render; credits are consumed even if moderation rolls the result back.",
		bullets: [
			"Validation runs after a full render finishes",
			"Several frames are collected at various timestamps for analysis",
			"Vision model checks clothing changes and explicit visuals",
			"Anime style content is less restricted but still monitored",
			"Credits are spent despite the block",
		],
		actions: [
			"Introduce actions or scenarios that would hide explicit content at key frames (e.g., 'flashing light', 'camera pans away', 'body obscurement').",
			"Use anime elements in the submitted image to reduce strictness of the vision model checks (e.g., 'anime-style border or stickers' around the subject).",
		],
	},
};

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
	onSettingsClick?: () => void;
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
	onSettingsClick,
}) => {
	const logsContainerRef = React.useRef<HTMLDivElement>(null);
	const [isUserScrolledUp, setIsUserScrolledUp] = React.useState(false);
	const [activeLayerKey, setActiveLayerKey] = React.useState<string | null>(null);
	const activeLayer = activeLayerKey ? MODERATION_LAYER_DETAILS[activeLayerKey] : null;

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
		<>
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
					fontSize: `${isMaximized ? Math.max(fontSize * 1.2, 14) : fontSize}px`,
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
						onSettingsClick={onSettingsClick}
					/>
				</CardHeader>

				<CardContent
					className="flex flex-1 flex-col space-y-3 overflow-hidden"
					style={isMaximized ? {} : { maxHeight: `${height - 140}px` }}
				>
					{showDebug ? (
						<div className="flex h-full flex-col gap-2">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<p className="text-sm font-semibold">Session Logs</p>
									{isMaximized && isSessionActive && (
										<>
											{(() => {
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
									variant="ghost"
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
							<div
								ref={logsContainerRef}
								onScroll={handleScroll}
								className="font-mono text-xs whitespace-pre-wrap break-words flex-1 overflow-auto rounded-md border border-border bg-muted/40 p-2"
							>
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

											const rawLayerMatch =
												line.match(/assumed (Security Layer [^.]+?)(?:\.|$)/i) ??
												line.match(/assumed (Layer [^.]+?)(?:\.|$)/i);
											const layerKey = rawLayerMatch
												? (() => {
														const normalized = rawLayerMatch[1].trim().toUpperCase();
														return normalized.startsWith("SECURITY ")
															? normalized
															: `SECURITY ${normalized}`;
												  })()
												: null;
											const layerDetails = layerKey ? MODERATION_LAYER_DETAILS[layerKey] : undefined;

											return (
												<li key={i} className={`${cls} flex flex-col gap-0.5`}>
													<span>{line}</span>
													{layerDetails && (
														<button
															type="button"
															className="text-xs text-muted-foreground underline underline-offset-2 hover:text-primary/80 w-full text-left"
															onClick={() => setActiveLayerKey(layerKey)}
														>
															[Learn more about {layerDetails.shortName}]
														</button>
													)}
												</li>
											);
										})}
									</ul>
								) : (
									<p className="text-muted-foreground">No logs yet for this session.</p>
								)}
							</div>
						</div>
					) : (
						<div className="flex-1 space-y-3 overflow-auto pr-1">
							<RetryControls autoRetryEnabled={autoRetryEnabled} onAutoRetryChange={onAutoRetryChange} />

							<RetryStats
								retryCount={retryCount}
								maxRetries={maxRetries}
								videosGenerated={videosGenerated}
								videoGoal={videoGoal}
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
								isMaximized={isMaximized}
							/>

							<PromptPartials onAppendPartial={onPromptAppend} disabled={!autoRetryEnabled} />
						</div>
					)}
				</CardContent>

				<div className="px-6 pb-4 shrink-0 border-t border-border pt-3">
					<ActionButton
						isSessionActive={isSessionActive}
						onGenerate={onGenerateVideo}
						onCancel={onCancelSession}
					/>
				</div>
			</Card>
			<Dialog open={!!activeLayer} onOpenChange={(open) => !open && setActiveLayerKey(null)}>
				<DialogContent className="max-w-md">
					{activeLayer ? (
						<>
							<DialogHeader>
								<DialogTitle>{activeLayer.title}</DialogTitle>
							</DialogHeader>
							<DialogDescription className="text-sm text-muted-foreground">
								{activeLayer.description}
							</DialogDescription>
							{activeLayer.bullets.length > 0 && (
								<ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
									{activeLayer.bullets.map((item, idx) => (
										<li key={idx}>{item}</li>
									))}
								</ul>
							)}
							{activeLayer.actions.length > 0 && (
								<div className="mt-4">
									<p className="text-sm font-semibold text-card-foreground">
										What do I do if this keeps happening?
									</p>
									<ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
										{activeLayer.actions.map((item, idx) => (
											<li key={idx}>{item}</li>
										))}
									</ul>
								</div>
							)}
						</>
					) : null}
				</DialogContent>
			</Dialog>
		</>
	);
};
