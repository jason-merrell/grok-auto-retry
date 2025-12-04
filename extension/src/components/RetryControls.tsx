import React from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

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
      <Label htmlFor="auto-retry" className="text-sm">Enable Auto-Retry</Label>
      <Switch 
        id="auto-retry" 
        checked={autoRetryEnabled}
        onCheckedChange={onAutoRetryChange}
      />
    </div>
  );
};
