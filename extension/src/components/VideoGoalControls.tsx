import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Plus, Minus } from "lucide-react";

interface VideoGoalControlsProps {
	videoGoal: number;
	videosGenerated: number;
	onVideoGoalChange: (value: number) => void;
	disabled?: boolean;
}

export const VideoGoalControls: React.FC<VideoGoalControlsProps> = ({
	videoGoal,
	videosGenerated,
	onVideoGoalChange,
	disabled = false,
}) => {
	const [inputValue, setInputValue] = React.useState((videoGoal ?? 1).toString());

	const handleIncrement = () => {
		const newValue = Math.min(50, (videoGoal ?? 1) + 1);
		onVideoGoalChange(newValue);
		setInputValue(newValue.toString());
	};

	const handleDecrement = () => {
		const newValue = Math.max(1, (videoGoal ?? 1) - 1);
		onVideoGoalChange(newValue);
		setInputValue(newValue.toString());
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setInputValue(e.target.value);
	};

	const handleApplyValue = () => {
		const value = parseInt(inputValue) || 1;
		const clampedValue = Math.max(1, Math.min(50, value));
		onVideoGoalChange(clampedValue);
		setInputValue(clampedValue.toString());
	};

	const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			handleApplyValue();
		}
	};

	const handleBlur = () => {
		handleApplyValue();
	};

	// Sync local state when prop changes externally
	React.useEffect(() => {
		setInputValue((videoGoal ?? 1).toString());
	}, [videoGoal]);

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<Label htmlFor="video-goal" className="flex items-center gap-2">
					Video Goal
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="text-xs text-muted-foreground cursor-help">
								({videosGenerated} / {videoGoal})
							</span>
						</TooltipTrigger>
						<TooltipContent>
							<p>Current videos generated vs. goal for this session.</p>
						</TooltipContent>
					</Tooltip>
				</Label>
				<div className="flex items-center gap-1">
					<Button
						size="sm"
						variant="ghost"
						className="h-7 w-7 p-0"
						onClick={handleDecrement}
						disabled={disabled || videoGoal <= 1}
						aria-label="Decrement video goal"
					>
						<Minus className="h-4 w-4" />
					</Button>
					<Input
						id="video-goal"
						data-testid="video-goal-input"
						type="number"
						min="1"
						max="50"
						value={inputValue}
						onChange={handleInputChange}
						onKeyPress={handleKeyPress}
						onBlur={handleBlur}
						className="h-7 w-16 text-center"
						disabled={disabled}
						aria-label="Video goal"
					/>
					<Button
						size="sm"
						variant="ghost"
						className="h-7 w-7 p-0"
						onClick={handleIncrement}
						disabled={disabled || videoGoal >= 50}
						aria-label="Increment video goal"
					>
						<Plus className="h-4 w-4" />
					</Button>
				</div>
			</div>
		</div>
	);
};
