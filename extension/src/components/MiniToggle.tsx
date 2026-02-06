import React from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Maximize2 } from "lucide-react";

interface MiniToggleProps {
	position: { x: number; y: number };
	isDragging: boolean;
	dragMoved: boolean;
	onDragStart: (e: React.MouseEvent) => void;
	onRestore: () => void;
}

export const MiniToggle: React.FC<MiniToggleProps> = ({ position, isDragging, dragMoved, onDragStart, onRestore }) => {
	const handleClick = () => {
		// Only restore if not dragged
		if (!dragMoved) {
			onRestore();
		}
	};

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					data-testid="grok-retry-mini-toggle"
					size="icon"
					className="fixed rounded-full shadow-xl w-12 h-12"
					style={{
						left: `${position.x}px`,
						top: `${position.y}px`,
						cursor: isDragging ? "grabbing" : "grab",
					}}
					onMouseDown={onDragStart}
					onClick={handleClick}
				>
					<Maximize2 className="h-5 w-5" />
				</Button>
			</TooltipTrigger>
			<TooltipContent>Restore panel</TooltipContent>
		</Tooltip>
	);
};
