import React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ArrowUp, ArrowDown, Save, FolderOpen, History, Search } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGrokRetrySavedPrompts } from "@/hooks/useGrokRetrySavedPrompts";
import type { PromptHistoryRecord } from "@/hooks/useGrokRetryPromptHistory";
import { SelectPortal } from "@radix-ui/react-select";

type HistorySortOption = "lastUsed" | "mostUsed" | "mostSuccessful";

const HISTORY_SORT_OPTIONS: Array<{ label: string; value: HistorySortOption }> = [
	{ label: "Last Used", value: "lastUsed" },
	{ label: "Most Used", value: "mostUsed" },
	{ label: "Most Successful", value: "mostSuccessful" },
];

interface PromptTextareaProps {
	value: string;
	onChange: (value: string) => void;
	onCopyFromSite: () => void;
	onCopyToSite: () => void;
	disabled?: boolean;
	isMaximized?: boolean;
	promptHistoryRecords?: PromptHistoryRecord[];
}

export const PromptTextarea: React.FC<PromptTextareaProps> = ({
	value,
	onChange,
	onCopyFromSite,
	onCopyToSite,
	disabled = false,
	isMaximized = false,
	promptHistoryRecords = [],
}) => {
	const { listPrompts, savePrompt } = useGrokRetrySavedPrompts();
	const [loadOpen, setLoadOpen] = React.useState(false);
	const [historyOpen, setHistoryOpen] = React.useState(false);
	const [historySearch, setHistorySearch] = React.useState("");
	const [historySort, setHistorySort] = React.useState<HistorySortOption>("lastUsed");

	const hasHistory = promptHistoryRecords.length > 0;
	const filteredHistoryRecords = React.useMemo(() => {
		const term = historySearch.trim().toLowerCase();
		const base = term
			? promptHistoryRecords.filter((record) => record.text.toLowerCase().includes(term))
			: [...promptHistoryRecords];
		const getExecutions = (record: PromptHistoryRecord) => record.executionsAmount ?? 0;
		const getSuccesses = (record: PromptHistoryRecord) => record.successAmount ?? 0;
		const getLastExecuted = (record: PromptHistoryRecord) => record.lastExecuted ?? 0;
		const getSuccessRate = (record: PromptHistoryRecord) => {
			const executions = getExecutions(record);
			return executions > 0 ? getSuccesses(record) / executions : 0;
		};
		base.sort((a, b) => {
			switch (historySort) {
				case "mostUsed": {
					const diff = getExecutions(b) - getExecutions(a);
					if (diff !== 0) {
						return diff;
					}
					return getLastExecuted(b) - getLastExecuted(a);
				}
				case "mostSuccessful": {
					const rateDiff = getSuccessRate(b) - getSuccessRate(a);
					if (rateDiff !== 0) {
						return rateDiff > 0 ? 1 : -1;
					}
					const successDiff = getSuccesses(b) - getSuccesses(a);
					if (successDiff !== 0) {
						return successDiff;
					}
					const executionDiff = getExecutions(b) - getExecutions(a);
					if (executionDiff !== 0) {
						return executionDiff;
					}
					return getLastExecuted(b) - getLastExecuted(a);
				}
				case "lastUsed":
				default:
					const lastUsedDiff = getLastExecuted(b) - getLastExecuted(a);
					if (lastUsedDiff !== 0) {
						return lastUsedDiff;
					}
					return getExecutions(b) - getExecutions(a);
			}
		});
		return base;
	}, [promptHistoryRecords, historySearch, historySort]);
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
													<span className="text-[11px] text-secondary-foreground/80 dark:text-card-foreground/80 line-clamp-2">
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
					<span className="text-border">|</span>
					<Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
						<Tooltip>
							<TooltipTrigger asChild>
								<SheetTrigger asChild>
									<Button
										variant="ghost"
										size="sm"
										className="h-7 px-2 gap-1"
										disabled={disabled || !hasHistory}
									>
										<History className="h-3.5 w-3.5" />
										<span className="font-medium sr-only">History</span>
									</Button>
								</SheetTrigger>
							</TooltipTrigger>
							<TooltipContent>View prompt history</TooltipContent>
						</Tooltip>
						<SheetContent
							side="right"
							className="flex h-full flex-col sm:max-w-lg"
							container={document.getElementById("grok-retry-root")}
						>
							<SheetHeader>
								<SheetTitle className="flex items-center gap-2 text-card-foreground">
									<History className="h-4 w-4" /> Prompt History
								</SheetTitle>
								<SheetDescription>
									Reapply prompts that previously succeeded or failed. Sorted by most recent execution.
								</SheetDescription>
							</SheetHeader>
							<div className="mt-6 flex flex-1 min-h-0 flex-col space-y-4 overflow-hidden">
								{hasHistory ? (
									<div className="flex flex-1 min-h-0 flex-col gap-4">
										<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
											<div className="relative w-full sm:max-w-xs">
												<Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
												<Input
													type="search"
													value={historySearch}
													onChange={(event) => setHistorySearch(event.target.value)}
													placeholder="Search prompts"
													className="h-8 pl-8 text-xs"
												/>
											</div>
											<div className="w-full sm:w-[200px]">
												<Select
													value={historySort}
													onValueChange={(value) => setHistorySort(value as HistorySortOption)}
												>
													<SelectTrigger className="h-8 text-xs">
														<SelectValue placeholder="Sort prompts" />
													</SelectTrigger>
													<SelectPortal>
														<SelectContent align="end" className="text-xs z-[999999]">
															{HISTORY_SORT_OPTIONS.map((option) => (
																<SelectItem
																	key={option.value}
																	value={option.value}
																	className="text-xs"
																>
																	{option.label}
																</SelectItem>
															))}
														</SelectContent>
													</SelectPortal>
												</Select>
											</div>
										</div>
										<ScrollArea className="flex-1 min-h-0 pr-1">
											<div className="space-y-2">
												{filteredHistoryRecords.length === 0 ? (
													<div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
														No prompts match your filters.
													</div>
												) : (
													filteredHistoryRecords.map((record) => {
														const successRate =
															record.executionsAmount > 0
																? Math.round(
																		(record.successAmount / record.executionsAmount) *
																			100
																	)
																: 0;
														const failureCount = Math.max(
															record.executionsAmount - record.successAmount,
															0
														);
														const lastOutcomeLabel = (() => {
															if (record.lastOutcome === "success") return "Success";
															if (record.lastOutcome === "failure") {
																if (record.lastLayer) {
																	return `Layer ${record.lastLayer} failure`;
																}
																return "Failure";
															}
															return "Unknown";
														})();
														const lastOutcomeTone =
															record.lastOutcome === "success"
																? "text-green-500 dark:text-green-400"
																: record.lastOutcome === "failure"
																	? "text-amber-500 dark:text-amber-300"
																	: "text-card-foreground/70";
														const lastExecutedLabel = record.lastExecuted
															? new Date(record.lastExecuted).toLocaleString()
															: "Never";
														return (
															<button
																key={record.id}
																type="button"
																onClick={() => {
																	onChange(record.text);
																	setHistoryOpen(false);
																}}
																className="w-full rounded-lg border border-border/70 bg-card/60 p-3 text-left transition hover:border-primary/60 hover:bg-accent/40 focus-visible:outline-none"
															>
																<div className="flex items-start justify-between gap-3">
																	<div className="space-y-2">
																		<Tooltip>
																			<TooltipTrigger asChild>
																				<p className="text-sm font-medium leading-tight text-card-foreground line-clamp-2">
																					{record.text}
																				</p>
																			</TooltipTrigger>
																			<TooltipContent className="max-w-[32rem] whitespace-pre-wrap break-words text-sm leading-relaxed">
																				{record.text}
																			</TooltipContent>
																		</Tooltip>
																		<div className="text-[11px] text-muted-foreground">
																			Last run {lastExecutedLabel}
																		</div>
																	</div>
																	<Badge
																		variant="outline"
																		className="shrink-0 text-card-foreground"
																	>
																		{successRate}%
																	</Badge>
																</div>
																<div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
																	<span>
																		{record.executionsAmount} run
																		{record.executionsAmount === 1 ? "" : "s"}
																	</span>
																	<span>
																		{record.successAmount} success
																		{record.successAmount === 1 ? "" : "es"}
																	</span>
																	{failureCount > 0 ? (
																		<span>
																			{failureCount} failure
																			{failureCount === 1 ? "" : "s"}
																		</span>
																	) : null}
																	<span className={lastOutcomeTone}>
																		{lastOutcomeLabel}
																	</span>
																</div>
															</button>
														);
													})
												)}
											</div>
										</ScrollArea>
									</div>
								) : (
									<div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
										Prompt history will appear here once you start generating videos.
									</div>
								)}
							</div>
						</SheetContent>
					</Sheet>
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
