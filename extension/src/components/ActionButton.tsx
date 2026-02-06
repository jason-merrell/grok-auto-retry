import React from "react";
import { Button } from "@/components/ui/button";
import { Play, X } from "lucide-react";

interface ActionButtonProps {
	isSessionActive: boolean;
	onGenerate: () => void;
	onCancel: () => void;
}

export const ActionButton: React.FC<ActionButtonProps> = ({ isSessionActive, onGenerate, onCancel }) => {
	const { startShortcutLabel, startShortcutAria } = React.useMemo(() => {
		if (typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform)) {
			return { startShortcutLabel: "⌘ Enter", startShortcutAria: "Meta+Enter" };
		}
		return { startShortcutLabel: "Ctrl Enter", startShortcutAria: "Control+Enter" };
	}, []);

	const stopShortcutLabel = "Esc";
	const stopShortcutAria = "Escape";
	const shortcutClassName =
		"rounded border border-border bg-background/50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground";

	if (isSessionActive) {
		return (
			<div className="flex flex-col gap-1.5 w-full">
				<Button
					data-testid="stop-session-button"
					variant="destructive"
					size="sm"
					type="button"
					className="w-full justify-between px-3"
					onClick={onCancel}
					aria-keyshortcuts={stopShortcutAria}
				>
					<span className="flex items-center gap-2">
						<X className="h-4 w-4" aria-hidden="true" />
						<span>Stop Session</span>
					</span>
					<kbd className={shortcutClassName}>{stopShortcutLabel}</kbd>
				</Button>
			</div>
		);
	}

	return (
		<Button
			data-testid="start-session-button"
			variant="default"
			size="sm"
			type="button"
			className="w-full justify-between px-3"
			onClick={onGenerate}
			aria-keyshortcuts={startShortcutAria}
		>
			<span className="flex items-center gap-2">
				<Play className="h-4 w-4" aria-hidden="true" />
				<span>Start Session</span>
			</span>
			<kbd className={shortcutClassName}>{startShortcutLabel}</kbd>
		</Button>
	);
};
