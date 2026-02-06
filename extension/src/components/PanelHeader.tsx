import React from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Minimize2, Minimize, Fullscreen, Bug, Settings, PieChart } from "lucide-react";

interface PanelHeaderProps {
	isMaximized: boolean;
	isSessionActive: boolean;
	onMinimize: () => void;
	onMaximizeToggle: () => void;
	onToggleDebug?: () => void;
	isDebug?: boolean;
	onSettingsClick?: () => void;
	logCount?: number;
	onToggleResults?: () => void;
	isResultsVisible?: boolean;
	hasResults?: boolean;
}

export const PanelHeader: React.FC<PanelHeaderProps> = ({
	isMaximized,
	isSessionActive,
	onMinimize,
	onMaximizeToggle,
	onToggleDebug,
	isDebug,
	onSettingsClick,
	logCount,
	onToggleResults,
	isResultsVisible,
	hasResults,
}) => {
	return (
		<div className="flex items-center justify-between">
			<div className="flex items-center gap-2">
				<h2 className="text-base font-semibold">Grok Auto Retry</h2>
				{isSessionActive && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Badge
								variant="outline"
								className="h-5 px-1.5 text-[10px] bg-green-500/10 text-green-500 border-green-500/30 animate-pulse"
							>
								ACTIVE
							</Badge>
						</TooltipTrigger>
						<TooltipContent>Session in progress</TooltipContent>
					</Tooltip>
				)}
			</div>
			<div className="flex gap-1">
				{hasResults && onToggleResults && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant={isResultsVisible ? "secondary" : "ghost"}
								size="icon"
								className="h-7 w-7"
								onClick={onToggleResults}
								aria-label={isResultsVisible ? "Hide Results" : "Show Results"}
							>
								<PieChart className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>{isResultsVisible ? "Hide Results" : "Show Results"}</TooltipContent>
					</Tooltip>
				)}
				{onToggleDebug && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant={isDebug ? "secondary" : "ghost"}
								size="icon"
								className="relative h-7 w-7"
								onClick={onToggleDebug}
							>
								<Bug className="h-4 w-4" />
								{typeof logCount === "number" && logCount > 0 && (
									<span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border border-background bg-amber-400 shadow-sm" />
								)}
							</Button>
						</TooltipTrigger>
						<TooltipContent>{isDebug ? "Hide Logs" : "Show Logs"}</TooltipContent>
					</Tooltip>
				)}
				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="icon" className="h-7 w-7" onClick={onMaximizeToggle}>
							{isMaximized ? <Minimize className="h-4 w-4" /> : <Fullscreen className="h-4 w-4" />}
						</Button>
					</TooltipTrigger>
					<TooltipContent>{isMaximized ? "Restore" : "Maximize"}</TooltipContent>
				</Tooltip>
				{!isMaximized && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button variant="ghost" size="icon" className="h-7 w-7" onClick={onMinimize}>
								<Minimize2 className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Minimize</TooltipContent>
					</Tooltip>
				)}
				{onSettingsClick && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								data-testid="settings-button"
								variant="ghost"
								size="icon"
								className="h-7 w-7"
								onClick={onSettingsClick}
							>
								<Settings className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Global Settings</TooltipContent>
					</Tooltip>
				)}
			</div>
		</div>
	);
};
