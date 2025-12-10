import React, { useState } from "react";
import { useGlobalSettings } from "@/hooks/useGlobalSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Download, Upload, RotateCcw, CheckCircle2, AlertTriangle } from "lucide-react";

interface GlobalSettingsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export const GlobalSettingsDialog: React.FC<GlobalSettingsDialogProps> = ({ open, onOpenChange }) => {
	const { settings, isLoading, saveSetting, resetToDefaults, exportSettings, importSettings } = useGlobalSettings();

	const [saveStatus, setSaveStatus] = useState<string>("");
	const [importError, setImportError] = useState<string>("");
	const [activeTab, setActiveTab] = useState<"defaults" | "timing" | "ui" | "advanced">("defaults");

	const showSaveStatus = (message: string) => {
		setSaveStatus(message);
		setTimeout(() => setSaveStatus(""), 2000);
	};

	const handleExport = () => {
		const json = exportSettings();
		const blob = new Blob([json], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `grok-retry-settings-${new Date().toISOString().split("T")[0]}.json`;
		a.click();
		URL.revokeObjectURL(url);
		showSaveStatus("Settings exported");
	};

	const handleImport = () => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "application/json";
		input.onchange = (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (file) {
				const reader = new FileReader();
				reader.onload = (e) => {
					const result = importSettings(e.target?.result as string);
					if (result.success) {
						setImportError("");
						showSaveStatus("Settings imported successfully");
					} else {
						setImportError(result.error || "Import failed");
					}
				};
				reader.readAsText(file);
			}
		};
		input.click();
	};

	const handleReset = () => {
		if (confirm("Reset all settings to defaults? This cannot be undone.")) {
			resetToDefaults();
			showSaveStatus("Settings reset to defaults");
		}
	};

	if (isLoading) {
		return null;
	}

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="w-[600px] sm:max-w-[600px] overflow-y-auto text-card-foreground"
				container={document.getElementById("grok-retry-root")}
			>
				<SheetHeader>
					<SheetTitle className="text-card-foreground">Global Settings</SheetTitle>
					<SheetDescription>Configure defaults and preferences that sync across devices</SheetDescription>
				</SheetHeader>

				{saveStatus && (
					<div className="mt-4 p-2 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-2 text-green-600">
						<CheckCircle2 className="h-3 w-3" />
						<span className="text-xs">{saveStatus}</span>
					</div>
				)}

				{importError && (
					<div className="mt-4 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-600">
						<span className="text-xs">{importError}</span>
					</div>
				)}

				<div className="mt-6 space-y-6">
					{/* Tab Navigation */}
					<div className="flex gap-1 border-b border-border pb-1">
						{(["defaults", "timing", "ui", "advanced"] as const).map((tab) => (
							<Button
								key={tab}
								variant={activeTab === tab ? "secondary" : "ghost"}
								size="sm"
								className="capitalize"
								onClick={() => setActiveTab(tab)}
							>
								{tab}
							</Button>
						))}
					</div>

					{/* Defaults Tab */}
					{activeTab === "defaults" && (
						<div className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="defaultMaxRetries" className="text-sm">
									Default Max Retries
									<Badge variant="secondary" className="ml-2 text-xs">
										{settings.defaultMaxRetries}
									</Badge>
								</Label>
								<Input
									id="defaultMaxRetries"
									type="number"
									min={1}
									max={50}
									defaultValue={settings.defaultMaxRetries}
									onBlur={(e) => {
										const value = Math.max(1, Math.min(50, parseInt(e.target.value) || 1));
										saveSetting("defaultMaxRetries", value);
										showSaveStatus("Saved");
									}}
									className="w-32"
								/>
								<p className="text-xs text-muted-foreground">
									Number of retry attempts before giving up (1-50)
								</p>
							</div>

							<div className="space-y-2">
								<Label htmlFor="defaultVideoGoal" className="text-sm">
									Default Video Goal
									<Badge variant="secondary" className="ml-2 text-xs">
										{settings.defaultVideoGoal}
									</Badge>
								</Label>
								<Input
									id="defaultVideoGoal"
									type="number"
									min={1}
									max={50}
									defaultValue={settings.defaultVideoGoal}
									onBlur={(e) => {
										const value = Math.max(1, Math.min(50, parseInt(e.target.value) || 1));
										saveSetting("defaultVideoGoal", value);
										showSaveStatus("Saved");
									}}
									className="w-32"
								/>
								<p className="text-xs text-muted-foreground">Target number of videos to generate (1-50)</p>
							</div>

							<div className="flex items-center justify-between">
								<div className="space-y-1">
									<Label htmlFor="defaultAutoRetry" className="text-sm">
										Enable Auto-Retry by Default
									</Label>
									<p className="text-xs text-muted-foreground">
										Automatically retry when content moderation occurs
									</p>
								</div>
								<Switch
									id="defaultAutoRetry"
									checked={settings.defaultAutoRetryEnabled}
									onCheckedChange={(checked) => {
										saveSetting("defaultAutoRetryEnabled", checked);
										showSaveStatus("Saved");
									}}
								/>
							</div>
						</div>
					)}

					{/* Timing Tab */}
					{activeTab === "timing" && (
						<div className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="retryClickCooldown" className="text-sm">
									Retry Click Cooldown
									<Badge variant="secondary" className="ml-2 text-xs">
										{settings.retryClickCooldown / 1000}s
									</Badge>
								</Label>
								<Input
									id="retryClickCooldown"
									type="number"
									min={1}
									max={60}
									defaultValue={settings.retryClickCooldown / 1000}
									onBlur={(e) => {
										const seconds = Math.max(1, Math.min(60, parseInt(e.target.value) || 8));
										saveSetting("retryClickCooldown", seconds * 1000);
										showSaveStatus("Saved");
									}}
									className="w-32"
								/>
								<p className="text-xs text-muted-foreground">Delay between retry attempts (1-60 seconds)</p>
							</div>

							<div className="space-y-2">
								<Label htmlFor="videoGenerationDelay" className="text-sm">
									Video Generation Delay
									<Badge variant="secondary" className="ml-2 text-xs">
										{settings.videoGenerationDelay / 1000}s
									</Badge>
								</Label>
								<Input
									id="videoGenerationDelay"
									type="number"
									min={1}
									max={60}
									defaultValue={settings.videoGenerationDelay / 1000}
									onBlur={(e) => {
										const seconds = Math.max(1, Math.min(60, parseInt(e.target.value) || 8));
										saveSetting("videoGenerationDelay", seconds * 1000);
										showSaveStatus("Saved");
									}}
									className="w-32"
								/>
								<p className="text-xs text-muted-foreground">
									Delay between successful videos (1-60 seconds)
								</p>
							</div>

							<div className="space-y-2">
								<Label htmlFor="rateLimitWaitTime" className="text-sm">
									Rate Limit Wait Time
									<Badge variant="secondary" className="ml-2 text-xs">
										{settings.rateLimitWaitTime / 1000}s
									</Badge>
								</Label>
								<Input
									id="rateLimitWaitTime"
									type="number"
									min={30}
									max={300}
									defaultValue={settings.rateLimitWaitTime / 1000}
									onBlur={(e) => {
										const seconds = Math.max(30, Math.min(300, parseInt(e.target.value) || 60));
										saveSetting("rateLimitWaitTime", seconds * 1000);
										showSaveStatus("Saved");
									}}
									className="w-32"
								/>
								<p className="text-xs text-muted-foreground">Wait time when rate limited (30-300 seconds)</p>
							</div>

							<div className="space-y-2">
								<Label htmlFor="rapidFailureThreshold" className="text-sm">
									Rapid Failure Threshold
									<Badge variant="secondary" className="ml-2 text-xs">
										{settings.rapidFailureThreshold}s
									</Badge>
								</Label>
								<Input
									id="rapidFailureThreshold"
									type="number"
									min={1}
									max={30}
									defaultValue={settings.rapidFailureThreshold}
									onBlur={(e) => {
										const seconds = Math.max(1, Math.min(30, parseInt(e.target.value) || 6));
										saveSetting("rapidFailureThreshold", seconds);
										showSaveStatus("Saved");
									}}
									className="w-32"
								/>
								<p className="text-xs text-muted-foreground">
									Show warning if moderation occurs within this time (1-30 seconds)
								</p>
							</div>
						</div>
					)}

					{/* UI Tab */}
					{activeTab === "ui" && (
						<div className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="defaultPanelWidth" className="text-sm">
									Default Panel Width
									<Badge variant="secondary" className="ml-2 text-xs">
										{settings.defaultPanelWidth}px
									</Badge>
								</Label>
								<Input
									id="defaultPanelWidth"
									type="number"
									min={260}
									max={800}
									defaultValue={settings.defaultPanelWidth}
									onBlur={(e) => {
										const value = Math.max(260, Math.min(800, parseInt(e.target.value) || 320));
										saveSetting("defaultPanelWidth", value);
										showSaveStatus("Saved");
									}}
									className="w-32"
								/>
								<p className="text-xs text-muted-foreground">Panel width in pixels (260-800)</p>
							</div>

							<div className="space-y-2">
								<Label htmlFor="defaultPanelHeight" className="text-sm">
									Default Panel Height
									<Badge variant="secondary" className="ml-2 text-xs">
										{settings.defaultPanelHeight}px
									</Badge>
								</Label>
								<Input
									id="defaultPanelHeight"
									type="number"
									min={100}
									max={800}
									defaultValue={settings.defaultPanelHeight}
									onBlur={(e) => {
										const value = Math.max(100, Math.min(800, parseInt(e.target.value) || 400));
										saveSetting("defaultPanelHeight", value);
										showSaveStatus("Saved");
									}}
									className="w-32"
								/>
								<p className="text-xs text-muted-foreground">Panel height in pixels (100-800)</p>
							</div>

							<div className="flex items-center justify-between">
								<div className="space-y-1">
									<Label htmlFor="startMinimized" className="text-sm">
										Start Panel Minimized
									</Label>
									<p className="text-xs text-muted-foreground">
										Panel appears as floating button on page load
									</p>
								</div>
								<Switch
									id="startMinimized"
									checked={settings.startMinimized}
									onCheckedChange={(checked) => {
										saveSetting("startMinimized", checked);
										showSaveStatus("Saved");
									}}
								/>
							</div>
						</div>
					)}

					{/* Advanced Tab */}
					{activeTab === "advanced" && (
						<div className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="promptHistoryLimit" className="text-sm">
									Prompt History Limit
									<Badge variant="secondary" className="ml-2 text-xs">
										{settings.promptHistoryLimit}
									</Badge>
								</Label>
								<Input
									id="promptHistoryLimit"
									type="number"
									min={1}
									max={200}
									defaultValue={settings.promptHistoryLimit}
									onBlur={(e) => {
										const parsed = parseInt(e.target.value, 10);
										const next = Number.isNaN(parsed) ? 30 : Math.max(1, Math.min(200, parsed));
										saveSetting("promptHistoryLimit", next);
										showSaveStatus("Saved");
									}}
									className="w-32"
								/>
								<p className="text-xs text-muted-foreground">
									Number of prompt history records to retain (1-200)
								</p>
							</div>

							<div className="flex items-center justify-between">
								<div className="space-y-1">
									<Label htmlFor="showRapidFailure" className="text-sm">
										Show Rapid Failure Warning
									</Label>
									<p className="text-xs text-muted-foreground">
										Display alert when moderation occurs immediately
									</p>
								</div>
								<Switch
									id="showRapidFailure"
									checked={settings.showRapidFailureWarning}
									onCheckedChange={(checked) => {
										saveSetting("showRapidFailureWarning", checked);
										showSaveStatus("Saved");
									}}
								/>
							</div>

							<div className="flex items-center justify-between">
								<div className="space-y-1">
									<Label htmlFor="autoSwitchDebug" className="text-sm">
										Auto-Switch to Debug Panel
									</Label>
									<p className="text-xs text-muted-foreground">Show debug logs when session starts</p>
								</div>
								<Switch
									id="autoSwitchDebug"
									checked={settings.autoSwitchToDebug}
									onCheckedChange={(checked) => {
										saveSetting("autoSwitchToDebug", checked);
										showSaveStatus("Saved");
									}}
								/>
							</div>

							<div className="flex items-center justify-between">
								<div className="space-y-1">
									<Label htmlFor="autoSwitchResults" className="text-sm">
										Auto-Switch to Results Panel
									</Label>
									<p className="text-xs text-muted-foreground">
										Show the previous session summary when it finishes
									</p>
								</div>
								<Switch
									id="autoSwitchResults"
									checked={settings.autoSwitchToResultsOnComplete}
									onCheckedChange={(checked) => {
										saveSetting("autoSwitchToResultsOnComplete", checked);
										showSaveStatus("Saved");
									}}
								/>
							</div>

							<div className="border-t pt-4 space-y-4">
								<div>
									<h4 className="text-sm font-medium mb-1">Custom CSS Selectors</h4>
									<p className="text-xs text-muted-foreground mb-3">
										Override default selectors if the site is in a different language or selectors have
										changed. Leave blank to use defaults.
									</p>
									<div className="space-y-3 text-xs">
										<div className="p-3 bg-muted/30 rounded-md space-y-2">
											<div className="flex items-center gap-2 text-yellow-600">
												<AlertTriangle className="h-3.5 w-3.5" />
												<span className="font-medium">Advanced Users Only</span>
											</div>
											<p className="text-muted-foreground leading-relaxed">
												To find selectors: Right-click an element → Inspect → Copy selector from
												DevTools. Test in Console with{" "}
												<code className="bg-background px-1 rounded">
													document.querySelector("your-selector")
												</code>
											</p>
										</div>

										<div className="space-y-2">
											<Label htmlFor="notificationSelector" className="text-xs">
												Notification Section
												<Badge variant="secondary" className="ml-2 text-[9px]">
													Default: section[aria-label*="Notifications"]
												</Badge>
											</Label>
											<Input
												id="notificationSelector"
												placeholder='section[aria-label*="Notifications"][aria-live="polite"]'
												value={settings.customSelectors?.notificationSection || ""}
												onChange={(e) => {
													saveSetting("customSelectors", {
														...settings.customSelectors,
														notificationSection: e.target.value || undefined,
													});
													showSaveStatus("Saved - Reload page to apply");
												}}
												className="font-mono text-xs h-8"
											/>
											<p className="text-[10px] text-muted-foreground">
												Section where error notifications appear
											</p>
										</div>

										<div className="space-y-2">
											<Label htmlFor="makeVideoSelector" className="text-xs">
												Make Video Button
												<Badge variant="secondary" className="ml-2 text-[9px]">
													Default: button[aria-label="Make video"]
												</Badge>
											</Label>
											<Input
												id="makeVideoSelector"
												placeholder='button[aria-label="Make video"]'
												value={settings.customSelectors?.makeVideoButton || ""}
												onChange={(e) => {
													saveSetting("customSelectors", {
														...settings.customSelectors,
														makeVideoButton: e.target.value || undefined,
													});
													showSaveStatus("Saved - Reload page to apply");
												}}
												className="font-mono text-xs h-8"
											/>
											<p className="text-[10px] text-muted-foreground">
												Button clicked to generate videos
											</p>
										</div>

										<div className="space-y-2">
											<Label htmlFor="videoSelector" className="text-xs">
												Video Element
												<Badge variant="secondary" className="ml-2 text-[9px]">
													Default: video[id="sd-video"]
												</Badge>
											</Label>
											<Input
												id="videoSelector"
												placeholder='video[id="sd-video"]'
												value={settings.customSelectors?.videoElement || ""}
												onChange={(e) => {
													saveSetting("customSelectors", {
														...settings.customSelectors,
														videoElement: e.target.value || undefined,
													});
													showSaveStatus("Saved - Reload page to apply");
												}}
												className="font-mono text-xs h-8"
											/>
											<p className="text-[10px] text-muted-foreground">
												Video element to detect successful generation
											</p>
										</div>

										<div className="space-y-2">
											<Label htmlFor="promptSelector" className="text-xs">
												Prompt Textarea
												<Badge variant="secondary" className="ml-2 text-[9px]">
													Default: textarea[name*="prompt"]
												</Badge>
											</Label>
											<Input
												id="promptSelector"
												placeholder='textarea[name*="prompt"], [contenteditable="true"]'
												value={settings.customSelectors?.promptTextarea || ""}
												onChange={(e) => {
													saveSetting("customSelectors", {
														...settings.customSelectors,
														promptTextarea: e.target.value || undefined,
													});
													showSaveStatus("Saved - Reload page to apply");
												}}
												className="font-mono text-xs h-8"
											/>
											<p className="text-[10px] text-muted-foreground">
												Input field where prompts are entered
											</p>
										</div>

										<Button
											variant="outline"
											size="sm"
											onClick={() => {
												saveSetting("customSelectors", undefined);
												showSaveStatus("Selectors reset - Reload page to apply");
											}}
											className="w-full text-xs h-7"
										>
											Clear All Custom Selectors
										</Button>
									</div>
								</div>
							</div>

							<div className="border-t pt-4 space-y-3">
								<h4 className="text-sm font-medium">Import & Export</h4>
								<div className="flex gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={handleExport}
										className="flex items-center gap-2"
									>
										<Download className="h-3 w-3" />
										Export
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={handleImport}
										className="flex items-center gap-2"
									>
										<Upload className="h-3 w-3" />
										Import
									</Button>
								</div>
								<p className="text-xs text-muted-foreground">Backup or restore settings from JSON file</p>
							</div>

							<div className="border-t pt-4 space-y-3">
								<h4 className="text-sm font-medium">Reset Settings</h4>
								<Button
									variant="destructive"
									size="sm"
									onClick={handleReset}
									className="flex items-center gap-2"
								>
									<RotateCcw className="h-3 w-3" />
									Reset to Defaults
								</Button>
								<p className="text-xs text-muted-foreground">Restore all settings to default values</p>
							</div>
						</div>
					)}
				</div>

				<div className="mt-6 pt-4 border-t text-center text-xs text-muted-foreground">
					Changes sync across your devices via Chrome storage
				</div>
			</SheetContent>
		</Sheet>
	);
};
