import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { promptPartials } from "@/config/promptPartials";
import { Plus } from "lucide-react";

interface PromptPartialsProps {
	onAppendPartial: (content: string, position: "prepend" | "append") => void;
	disabled?: boolean;
}

export const PromptPartials: React.FC<PromptPartialsProps> = ({ onAppendPartial, disabled = false }) => {
	const [open, setOpen] = useState(false);
	const [selectedCategory, setSelectedCategory] = useState<string>("all");

	const categories = Array.from(new Set(promptPartials.flatMap((p) => p.categories || [])));
	const filteredPartials = (
		selectedCategory === "all" ? promptPartials : promptPartials.filter((p) => p.categories?.includes(selectedCategory))
	).sort((a, b) => a.label.localeCompare(b.label));

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<div className="flex gap-1">
					<Button
						variant="outline"
						size="sm"
						role="combobox"
						aria-expanded={open}
						className="h-7 px-2 text-xs gap-1"
						disabled={disabled}
					>
						<Plus className="h-3 w-3" />
						Add Prompt Partial
					</Button>
				</div>
			</PopoverTrigger>
			<PopoverContent className="w-80 p-3 h-[400px] flex flex-col" align="start">
				<div className="space-y-1 shrink-0">
					<div className="text-xs font-medium text-muted-foreground mb-2">Categories</div>
					<div className="flex flex-wrap gap-1">
						<Button
							variant={selectedCategory === "all" ? "default" : "outline"}
							size="sm"
							className="h-6 px-2 text-xs"
							onClick={() => setSelectedCategory("all")}
						>
							All
						</Button>
						{categories.map((category) => (
							<Button
								key={category}
								variant={selectedCategory === category ? "default" : "outline"}
								size="sm"
								className="h-6 px-2 text-xs"
								onClick={() => setSelectedCategory(category || "all")}
							>
								{category}
							</Button>
						))}
					</div>
				</div>

				<div className="space-y-1 flex-1 overflow-hidden flex flex-col mt-3">
					<div className="text-xs font-medium text-muted-foreground mb-2 shrink-0">Partials</div>
					<div className="flex flex-col gap-1 overflow-y-auto items-start">
						<TooltipProvider>
							{filteredPartials.map((partial) => (
								<Tooltip key={partial.id}>
									<TooltipTrigger asChild>
										<Button
											variant="default"
											size="sm"
											className="h-7 px-2 gap-1 text-xs w-full justify-start"
											onClick={() => {
												onAppendPartial(partial.content, partial.position);
												setOpen(false);
											}}
										>
											<Plus className="h-3 w-3" />
											{partial.label}
										</Button>
									</TooltipTrigger>
									<TooltipContent className="max-w-[250px]">
										<p className="text-xs">{partial.description}</p>
									</TooltipContent>
								</Tooltip>
							))}
						</TooltipProvider>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
};
