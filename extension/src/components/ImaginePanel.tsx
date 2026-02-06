import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PanelHeader } from "@/components/PanelHeader";
import { PromptTextarea } from "@/components/PromptTextarea";
import { PromptPartials } from "@/components/PromptPartials";
import { ResizeHandle } from "@/components/ResizeHandle";
import { Button } from "@/components/ui/button";

interface ImaginePanelProps {
	width: number;
	height: number;
	fontSize: number;
	isMaximized: boolean;
	promptValue: string;
	onPromptChange: (value: string) => void;
	onPromptAppend: (value: string, position: "prepend" | "append") => void;
	onCopyFromSite: () => void;
	onCopyToSite: () => void;
	onResizeStart: (event: React.MouseEvent) => void;
	onMinimize: () => void;
	onMaximizeToggle: () => void;
	onGenerateImages: () => void;
	onSettingsClick?: () => void;
}

export const ImaginePanel: React.FC<ImaginePanelProps> = ({
	width,
	height,
	fontSize,
	isMaximized,
	promptValue,
	onPromptChange,
	onPromptAppend,
	onCopyFromSite,
	onCopyToSite,
	onResizeStart,
	onMinimize,
	onMaximizeToggle,
	onGenerateImages,
	onSettingsClick,
}) => {
	return (
		<Card
			data-testid="grok-retry-panel"
			className="fixed shadow-xl flex flex-col bg-background"
			style={{
				...(isMaximized
					? {
							op: 0,
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
					isSessionActive={false}
					onMinimize={onMinimize}
					onMaximizeToggle={onMaximizeToggle}
					onSettingsClick={onSettingsClick}
				/>
			</CardHeader>

			<CardContent
				className="space-y-4 overflow-auto flex-1"
				style={isMaximized ? {} : { maxHeight: `${height - 140}px` }}
			>
				<PromptTextarea
					value={promptValue}
					onChange={onPromptChange}
					onCopyFromSite={onCopyFromSite}
					onCopyToSite={onCopyToSite}
					isMaximized={isMaximized}
				/>

				<PromptPartials onAppendPartial={onPromptAppend} />

				<div className="pt-2">
					<Button
						data-testid="generate-images-button"
						onClick={onGenerateImages}
						className="w-full"
						disabled={!promptValue.trim()}
					>
						Generate Images
					</Button>
				</div>
			</CardContent>
		</Card>
	);
};
