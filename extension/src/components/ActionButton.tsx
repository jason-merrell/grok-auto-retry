import React from "react";
import { Button } from "@/components/ui/button";
import { Play, X } from "lucide-react";

interface ActionButtonProps {
	isSessionActive: boolean;
	onGenerate: () => void;
	onCancel: () => void;
}

export const ActionButton: React.FC<ActionButtonProps> = ({ isSessionActive, onGenerate, onCancel }) => {
	if (isSessionActive) {
		return (
			<Button variant="destructive" size="sm" className="w-full" onClick={onCancel}>
				<X className="h-4 w-4 mr-2" />
				Stop Session
			</Button>
		);
	}

	return (
		<Button variant="default" size="sm" className="w-full" onClick={onGenerate}>
			<Play className="h-4 w-4 mr-2" />
			Generate Video
		</Button>
	);
};
