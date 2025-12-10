import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";

import { cn } from "@/lib/utils";

const ScrollArea = React.forwardRef<
	React.ElementRef<typeof ScrollAreaPrimitive.Root>,
	React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
	<ScrollAreaPrimitive.Root ref={ref} className={cn("relative overflow-hidden", className)} {...props}>
		<ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">{children}</ScrollAreaPrimitive.Viewport>
		<ScrollAreaPrimitive.Scrollbar
			orientation="vertical"
			className="flex touch-none select-none transition-colors duration-150 ease-out data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2"
		>
			<ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-border/60" />
		</ScrollAreaPrimitive.Scrollbar>
		<ScrollAreaPrimitive.Scrollbar
			orientation="horizontal"
			className="flex touch-none select-none transition-colors duration-150 ease-out data-[orientation=horizontal]:h-2 data-[orientation=horizontal]:w-full"
		>
			<ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-border/60" />
		</ScrollAreaPrimitive.Scrollbar>
		<ScrollAreaPrimitive.Corner className="bg-border/60" />
	</ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
	React.ElementRef<typeof ScrollAreaPrimitive.Scrollbar>,
	React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Scrollbar>
>(({ className, ...props }, ref) => (
	<ScrollAreaPrimitive.Scrollbar
		ref={ref}
		className={cn(
			"flex touch-none select-none transition-colors duration-150 ease-out data-[orientation=horizontal]:h-2 data-[orientation=vertical]:w-2",
			className
		)}
		{...props}
	>
		<ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-border/60" />
	</ScrollAreaPrimitive.Scrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.Scrollbar.displayName;

export { ScrollArea, ScrollBar };
