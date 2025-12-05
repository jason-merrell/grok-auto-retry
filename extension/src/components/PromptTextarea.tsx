import React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ArrowUp, ArrowDown, Save, FolderOpen } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useSavedPrompts } from "@/hooks/useSavedPrompts";

interface PromptTextareaProps {
	value: string;
	onChange: (value: string) => void;
	onCopyFromSite: () => void;
	onCopyToSite: () => void;
	disabled?: boolean;
	isMaximized?: boolean;
}

export const PromptTextarea: React.FC<PromptTextareaProps> = ({
	value,
	onChange,
	onCopyFromSite,
	onCopyToSite,
	disabled = false,
	isMaximized = false,
}) => {
	const { listPrompts, savePrompt } = useSavedPrompts();
	const [loadOpen, setLoadOpen] = React.useState(false);

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<Tooltip>
					<TooltipTrigger asChild>
						<Label className="text-sm cursor-help">Prompt</Label>
					</TooltipTrigger>
					<TooltipContent>The prompt used for video generation. Import from site or type your own.</TooltipContent>
				</Tooltip>
				<div className="flex items-center text-xs text-muted-foreground">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="h-7 px-2 gap-1"
								onClick={onCopyFromSite}
								disabled={disabled}
							>
								<ArrowDown className="h-3.5 w-3.5" />
								<span className="font-medium sr-only">Import</span>
							</Button>
						</TooltipTrigger>
						<TooltipContent>Import prompt from site textarea</TooltipContent>
					</Tooltip>
					<span className="text-border">|</span>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								className="h-7 px-2 gap-1"
								onClick={onCopyToSite}
								disabled={disabled || !value}
							>
								<ArrowUp className="h-3.5 w-3.5" />
								<span className="font-medium sr-only">Export</span>
							</Button>
						</TooltipTrigger>
						<TooltipContent>Export prompt to site textarea</TooltipContent>
					</Tooltip>
					<span className="text-border">|</span>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="h-7 px-2 gap-1"
								onClick={() => {
									const name = window.prompt("Name for this prompt?");
									if (!name) return;
									const ok = savePrompt(name, value);
									if (ok) {
										setLoadOpen(true);
									}
								}}
								disabled={disabled || !value}
							>
								<Save className="h-3.5 w-3.5" />
								<span className="font-medium sr-only">Save</span>
							</Button>
						</TooltipTrigger>
						<TooltipContent>Save this prompt with a name</TooltipContent>
					</Tooltip>
					<span className="text-border">|</span>
					<Popover open={loadOpen} onOpenChange={setLoadOpen}>
						<Tooltip>
							<TooltipTrigger asChild>
								<PopoverTrigger asChild>
									<Button variant="ghost" size="sm" className="h-7 px-2 gap-1" disabled={disabled}>
										<FolderOpen className="h-3.5 w-3.5" />
										<span className="font-medium sr-only">Load</span>
									</Button>
								</PopoverTrigger>
							</TooltipTrigger>
							<TooltipContent>Load a saved prompt</TooltipContent>
						</Tooltip>
						<PopoverContent className="w-80 p-0" align="end">
							<div className="max-h-[260px] overflow-auto p-1">
								{listPrompts().length === 0 ? (
									<div className="py-6 text-center text-sm text-muted-foreground">No saved prompts</div>
								) : (
									<div className="space-y-1">
										{listPrompts().map((p) => (
											<div
												key={p.name}
												className="relative flex cursor-default select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
												onClick={() => {
													onChange(p.text);
													setLoadOpen(false);
												}}
											>
												<div className="flex flex-col gap-0.5 text-white">
													<span className="text-xs font-medium">{p.name}</span>
													<span className="text-[11px] text-secondary-foreground/80 dark:text-foreground/80 line-clamp-2">
														{p.text}
													</span>
												</div>
											</div>
										))}
									</div>
								)}
							</div>
						</PopoverContent>
					</Popover>
				</div>
			</div>
			<Textarea
				placeholder="Your prompt will appear here..."
				className={`min-h-[160px] resize-y ${isMaximized ? "text-md" : "text-xs"}`}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				disabled={disabled}
			/>
		</div>
	);
};
