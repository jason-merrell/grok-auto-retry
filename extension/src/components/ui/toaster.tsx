import * as React from "react";
import { createPortal } from "react-dom";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { useToast } from "@/components/ui/use-toast";

const DEFAULT_DURATION = 4000;

export function Toaster() {
	const { toasts, dismiss } = useToast();
	const [container, setContainer] = React.useState<HTMLElement | null>(() =>
		typeof document === "undefined" ? null : document.getElementById("grok-retry-root")
	);

	React.useEffect(() => {
		if (!container) {
			setContainer(document.getElementById("grok-retry-root"));
		}
	}, [container]);

	const target = container ?? (typeof document !== "undefined" ? document.body : null);

	if (!target) {
		return null;
	}

	return createPortal(
		<ToastProvider duration={DEFAULT_DURATION} swipeDirection="left">
			{toasts.map(({ id, title, description, action, ...toast }) => (
				<Toast
					key={id}
					{...toast}
					onOpenChange={(open) => {
						if (!open) {
							dismiss(id);
						}
					}}
				>
					<div className="grid gap-1">
						{title && <ToastTitle>{title}</ToastTitle>}
						{description && <ToastDescription>{description}</ToastDescription>}
					</div>
					{action}
					<ToastClose />
				</Toast>
			))}
			<ToastViewport />
		</ToastProvider>,
		target
	);
}
