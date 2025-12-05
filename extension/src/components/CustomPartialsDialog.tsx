import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PromptPartial } from "@/config/promptPartials";
import { Trash2, Plus, Edit2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
	const [editingId, setEditingId] = useState<string | null>(null);
	const [formData, setFormData] = useState({
		label: "",
		description: "",
		content: "",
		categories: "",
		position: "append" as "prepend" | "append",
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

	const canSave = formData.label.trim() && formData.content.trim();

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
				<DialogHeader>
					<DialogTitle>Manage Custom Prompt Partials</DialogTitle>
				</DialogHeader>

				<div className="flex-1 overflow-y-auto space-y-4">
					{/* Form Section */}
					<div className="space-y-3 p-4 border rounded-lg">
						<div className="text-sm font-medium">{editingId ? "Edit Partial" : "Add New Partial"}</div>

						<div className="space-y-2">
							<Label htmlFor="label">Label *</Label>
							<Input
								id="label"
								placeholder="e.g., My Custom Style"
								value={formData.label}
								onChange={(e) => setFormData({ ...formData, label: e.target.value })}
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="description">Description</Label>
							<Input
								id="description"
								placeholder="Brief description of what this partial does"
								value={formData.description}
								onChange={(e) => setFormData({ ...formData, description: e.target.value })}
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="content">Content *</Label>
							<Textarea
								id="content"
								placeholder="The text to add to the prompt"
								value={formData.content}
								onChange={(e) => setFormData({ ...formData, content: e.target.value })}
								rows={3}
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="categories">Categories (comma-separated)</Label>
							<Input
								id="categories"
								placeholder="e.g., Style, Lighting, Custom"
								value={formData.categories}
								onChange={(e) => setFormData({ ...formData, categories: e.target.value })}
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="position">Position</Label>
							<div className="flex gap-2">
								<Button
									type="button"
									variant={formData.position === "prepend" ? "default" : "outline"}
									size="sm"
									onClick={() => setFormData({ ...formData, position: "prepend" })}
								>
									Prepend (Before)
								</Button>
								<Button
									type="button"
									variant={formData.position === "append" ? "default" : "outline"}
									size="sm"
									onClick={() => setFormData({ ...formData, position: "append" })}
								>
									Append (After)
								</Button>
							</div>
						</div>

						<div className="flex gap-2">
							<Button onClick={handleSave} disabled={!canSave} size="sm">
								<Plus className="h-3 w-3 mr-1" />
								{editingId ? "Update" : "Add"} Partial
							</Button>
							{editingId && (
								<Button onClick={resetForm} variant="outline" size="sm">
									Cancel Edit
								</Button>
							)}
						</div>
					</div>

					{/* List Section */}
					<div className="space-y-2">
						<div className="text-sm font-medium">Your Custom Partials ({customPartials.length})</div>
						{customPartials.length === 0 ? (
							<div className="text-sm text-muted-foreground p-4 text-center border rounded-lg">
								No custom partials yet. Create one above to get started!
							</div>
						) : (
							<div className="space-y-2">
								{customPartials.map((partial) => (
									<div
										key={partial.id}
										className="flex items-start gap-2 p-3 border rounded-lg hover:bg-accent/50"
									>
										<div className="flex-1 min-w-0">
											<div className="font-medium text-sm">{partial.label}</div>
											{partial.description && (
												<div className="text-xs text-muted-foreground mt-1">
													{partial.description}
												</div>
											)}
											<div className="text-xs text-muted-foreground mt-1 font-mono">
												{partial.content}
											</div>
											{partial.categories && partial.categories.length > 0 && (
												<div className="flex gap-1 mt-2">
													{partial.categories.map((cat) => (
														<span key={cat} className="text-xs px-2 py-0.5 bg-secondary rounded">
															{cat}
														</span>
													))}
												</div>
											)}
										</div>
										<div className="flex gap-1 shrink-0">
											<Tooltip>
												<TooltipTrigger asChild>
													<Button
														variant="ghost"
														size="icon"
														className="h-7 w-7"
														onClick={() => handleEdit(partial)}
													>
														<Edit2 className="h-3 w-3" />
													</Button>
												</TooltipTrigger>
												<TooltipContent>Edit</TooltipContent>
											</Tooltip>
											<Tooltip>
												<TooltipTrigger asChild>
													<Button
														variant="ghost"
														size="icon"
														className="h-7 w-7 text-destructive"
														onClick={() => onDelete(partial.id)}
													>
														<Trash2 className="h-3 w-3" />
													</Button>
												</TooltipTrigger>
												<TooltipContent>Delete</TooltipContent>
											</Tooltip>
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
