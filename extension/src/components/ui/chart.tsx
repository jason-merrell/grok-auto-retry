import React from "react";
import { Tooltip as RechartsTooltip } from "recharts";
import { cn } from "@/lib/utils";

type ChartConfigEntry = {
	label?: string;
	color?: string;
};

export type ChartConfig = Record<string, ChartConfigEntry>;

const ChartContext = React.createContext<ChartConfig>({});

export function useChartConfig(): ChartConfig {
	return React.useContext(ChartContext);
}

interface ChartContainerProps extends React.HTMLAttributes<HTMLDivElement> {
	config: ChartConfig;
}

export function ChartContainer({ children, className, config, ...props }: ChartContainerProps) {
	return (
		<ChartContext.Provider value={config}>
			<div className={cn("relative", className)} {...props}>
				{children}
			</div>
		</ChartContext.Provider>
	);
}

type RechartsTooltipProps = React.ComponentProps<typeof RechartsTooltip>;

export function ChartTooltip({ wrapperStyle, ...props }: RechartsTooltipProps) {
	return <RechartsTooltip wrapperStyle={{ outline: "none", ...wrapperStyle }} {...props} />;
}

interface ChartTooltipContentProps {
	active?: boolean;
	label?: string;
	payload?: Array<{
		name?: string | number;
		value?: number | string;
		dataKey?: string | number;
		color?: string;
		payload?: Record<string, unknown>;
	}>;
	hideLabel?: boolean;
}

export function ChartTooltipContent({ active, payload, label, hideLabel }: ChartTooltipContentProps) {
	const config = useChartConfig();

	if (!active || !payload || payload.length === 0) {
		return null;
	}

	return (
		<div className="grid gap-1 rounded-md border border-border bg-popover px-3 py-2 text-sm shadow-md">
			{!hideLabel && label ? <div className="font-medium text-foreground/90">{label}</div> : null}
			<div className="grid gap-1">
				{payload.map((item, index) => {
					if (!item) return null;
					const key = String(item.name ?? item.dataKey ?? index);
					const configEntry = config[key];
					const payloadDetails = (item.payload as { fill?: string } | undefined) ?? undefined;
					const color =
						configEntry?.color ||
						(payloadDetails && typeof payloadDetails.fill === "string" ? payloadDetails.fill : undefined) ||
						(typeof item.color === "string" ? item.color : undefined);

					return (
						<div key={`${key}-${index}`} className="flex items-center gap-2">
							<svg className="h-2 w-2" viewBox="0 0 8 8">
								<circle cx="4" cy="4" r="4" fill={color ?? "currentColor"} />
							</svg>
							<span className="text-muted-foreground">{configEntry?.label ?? key}</span>
							<span className="ml-auto font-semibold text-foreground">{item.value}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}
