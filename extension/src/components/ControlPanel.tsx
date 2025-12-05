import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
}) => {
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
				/>
			</CardHeader>

			<CardContent className="space-y-3 overflow-auto flex-1" style={{ maxHeight: `${height - 140}px` }}>
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
			</CardContent>

			<div className="px-6 pb-4 shrink-0 border-t border-border pt-3">
				<ActionButton isSessionActive={isSessionActive} onGenerate={onGenerateVideo} onCancel={onCancelSession} />
			</div>
		</Card>
	);
};
