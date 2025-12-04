import React from 'react';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

interface RetryStatsProps {
  retryCount: number;
  maxRetries: number;
}

export const RetryStats: React.FC<RetryStatsProps> = ({
  retryCount,
  maxRetries,
}) => {
  const variant = retryCount >= maxRetries ? 'destructive' : 'secondary';
  
  return (
    <div className="flex items-center justify-between">
      <Label className="text-sm">Retries Used</Label>
      <Badge variant={variant}>
        {retryCount} / {maxRetries}
      </Badge>
    </div>
  );
};
