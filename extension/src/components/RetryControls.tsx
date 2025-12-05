import React from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface RetryControlsProps {
  autoRetryEnabled: boolean;
  onAutoRetryChange: (enabled: boolean) => void;
}

export const RetryControls: React.FC<RetryControlsProps> = ({
  autoRetryEnabled,
  onAutoRetryChange,
}) => {
  return (
    <div className="flex items-center justify-between">
      <Tooltip>
        <TooltipTrigger asChild>
          <Label htmlFor="auto-retry" className="text-sm cursor-help">
            Auto-Retry {autoRetryEnabled ? 'ON' : 'OFF'}
          </Label>
        </TooltipTrigger>
        <TooltipContent>
          Automatically retry video generation when content is moderated
        </TooltipContent>
      </Tooltip>
      <Switch 
        id="auto-retry" 
        checked={autoRetryEnabled}
        onCheckedChange={onAutoRetryChange}
        className={cn(
          autoRetryEnabled 
            ? "data-[state=checked]:bg-green-500/80" 
            : "data-[state=unchecked]:bg-red-500/80"
        )}
      />
    </div>
  );
};
