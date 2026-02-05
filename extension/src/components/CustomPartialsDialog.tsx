import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PromptPartial } from "@/config/promptPartials";
import { Trash2, Plus, Edit2, X, BookmarkIcon } from "lucide-react";
import { useGrokRetrySavedPrompts } from "@/hooks/useGrokRetrySavedPrompts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CustomPartialsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	customPartials: PromptPartial[];
	onAdd: (partial: Omit<PromptPartial, "id">) => void;
	onUpdate: (id: string, updates: Partial<PromptPartial>) => void;
	onDelete: (id: string) => void;
}

export const CustomPartialsDialog: React.FC<CustomPartialsDialogProps> = ({
	open,
	onOpenChange,
	customPartials,
	onAdd,
	onUpdate,
	onDelete,
}) => {
	const [activeTab, setActiveTab] = useState<"partials" | "saved">("partials");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [formData, setFormData] = useState({
		label: "",
		description: "",
		content: "",
		categories: "",
		position: "append" as "prepend" | "append",
	});

	// Saved prompts form state
	const [editingPromptName, setEditingPromptName] = useState<string | null>(null);
	const [promptFormData, setPromptFormData] = useState({
		name: "",
		text: "",
	});

	const resetForm = () => {
		setFormData({
			label: "",
			description: "",
			content: "",
			categories: "",
			position: "append",
		});
		setEditingId(null);
	};

	const handleEdit = (partial: PromptPartial) => {
		setFormData({
			label: partial.label,
			description: partial.description,
			content: partial.content,
			categories: partial.categories?.join(", ") || "",
			position: partial.position,
		});
		setEditingId(partial.id);
	};

	const handleSave = () => {
		const categories = formData.categories
			.split(",")
			.map((c) => c.trim())
			.filter((c) => c.length > 0);

		const partialData = {
			label: formData.label,
			description: formData.description,
			content: formData.content,
			categories: categories.length > 0 ? categories : undefined,
			position: formData.position,
		};

		if (editingId) {
			onUpdate(editingId, partialData);
		} else {
			onAdd(partialData);
		}
		resetForm();
	};

	const resetPromptForm = () => {
		setPromptFormData({
			name: "",
			text: "",
		});
		setEditingPromptName(null);
	};

	const handleEditPrompt = (prompt: { name: string; text: string }) => {
		setPromptFormData({
			name: prompt.name,
			text: prompt.text,
		});
		setEditingPromptName(prompt.name);
	};

	const handleSavePrompt = () => {
		if (editingPromptName && editingPromptName !== promptFormData.name) {
			// Rename existing prompt
			renamePrompt(editingPromptName, promptFormData.name);
			// Update the text content
			savePrompt(promptFormData.name, promptFormData.text);
		} else {
			// Save new or update existing
			savePrompt(promptFormData.name, promptFormData.text);
		}
		resetPromptForm();
	};

	const canSave = formData.label.trim() && formData.content.trim();
	const canSavePrompt = promptFormData.name.trim() && promptFormData.text.trim();
	const { listPrompts, deletePrompt, renamePrompt, savePrompt } = useGrokRetrySavedPrompts();

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="bottom"
				className="h-[calc(100vh-30px)] overflow-hidden flex flex-col text-card-foreground"
				container={document.getElementById("grok-retry-root")}
			>
				<SheetHeader className="shrink-0">
					<div className="flex items-center justify-between">
						<div>
							<SheetTitle className="text-card-foreground">
								{activeTab === "partials" ? "Manage Custom Prompt Partials" : "Manage Saved Prompts"}
							</SheetTitle>
							<SheetDescription>
								{activeTab === "partials"
									? "Create and manage your own reusable prompt partials for quick insertion."
									: "Rename or delete globally saved prompts. Saved prompts are available across sessions."}
							</SheetDescription>
						</div>
						<div className="flex items-center gap-2">
							<Button
								variant={activeTab === "partials" ? "default" : "outline"}
								size="sm"
								className="h-8 px-3"
								onClick={() => setActiveTab("partials")}
							>
								Partials
							</Button>
							<Button
								variant={activeTab === "saved" ? "default" : "outline"}
								size="sm"
								className="h-8 px-3"
								onClick={() => setActiveTab("saved")}
							>
								Saved Prompts
							</Button>
						</div>
					</div>
				</SheetHeader>

				{activeTab === "partials" ? (
					<div className="flex-1 mt-6 overflow-hidden flex gap-6">
						{/* Left Side - Form */}
						<div className="w-96 shrink-0 space-y-4">
							<div className="p-5 border rounded-lg bg-accent/5 space-y-4">
								<div className="flex items-center justify-between pb-2 border-b">
									<div className="text-base font-semibold">
										{editingId ? "Edit Partial" : "Add New Partial"}
									</div>
									{editingId && (
										<Button onClick={resetForm} variant="ghost" size="sm">
											<X className="h-3 w-3 mr-1" />
											Cancel
										</Button>
									)}
								</div>

								<div className="space-y-3">
									<div className="space-y-2">
										<Label htmlFor="label" className="text-sm font-medium">
											Label *
										</Label>
										<Input
											id="label"
											placeholder="e.g., My Custom Style"
											value={formData.label}
											onChange={(e) => setFormData({ ...formData, label: e.target.value })}
										/>
									</div>

									<div className="space-y-2">
										<Label htmlFor="description" className="text-sm font-medium">
											Description
										</Label>
										<Input
											id="description"
											placeholder="Brief description"
											value={formData.description}
											onChange={(e) => setFormData({ ...formData, description: e.target.value })}
										/>
									</div>

									<div className="space-y-2">
										<Label htmlFor="content" className="text-sm font-medium">
											Content *
										</Label>
										<Textarea
											id="content"
											placeholder="The text to add to the prompt"
											value={formData.content}
											onChange={(e) => setFormData({ ...formData, content: e.target.value })}
											rows={6}
											className="resize-none"
										/>
									</div>

									<div className="space-y-2">
										<Label htmlFor="categories" className="text-sm font-medium">
											Categories
										</Label>
										<Input
											id="categories"
											placeholder="e.g., Style, Lighting, Custom"
											value={formData.categories}
											onChange={(e) => setFormData({ ...formData, categories: e.target.value })}
										/>
										<p className="text-xs text-muted-foreground">Comma-separated</p>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-medium">Position</Label>
										<div className="flex gap-2">
											<Button
												type="button"
												variant={formData.position === "prepend" ? "default" : "outline"}
												size="sm"
												className={cn(
													"flex-1",
													formData.position === "prepend"
														? "bg-primary text-primary-foreground"
														: "text-card-foreground border-card-foreground/30"
												)}
												onClick={() => setFormData({ ...formData, position: "prepend" })}
											>
												↑ Before
											</Button>
											<Button
												type="button"
												variant={formData.position === "append" ? "default" : "outline"}
												size="sm"
												className={cn(
													"flex-1",
													formData.position === "append"
														? "bg-primary text-primary-foreground"
														: "text-card-foreground border-card-foreground/30"
												)}
												onClick={() => setFormData({ ...formData, position: "append" })}
											>
												↓ After
											</Button>
										</div>
									</div>

									<Button onClick={handleSave} disabled={!canSave} className="w-full mt-4">
										<Plus className="h-4 w-4 mr-2" />
										{editingId ? "Update" : "Add"} Partial
									</Button>
								</div>
							</div>
						</div>

						{/* Right Side - Table */}
						<div className="flex-1 min-w-0 flex flex-col">
							<div className="flex items-center justify-between mb-4 pb-3 border-b">
								<div className="text-base font-semibold">Your Custom Partials</div>
								<Badge variant="secondary" className="text-sm px-3 py-1">
									{customPartials.length} {customPartials.length === 1 ? "Partial" : "Partials"}
								</Badge>
							</div>

							{customPartials.length === 0 ? (
								<div className="flex-1 flex items-center justify-center">
									<div className="text-center text-muted-foreground p-12 border-2 border-dashed rounded-lg">
										<Plus className="h-12 w-12 mx-auto mb-3 opacity-40" />
										<p className="text-lg font-medium mb-1">No custom partials yet</p>
										<p className="text-sm">Create one using the form to get started!</p>
									</div>
								</div>
							) : (
								<div className="flex-1 overflow-auto border rounded-lg">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead className="w-[180px]">Label</TableHead>
												<TableHead className="w-[200px]">Description</TableHead>
												<TableHead>Content</TableHead>
												<TableHead className="w-[150px]">Categories</TableHead>
												<TableHead className="w-[120px] text-center">Position</TableHead>
												<TableHead className="w-[100px] text-center">Actions</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{customPartials.map((partial) => (
												<TableRow key={partial.id} className="hover:bg-accent/30">
													<TableCell className="font-medium">{partial.label}</TableCell>
													<TableCell className="text-sm text-muted-foreground">
														{partial.description || <span className="italic opacity-50">—</span>}
													</TableCell>
													<TableCell>
														<div className="text-xs font-mono bg-muted/50 p-2 rounded border max-w-md truncate">
															{partial.content}
														</div>
													</TableCell>
													<TableCell>
														{partial.categories && partial.categories.length > 0 ? (
															<div className="flex flex-wrap gap-1">
																{partial.categories.map((cat) => (
																	<Badge key={cat} variant="secondary" className="text-xs">
																		{cat}
																	</Badge>
																))}
															</div>
														) : (
															<span className="text-sm italic opacity-50">—</span>
														)}
													</TableCell>
													<TableCell className="text-center">
														<Badge
															variant="outline"
															className="text-xs text-card-foreground border-card-foreground/20"
														>
															{partial.position === "prepend" ? "↑ Before" : "↓ After"}
														</Badge>
													</TableCell>
													<TableCell>
														<div className="flex gap-1 justify-center">
															<Tooltip>
																<TooltipTrigger asChild>
																	<Button
																		variant="ghost"
																		size="icon"
																		className="h-8 w-8"
																		onClick={() => handleEdit(partial)}
																	>
																		<Edit2 className="h-3.5 w-3.5" />
																	</Button>
																</TooltipTrigger>
																<TooltipContent>Edit</TooltipContent>
															</Tooltip>
															<Tooltip>
																<TooltipTrigger asChild>
																	<Button
																		variant="ghost"
																		size="icon"
																		className="h-8 w-8 text-destructive hover:text-destructive"
																		onClick={() => onDelete(partial.id)}
																	>
																		<Trash2 className="h-3.5 w-3.5" />
																	</Button>
																</TooltipTrigger>
																<TooltipContent>Delete</TooltipContent>
															</Tooltip>
														</div>
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>
							)}
						</div>
					</div>
				) : (
					<div className="flex-1 mt-6 overflow-hidden flex gap-6">
						{/* Left Side - Form */}
						<div className="w-[480px] shrink-0 space-y-4">
							<div className="p-5 border rounded-lg bg-accent/5 space-y-4">
								<div className="flex items-center justify-between pb-2 border-b">
									<div className="text-base font-semibold">
										{editingPromptName ? "Edit Saved Prompt" : "Add New Saved Prompt"}
									</div>
									{editingPromptName && (
										<Button onClick={resetPromptForm} variant="ghost" size="sm">
											<X className="h-3 w-3 mr-1" />
											Cancel
										</Button>
									)}
								</div>

								<div className="space-y-3">
									<div className="space-y-2">
										<Label htmlFor="prompt-name" className="text-sm font-medium">
											Name *
										</Label>
										<Input
											id="prompt-name"
											placeholder="e.g., My Custom Prompt"
											value={promptFormData.name}
											onChange={(e) => setPromptFormData({ ...promptFormData, name: e.target.value })}
										/>
									</div>

									<div className="space-y-2">
										<Label htmlFor="prompt-text" className="text-sm font-medium">
											Prompt Text *
										</Label>
										<Textarea
											id="prompt-text"
											placeholder="Enter your prompt text here..."
											value={promptFormData.text}
											onChange={(e) => setPromptFormData({ ...promptFormData, text: e.target.value })}
											rows={10}
											className="resize-none text-sm"
										/>
									</div>

									<Button onClick={handleSavePrompt} disabled={!canSavePrompt} className="w-full mt-4">
										<BookmarkIcon className="h-4 w-4 mr-2" />
										{editingPromptName ? "Update" : "Save"} Prompt
									</Button>
								</div>
							</div>
						</div>

						{/* Right Side - Table */}
						<div className="flex-1 min-w-0 flex flex-col">
							<div className="flex items-center justify-between mb-4 pb-3 border-b">
								<div className="text-base font-semibold">Your Saved Prompts</div>
								<Badge variant="secondary" className="text-sm px-3 py-1">
									{listPrompts().length} {listPrompts().length === 1 ? "Prompt" : "Prompts"}
								</Badge>
							</div>

							{listPrompts().length === 0 ? (
								<div className="flex-1 flex items-center justify-center">
									<div className="text-center text-muted-foreground p-12 border-2 border-dashed rounded-lg">
										<BookmarkIcon className="h-12 w-12 mx-auto mb-3 opacity-40" />
										<p className="text-lg font-medium mb-1">No saved prompts yet</p>
										<p className="text-sm">Create one using the form to get started!</p>
									</div>
								</div>
							) : (
								<div className="flex-1 overflow-auto border rounded-lg">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead className="w-[220px]">Name</TableHead>
												<TableHead>Preview</TableHead>
												<TableHead className="w-[140px] text-center">Actions</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{listPrompts().map((p) => (
												<TableRow key={p.name} className="hover:bg-accent/30">
													<TableCell className="font-medium">{p.name}</TableCell>
													<TableCell>
														<div className="text-xs font-mono bg-muted/50 p-2 rounded border max-w-md truncate">
															{p.text}
														</div>
													</TableCell>
													<TableCell>
														<div className="flex gap-1 justify-center">
															<Tooltip>
																<TooltipTrigger asChild>
																	<Button
																		variant="ghost"
																		size="icon"
																		className="h-8 w-8"
																		onClick={() => handleEditPrompt(p)}
																	>
																		<Edit2 className="h-3.5 w-3.5" />
																	</Button>
																</TooltipTrigger>
																<TooltipContent>Edit</TooltipContent>
															</Tooltip>
															<Tooltip>
																<TooltipTrigger asChild>
																	<Button
																		variant="ghost"
																		size="icon"
																		className="h-8 w-8 text-destructive hover:text-destructive"
																		onClick={() => deletePrompt(p.name)}
																	>
																		<Trash2 className="h-3.5 w-3.5" />
																	</Button>
																</TooltipTrigger>
																<TooltipContent>Delete</TooltipContent>
															</Tooltip>
														</div>
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>
							)}
						</div>
					</div>
				)}
			</SheetContent>
		</Sheet>
	);
};
