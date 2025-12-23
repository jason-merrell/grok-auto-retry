import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ShortcutRecorderProps {
	value: string;
	defaultValue: string;
	onChange: (value: string) => void;
}

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta"]);

const SPECIAL_KEY_LABELS: Record<string, string> = {
	" ": "Space",
	Spacebar: "Space",
	Escape: "Esc",
	ArrowUp: "ArrowUp",
	ArrowDown: "ArrowDown",
	ArrowLeft: "ArrowLeft",
	ArrowRight: "ArrowRight",
	Backspace: "Backspace",
	Delete: "Delete",
	Enter: "Enter",
	Tab: "Tab",
	Home: "Home",
	End: "End",
	PageUp: "PageUp",
	PageDown: "PageDown",
};

const isMacLike = () => typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

const buildShortcut = (event: KeyboardEvent | React.KeyboardEvent<HTMLButtonElement>): string | null => {
	const parts: string[] = [];
	const mac = isMacLike();

	if (event.metaKey) {
		parts.push(mac ? "Cmd" : "Meta");
	}
	if (event.ctrlKey) {
		parts.push("Ctrl");
	}
	if (event.altKey) {
		parts.push(mac ? "Option" : "Alt");
	}
	if (event.shiftKey) {
		parts.push("Shift");
	}

	const key = event.key;
	if (!key) {
		return null;
	}

	if (MODIFIER_KEYS.has(key)) {
		return null;
	}

	const upperKey = SPECIAL_KEY_LABELS[key] || (key.length === 1 ? key.toUpperCase() : key);
	parts.push(upperKey);

	return parts.join("+");
};

export const ShortcutRecorder: React.FC<ShortcutRecorderProps> = ({ value, defaultValue, onChange }) => {
	const [isRecording, setIsRecording] = useState(false);
	const buttonRef = useRef<HTMLButtonElement | null>(null);

	useEffect(() => {
		if (isRecording) {
			buttonRef.current?.focus();
		}
	}, [isRecording]);

	const stopRecording = useCallback(() => {
		setIsRecording(false);
	}, []);

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLButtonElement>) => {
			if (!isRecording) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();

			if (event.key === "Escape") {
				stopRecording();
				return;
			}

			if (event.key === "Backspace" && !event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
				onChange("");
				stopRecording();
				return;
			}

			const next = buildShortcut(event);
			if (!next) {
				return;
			}

			onChange(next);
			stopRecording();
		},
		[isRecording, onChange, stopRecording]
	);

	const handleClick = useCallback(() => {
		setIsRecording(true);
	}, []);

	const handleClear = useCallback(() => {
		onChange("");
		stopRecording();
		buttonRef.current?.focus();
	}, [onChange, stopRecording]);

	const handleReset = useCallback(() => {
		onChange(defaultValue);
		stopRecording();
		buttonRef.current?.focus();
	}, [defaultValue, onChange, stopRecording]);

	const displayValue = isRecording ? "Press keys..." : value || "Disabled";

	return (
		<div className="flex items-center gap-2">
			<Button
				ref={buttonRef}
				type="button"
				variant="outline"
				size="sm"
				className={cn(
					"flex-1 justify-between font-mono text-xs",
					isRecording ? "border-primary text-primary" : "text-muted-foreground"
				)}
				onClick={handleClick}
				onKeyDown={handleKeyDown}
				onBlur={stopRecording}
			>
				{displayValue}
			</Button>
			<Button type="button" variant="ghost" size="sm" className="text-xs" onClick={handleClear} disabled={!value}>
				Clear
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="text-xs"
				onClick={handleReset}
				disabled={value === defaultValue}
			>
				Default
			</Button>
		</div>
	);
};

ShortcutRecorder.displayName = "ShortcutRecorder";
