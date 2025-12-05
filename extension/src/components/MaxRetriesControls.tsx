import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Plus, Minus, RotateCcw } from "lucide-react";

interface MaxRetriesControlsProps {
	maxRetries: number;
	retryCount: number;
	onMaxRetriesChange: (value: number) => void;
	onResetRetries: () => void;
	disabled?: boolean;
}

export const MaxRetriesControls: React.FC<MaxRetriesControlsProps> = ({
	maxRetries,
	retryCount,
	onMaxRetriesChange,
	onResetRetries,
	disabled = false,
}) => {
	const [inputValue, setInputValue] = useState((maxRetries ?? 3).toString());

	const handleIncrement = () => {
		const newValue = Math.min(50, (maxRetries ?? 3) + 1);
		onMaxRetriesChange(newValue);
		setInputValue(newValue.toString());
	};

	const handleDecrement = () => {
		const newValue = Math.max(1, (maxRetries ?? 3) - 1);
		onMaxRetriesChange(newValue);
		setInputValue(newValue.toString());
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setInputValue(e.target.value);
	};

	const handleSetMax = () => {
		onMaxRetriesChange(50);
		setInputValue("50");
	};

	const handleApplyValue = () => {
		const value = parseInt(inputValue) || 1;
		const clampedValue = Math.max(1, Math.min(50, value));
		onMaxRetriesChange(clampedValue);
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
		setInputValue((maxRetries ?? 3).toString());
	}, [maxRetries]);

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<Tooltip>
					<TooltipTrigger asChild>
						<Label className="text-sm cursor-help">Max Retries</Label>
					</TooltipTrigger>
					<TooltipContent>Maximum number of retry attempts before stopping (1-50)</TooltipContent>
				</Tooltip>
				<div className="flex items-center gap-2">
					{retryCount > 0 && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="sm"
									className="h-6 px-2"
									onClick={onResetRetries}
									disabled={disabled}
								>
									<RotateCcw className="h-3 w-3" />
									Reset
								</Button>
							</TooltipTrigger>
							<TooltipContent>Reset retry counter</TooltipContent>
						</Tooltip>
					)}
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								className="text-xs text-primary hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
								onClick={handleSetMax}
								disabled={disabled}
							>
								Set Max
							</button>
						</TooltipTrigger>
						<TooltipContent>Set max retries to 50</TooltipContent>
					</Tooltip>
				</div>
			</div>
			<div className="flex items-center gap-2">
				<Button
					variant="outline"
					size="icon"
					className="h-8 w-8"
					onClick={handleDecrement}
					disabled={disabled || maxRetries <= 1}
				>
					<Minus className="h-3 w-3" />
				</Button>
				<Input
					type="number"
					value={inputValue}
					className="h-8 text-center"
					min={1}
					max={50}
					onChange={handleInputChange}
					onKeyPress={handleKeyPress}
					onBlur={handleBlur}
					disabled={disabled}
				/>
				<Button
					variant="outline"
					size="icon"
					className="h-8 w-8"
					onClick={handleIncrement}
					disabled={disabled || maxRetries >= 50}
				>
					<Plus className="h-3 w-3" />
				</Button>
			</div>
		</div>
	);
};
