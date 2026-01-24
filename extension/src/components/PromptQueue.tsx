import React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Plus, X, GripVertical, ArrowUp, ArrowDown } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PromptPartials } from "./PromptPartials";

interface PromptQueueProps {
	promptQueue: string[];
	currentPromptIndex: number;
	isSessionActive: boolean;
	disabled?: boolean;
	onAddPrompt: (prompt: string) => void;
	onRemovePrompt: (index: number) => void;
	onUpdatePrompt: (index: number, prompt: string) => void;
	onMovePrompt: (fromIndex: number, toIndex: number) => void;
}

export const PromptQueue: React.FC<PromptQueueProps> = ({
	promptQueue,
	currentPromptIndex,
	isSessionActive,
	disabled = false,
	onAddPrompt,
	onRemovePrompt,
	onUpdatePrompt,
	onMovePrompt,
}) => {
	const [newPrompt, setNewPrompt] = React.useState("");
	const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
	const [editValue, setEditValue] = React.useState("");

	const handleAddPrompt = () => {
		if (newPrompt.trim()) {
			onAddPrompt(newPrompt.trim());
			setNewPrompt("");
		}
	};

	const handleStartEdit = (index: number) => {
		setEditingIndex(index);
		setEditValue(promptQueue[index]);
	};

	const handleSaveEdit = () => {
		if (editingIndex !== null && editValue.trim()) {
			onUpdatePrompt(editingIndex, editValue.trim());
			setEditingIndex(null);
			setEditValue("");
		}
	};

	const handleCancelEdit = () => {
		setEditingIndex(null);
		setEditValue("");
	};

	const handleMoveUp = (index: number) => {
		if (index > 0) {
			onMovePrompt(index, index - 1);
		}
	};

	const handleMoveDown = (index: number) => {
		if (index < promptQueue.length - 1) {
			onMovePrompt(index, index + 1);
		}
	};

	const handlePromptAppend = (partial: string, position: "prepend" | "append") => {
		// Check if partial content already exists in the new prompt
		const partialContent = partial.trim().replace(/\.$/, "");
		if (newPrompt.toLowerCase().includes(partialContent.toLowerCase())) {
			return; // Already exists, don't add
		}

		const updatedPrompt = position === "prepend" ? partial + newPrompt : newPrompt + partial;
		setNewPrompt(updatedPrompt);
	};

	const handleEditPromptAppend = (partial: string, position: "prepend" | "append") => {
		if (editingIndex === null) return;

		// Check if partial content already exists in the edit value
		const partialContent = partial.trim().replace(/\.$/, "");
		if (editValue.toLowerCase().includes(partialContent.toLowerCase())) {
			return; // Already exists, don't add
		}

		const updatedPrompt = position === "prepend" ? partial + editValue : editValue + partial;
		setEditValue(updatedPrompt);
	};

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<Tooltip>
					<TooltipTrigger asChild>
						<Label className="text-sm cursor-help">Prompt Queue</Label>
					</TooltipTrigger>
					<TooltipContent>
						Queue multiple prompts. When video goal &gt; 1, each video uses the next prompt in the queue.
					</TooltipContent>
				</Tooltip>
				<Badge variant="outline" className="text-xs">
					{promptQueue.length} prompt{promptQueue.length !== 1 ? "s" : ""}
				</Badge>
			</div>

			{promptQueue.length > 0 && (
				<div className="space-y-2 max-h-[200px] overflow-y-auto border border-border rounded-md p-2">
					{promptQueue.map((prompt, index) => (
						<div
							key={index}
							className={`relative rounded-md border p-2 ${
								index === currentPromptIndex && isSessionActive
									? "border-primary bg-primary/5"
									: "border-border bg-muted/20"
							}`}
						>
							{editingIndex === index ? (
								<div className="space-y-2">
									<Textarea
										value={editValue}
										onChange={(e) => setEditValue(e.target.value)}
										className="min-h-[60px] text-xs"
										disabled={disabled}
									/>
									<PromptPartials onAppendPartial={handleEditPromptAppend} disabled={disabled} />
									<div className="flex gap-1">
										<Button
											size="sm"
											variant="default"
											onClick={handleSaveEdit}
											disabled={disabled || !editValue.trim()}
											className="h-6 text-xs"
										>
											Save
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={handleCancelEdit}
											disabled={disabled}
											className="h-6 text-xs"
										>
											Cancel
										</Button>
									</div>
								</div>
							) : (
								<>
									<div className="flex items-start gap-2">
										<div className="flex flex-col gap-0.5">
											<Button
												size="sm"
												variant="ghost"
												onClick={() => handleMoveUp(index)}
												disabled={disabled || index === 0}
												className="h-4 w-4 p-0"
											>
												<ArrowUp className="h-3 w-3" />
											</Button>
											<Button
												size="sm"
												variant="ghost"
												onClick={() => handleMoveDown(index)}
												disabled={disabled || index === promptQueue.length - 1}
												className="h-4 w-4 p-0"
											>
												<ArrowDown className="h-3 w-3" />
											</Button>
										</div>
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2 mb-1">
												<Badge variant="secondary" className="text-xs h-4 px-1">
													#{index + 1}
												</Badge>
												{index === currentPromptIndex && isSessionActive && (
													<Badge variant="default" className="text-xs h-4 px-1">
														Current
													</Badge>
												)}
											</div>
											<p className="text-xs text-muted-foreground line-clamp-2 break-words">
												{prompt}
											</p>
										</div>
										<div className="flex gap-1">
											<Button
												size="sm"
												variant="ghost"
												onClick={() => handleStartEdit(index)}
												disabled={disabled}
												className="h-6 w-6 p-0"
											>
												<GripVertical className="h-3 w-3" />
											</Button>
											<Button
												size="sm"
												variant="ghost"
												onClick={() => onRemovePrompt(index)}
												disabled={disabled}
												className="h-6 w-6 p-0 text-destructive hover:text-destructive"
											>
												<X className="h-3 w-3" />
											</Button>
										</div>
									</div>
								</>
							)}
						</div>
					))}
				</div>
			)}

			{!disabled && (
				<div className="space-y-2">
					<Textarea
						placeholder="Enter a new prompt to add to queue..."
						className="min-h-[60px] text-xs"
						value={newPrompt}
						onChange={(e) => setNewPrompt(e.target.value)}
						disabled={disabled}
					/>
					<PromptPartials onAppendPartial={handlePromptAppend} disabled={disabled} />
					<Button
						size="sm"
						variant="outline"
						onClick={handleAddPrompt}
						disabled={disabled || !newPrompt.trim()}
						className="w-full h-7 text-xs"
					>
						<Plus className="h-3 w-3 mr-1" />
						Add to Queue
					</Button>
				</div>
			)}

			{promptQueue.length === 0 && disabled && (
				<p className="text-xs text-muted-foreground text-center py-4">No prompts in queue</p>
			)}
		</div>
	);
};
