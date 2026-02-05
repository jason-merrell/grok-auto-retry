import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Copy, Trash2, Volume2, VolumeX } from "lucide-react";
import { Pie, PieChart, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import {
	MODERATION_LAYER_DETAILS,
	MODERATION_LAYER_KEYS,
	isModerationLayerKey,
	type ModerationLayerKey,
} from "@/lib/moderationLayers";
import type { SessionSummary } from "@/hooks/useGrokRetryVideoSessions";
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
import type { PromptHistoryRecord } from "@/hooks/useGrokRetryPromptHistory";

const ATTEMPT_CHART_CONFIG: ChartConfig = {
	success: { label: "Successes", color: "hsl(142 70% 45%)" },
	layer1: { label: "Layer 1 Blocks", color: "hsl(43 96% 56%)" },
	layer2: { label: "Layer 2 Blocks", color: "hsl(27 94% 58%)" },
	layer3: { label: "Layer 3 Blocks", color: "hsl(4 82% 62%)" },
};

const MODERATION_LAYER_COLOR_MAP: Record<ModerationLayerKey, string> = {
	"SECURITY LAYER 1: PROMPT FILTERING": ATTEMPT_CHART_CONFIG.layer1?.color ?? "hsl(43 96% 56%)",
	"SECURITY LAYER 2: MODEL-LEVEL ALIGNMENT": ATTEMPT_CHART_CONFIG.layer2?.color ?? "hsl(27 94% 58%)",
	"SECURITY LAYER 3: POST-GENERATION VALIDATION": ATTEMPT_CHART_CONFIG.layer3?.color ?? "hsl(4 82% 62%)",
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
	onClearLogs: () => void;
	showResults: boolean;
	setShowResults: (value: boolean) => void;
	lastSessionSummary: SessionSummary | null;
	promptHistoryRecords: PromptHistoryRecord[];
	muteControl?: {
		isMuted: boolean;
		isAvailable: boolean;
		toggleMute: () => void;
	};
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
	onClearLogs,
	showResults,
	setShowResults,
	lastSessionSummary,
	promptHistoryRecords,
	muteControl,
}) => {
	const logsContainerRef = React.useRef<HTMLDivElement>(null);
	const [isUserScrolledUp, setIsUserScrolledUp] = React.useState(false);
	const [activeLayerKey, setActiveLayerKey] = React.useState<ModerationLayerKey | null>(null);
	const activeLayer = activeLayerKey ? MODERATION_LAYER_DETAILS[activeLayerKey] : null;
	const hasResults = Boolean(
		lastSessionSummary && lastSessionSummary.outcome !== "idle" && lastSessionSummary.outcome !== "pending"
	);

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

	const handleToggleDebug = React.useCallback(() => {
		const next = !showDebug;
		setShowDebug(next);
		if (next) {
			setShowResults(false);
		}
	}, [showDebug, setShowDebug, setShowResults]);

	const handleToggleResults = React.useCallback(() => {
		if (!hasResults) return;
		const next = !showResults;
		setShowResults(next);
		if (next) {
			setShowDebug(false);
		}
	}, [hasResults, showResults, setShowResults, setShowDebug]);

	const formattedSummary = React.useMemo(() => {
		if (!lastSessionSummary) {
			return null;
		}

		const {
			outcome,
			completedVideos,
			videoGoal,
			retriesAttempted,
			maxRetries,
			creditsUsed,
			layer1Failures,
			layer2Failures,
			layer3Failures,
			endedAt,
		} = lastSessionSummary;
		const failuresTotal = layer1Failures + layer2Failures + layer3Failures;
		const endedLabel = endedAt ? new Date(endedAt).toLocaleString() : "N/A";
		const outcomeMeta = (() => {
			switch (outcome) {
				case "success":
					return {
						label: "Success",
						className: "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30",
					};
				case "failure":
					return {
						label: "Failed",
						className: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
					};
				case "cancelled":
					return {
						label: "Cancelled",
						className: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30",
					};
				case "pending":
					return {
						label: "Pending",
						className: "bg-muted text-muted-foreground border-border",
					};
				default:
					return {
						label: "Idle",
						className: "bg-muted text-muted-foreground border-border",
					};
			}
		})();

		return {
			outcomeMeta,
			retriesAttempted,
			maxRetries,
			completedVideos,
			videoGoal,
			creditsUsed,
			layer1Failures,
			layer2Failures,
			layer3Failures,
			failuresTotal,
			endedLabel,
		};
	}, [lastSessionSummary]);

	const shouldShowResults = Boolean(showResults && hasResults && formattedSummary);

	let mainContent: React.ReactNode;
	if (shouldShowResults && formattedSummary) {
		const attemptSegments = [
			{ key: "success" as const, value: formattedSummary.completedVideos },
			{ key: "layer1" as const, value: formattedSummary.layer1Failures },
			{ key: "layer2" as const, value: formattedSummary.layer2Failures },
			{ key: "layer3" as const, value: formattedSummary.layer3Failures },
		];
		const totalAttempts = attemptSegments.reduce((acc, segment) => acc + segment.value, 0);
		const pieData = attemptSegments
			.filter((segment) => segment.value > 0)
			.map((segment) => ({
				key: segment.key,
				value: segment.value,
				fill: ATTEMPT_CHART_CONFIG[segment.key]?.color ?? "hsl(var(--primary))",
				label: ATTEMPT_CHART_CONFIG[segment.key]?.label ?? segment.key,
			}));

		mainContent = (
			<div className="flex h-full flex-col overflow-hidden">
				<div className="flex items-center justify-between">
					<p className="text-sm font-semibold">Previous Session Results</p>
					{formattedSummary.outcomeMeta && (
						<Badge
							variant="outline"
							className={`h-5 px-2 text-[10px] ${formattedSummary.outcomeMeta.className}`}
						>
							{formattedSummary.outcomeMeta.label}
						</Badge>
					)}
				</div>
				<div className="mt-3 flex-1 overflow-y-auto pr-1 text-card-foreground">
					<div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
						<div className="rounded-lg border border-border bg-muted/40 p-3">
							<p className="text-xs uppercase tracking-wide text-muted-foreground">Videos</p>
							<p className="mt-1 text-base font-semibold">
								{formattedSummary.completedVideos}/{formattedSummary.videoGoal}
							</p>
						</div>
						<div className="rounded-lg border border-border bg-muted/40 p-3">
							<p className="text-xs uppercase tracking-wide text-muted-foreground">Retries Used</p>
							<p className="mt-1 text-base font-semibold">
								{formattedSummary.retriesAttempted}/{formattedSummary.maxRetries}
							</p>
						</div>
						<div className="rounded-lg border border-border bg-muted/40 p-3">
							<p className="text-xs uppercase tracking-wide text-muted-foreground">Credits Charged</p>
							<p className="mt-1 text-base font-semibold">{formattedSummary.creditsUsed}</p>
						</div>
						<div className="rounded-lg border border-border bg-muted/40 p-3">
							<p className="text-xs uppercase tracking-wide text-muted-foreground">Ended</p>
							<p className="mt-1 text-base font-semibold">{formattedSummary.endedLabel}</p>
						</div>
					</div>
					<div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
						<div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
							<span>Attempt Breakdown</span>
							<span className="font-semibold text-foreground/70">Total: {totalAttempts}</span>
						</div>
						<p className="mt-1 text-xs text-muted-foreground">
							Moderation failures: {formattedSummary.failuresTotal}
						</p>
						{totalAttempts > 0 ? (
							<>
								<ChartContainer
									config={ATTEMPT_CHART_CONFIG}
									className="mt-4 flex w-full flex-col items-center gap-4"
								>
									<div className="w-full max-w-[320px]">
										<ResponsiveContainer width="100%" aspect={1}>
											<PieChart>
												<ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
												<Pie
													data={pieData}
													dataKey="value"
													nameKey="key"
													innerRadius={50}
													strokeWidth={1}
												/>
											</PieChart>
										</ResponsiveContainer>
									</div>
									<div className="grid w-full grid-cols-2 gap-x-3 gap-y-2 text-xs sm:text-sm">
										{attemptSegments.map((segment) => {
											const configEntry = ATTEMPT_CHART_CONFIG[segment.key];
											return (
												<div key={segment.key} className="flex items-center gap-2">
													<svg className="h-2 w-2" viewBox="0 0 8 8">
														<circle
															cx="4"
															cy="4"
															r="4"
															fill={configEntry?.color ?? "currentColor"}
														/>
													</svg>
													<span className="text-muted-foreground">
														{configEntry?.label ?? segment.key}
													</span>
													<span className="ml-auto font-semibold text-foreground">
														{segment.value}
													</span>
												</div>
											);
										})}
									</div>
								</ChartContainer>
							</>
						) : (
							<p className="mt-3 text-sm text-muted-foreground">No attempts recorded for this session yet.</p>
						)}
					</div>
					<div className="mt-4 space-y-3">
						<div className="space-y-1">
							<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								How moderation layers work
							</p>
							<p className="text-xs text-muted-foreground">
								Each request must clear three automated checkpoints. Use the insights below to adjust prompts
								when blocks accumulate.
							</p>
						</div>
						<div className="space-y-2">
							{MODERATION_LAYER_KEYS.map((layerKey) => {
								const layer = MODERATION_LAYER_DETAILS[layerKey];
								const accent = MODERATION_LAYER_COLOR_MAP[layerKey];
								return (
									<div
										key={layerKey}
										className="rounded-md border border-border bg-background/80 p-3 shadow-sm"
									>
										<div className="flex items-center gap-2">
											<svg className="h-2.5 w-2.5" viewBox="0 0 8 8">
												<circle cx="4" cy="4" r="4" fill={accent} />
											</svg>
											<div className="flex flex-col">
												<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
													{layer.shortName}
												</span>
												<span className="text-sm font-medium text-foreground">{layer.title}</span>
											</div>
										</div>
										<p className="mt-2 text-xs text-muted-foreground">{layer.description}</p>
										<ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
											{layer.bullets.slice(0, 2).map((bullet, idx) => (
												<li key={idx}>{bullet}</li>
											))}
										</ul>
										<button
											type="button"
											className="mt-3 inline-flex items-center text-xs font-medium text-primary hover:text-primary/80"
											onClick={() => setActiveLayerKey(layerKey)}
										>
											View mitigation tips
										</button>
									</div>
								);
							})}
						</div>
					</div>
				</div>
			</div>
		);
	} else if (showDebug) {
		mainContent = (
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
										retryClassName += "bg-red-500/20 text-red-700 dark:text-red-400 hover:bg-red-500/30";
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
										videoClassName += "bg-secondary text-secondary-foreground hover:bg-secondary/80";
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
					<div className="flex items-center gap-1">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="h-8 w-8"
									onClick={() => {
										if (logs.length === 0) return;
										try {
											const text = logs.join("\n");
											if (!text) return;
											void navigator.clipboard.writeText(text);
										} catch (e) {
											console.error("[Grok Retry] Failed to copy logs", e);
										}
									}}
									disabled={logs.length === 0}
									aria-label="Copy logs"
								>
									<Copy className="h-4 w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Copy logs</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="h-8 w-8"
									onClick={() => {
										if (logs.length === 0) return;
										onClearLogs();
										setIsUserScrolledUp(false);
									}}
									disabled={logs.length === 0}
									aria-label="Clear logs"
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Clear logs</TooltipContent>
						</Tooltip>
					</div>
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
									line.match(/—\s*(Security Layer [^—]+)$/i) ?? line.match(/—\s*(Layer [^—]+)$/i);
								const layerKey: ModerationLayerKey | null = rawLayerMatch
									? (() => {
											const normalized = rawLayerMatch[1].trim().toUpperCase();
											const candidate = normalized.startsWith("SECURITY ")
												? normalized
												: `SECURITY ${normalized}`;
											return isModerationLayerKey(candidate) ? candidate : null;
										})()
									: null;
								const layerDetails = layerKey ? MODERATION_LAYER_DETAILS[layerKey] : undefined;

								return (
									<li key={i} className={`${cls} flex flex-col gap-0.5`}>
										<span>{line}</span>
										{layerDetails && layerKey && (
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
		);
	} else {
		mainContent = (
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
					disabled={isSessionActive}
					isMaximized={isMaximized}
					promptHistoryRecords={promptHistoryRecords}
				/>

				<PromptPartials onAppendPartial={onPromptAppend} disabled={!autoRetryEnabled} />
			</div>
		);
	}

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
						onToggleDebug={handleToggleDebug}
						isDebug={showDebug}
						onSettingsClick={onSettingsClick}
						logCount={logs.length}
						onToggleResults={hasResults ? handleToggleResults : undefined}
						isResultsVisible={showResults}
						hasResults={hasResults}
					/>
				</CardHeader>

				<CardContent
					className="flex flex-1 flex-col space-y-3 overflow-hidden"
					style={isMaximized ? {} : { maxHeight: `${height - 140}px` }}
				>
					{mainContent}
				</CardContent>

				<div className="px-6 pb-4 shrink-0 border-t border-border pt-3">
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
						<div className="flex-1">
							<ActionButton
								isSessionActive={isSessionActive}
								onGenerate={onGenerateVideo}
								onCancel={onCancelSession}
							/>
						</div>
						{muteControl?.isAvailable ? (
							<Button
								type="button"
								variant="ghost"
								size="icon"
								onClick={muteControl.toggleMute}
								className="h-9 w-9 rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
								aria-label={muteControl.isMuted ? "Unmute video" : "Mute video"}
							>
								{muteControl.isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
								<span className="sr-only">{muteControl.isMuted ? "Unmute" : "Mute"}</span>
							</Button>
						) : null}
					</div>
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
