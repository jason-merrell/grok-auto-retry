import React from "react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle } from "lucide-react";

interface RetryStatsProps {
	retryCount: number;
	maxRetries: number;
	videosGenerated: number;
	videoGoal: number;
	rapidFailureDetected: boolean;
}

export const RetryStats: React.FC<RetryStatsProps> = ({
	retryCount,
	maxRetries,
	videosGenerated,
	videoGoal,
	rapidFailureDetected,
}) => {
	// Retry badge logic: green (0%) -> orange (50%+) -> red (80%+)
	const retryPercentage = maxRetries > 0 ? (retryCount / maxRetries) * 100 : 0;
	let retryClassName = "";
	if (retryPercentage === 0) {
		retryClassName = "bg-green-500/20 text-green-700 dark:text-green-400 hover:bg-green-500/30";
	} else if (retryPercentage >= 80) {
		retryClassName = "bg-red-500/20 text-red-700 dark:text-red-400 hover:bg-red-500/30";
	} else if (retryPercentage >= 50) {
		retryClassName = "bg-orange-500/20 text-orange-700 dark:text-orange-400 hover:bg-orange-500/30";
	} else {
		retryClassName = "bg-green-500/20 text-green-700 dark:text-green-400 hover:bg-green-500/30";
	}

	// Video badge logic: secondary (0) -> orange (in progress) -> green (goal reached)
	let videoClassName = "";
	if (videosGenerated === 0) {
		videoClassName = "bg-secondary text-secondary-foreground hover:bg-secondary/80";
	} else if (videosGenerated >= videoGoal) {
		videoClassName = "bg-green-500/20 text-green-700 dark:text-green-400 hover:bg-green-500/30";
	} else {
		videoClassName = "bg-orange-500/20 text-orange-700 dark:text-orange-400 hover:bg-orange-500/30";
	}

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Label className="text-sm">Retries Used</Label>
					{rapidFailureDetected && (
						<Tooltip>
							<TooltipTrigger asChild>
								<AlertTriangle className="h-4 w-4 text-orange-300 cursor-help animate-pulse" />
							</TooltipTrigger>
							<TooltipContent side="right" className="max-w-xs">
								<p className="font-semibold mb-1">Rapid Moderation Failure</p>
								<p className="text-xs mb-2">
									Your video generation failed in less than 6 seconds, which strongly suggests your prompt
									text is triggering the pre-flight moderation filter.
								</p>
								<p className="text-xs">
									Consider rephrasing your prompt, removing sensitive keywords, or trying a completely
									different prompt. Sessions including rapid failures have a low success rate with
									continued retries.
								</p>
							</TooltipContent>
						</Tooltip>
					)}
				</div>
				<Badge className={retryClassName}>
					{retryCount ?? 0} / {maxRetries ?? 3}
				</Badge>
			</div>
			<div className="flex items-center justify-between">
				<Label className="text-sm">Videos Generated</Label>
				<Badge className={videoClassName}>
					{videosGenerated ?? 0} / {videoGoal ?? 1}
				</Badge>
			</div>
		</div>
	);
};
