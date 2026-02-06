import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Plus, Minus, RotateCcw } from "lucide-react";
import { useDebouncedCallback } from "use-debounce";

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
	const [localMaxRetries, setLocalMaxRetries] = useState(maxRetries);

	const debouncedOnMaxRetriesChange = useDebouncedCallback(onMaxRetriesChange, 300);

	useEffect(() => {
		setLocalMaxRetries(maxRetries);
	}, [maxRetries]);

	const handleValueChange = (newValue: number) => {
		const clampedValue = Math.max(1, Math.min(50, newValue));
		setLocalMaxRetries(clampedValue);
		debouncedOnMaxRetriesChange(clampedValue);
	};

	const handleIncrement = () => {
		handleValueChange((localMaxRetries ?? 3) + 1);
	};

	const handleDecrement = () => {
		handleValueChange((localMaxRetries ?? 3) - 1);
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = parseInt(e.target.value, 10);
		if (!isNaN(value)) {
			handleValueChange(value);
		}
	};

	const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.currentTarget.blur();
		}
	};

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<Label htmlFor="max-retries" className="flex items-center gap-2">
					Max Retries
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="text-xs text-muted-foreground cursor-help">
								({retryCount} / {localMaxRetries})
							</span>
						</TooltipTrigger>
						<TooltipContent>
							<p>Current retries vs. max retries for this session.</p>
						</TooltipContent>
					</Tooltip>
				</Label>
				<div className="flex items-center gap-1">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								size="sm"
								variant="ghost"
								className="h-7 w-7 p-0"
								onClick={handleDecrement}
								disabled={disabled || localMaxRetries <= 1}
								aria-label="Decrement max retries"
							>
								<Minus className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							<p>Decrement max retries</p>
						</TooltipContent>
					</Tooltip>
					<Input
						id="max-retries"
						type="number"
						className="h-7 w-16 text-center"
						value={localMaxRetries}
						onChange={handleInputChange}
						onKeyPress={handleKeyPress}
						min={1}
						max={50}
						disabled={disabled}
						aria-label="Max retries"
					/>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								size="sm"
								variant="ghost"
								className="h-7 w-7 p-0"
								onClick={handleIncrement}
								disabled={disabled || localMaxRetries >= 50}
								aria-label="Increment max retries"
							>
								<Plus className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							<p>Increment max retries</p>
						</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								size="sm"
								variant="ghost"
								onClick={onResetRetries}
								disabled={disabled || retryCount === 0}
								className="h-7 w-7 p-0"
							>
								<RotateCcw className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							<p>Reset the current retry count to 0.</p>
						</TooltipContent>
					</Tooltip>
				</div>
			</div>
		</div>
	);
};
