import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Plus, Minus, RotateCcw } from 'lucide-react';

interface MaxRetriesControlsProps {
  maxRetries: number;
  retryCount: number;
  onMaxRetriesChange: (value: number) => void;
  onResetRetries: () => void;
}

export const MaxRetriesControls: React.FC<MaxRetriesControlsProps> = ({
  maxRetries,
  retryCount,
  onMaxRetriesChange,
  onResetRetries,
}) => {
  const handleIncrement = () => {
    onMaxRetriesChange(maxRetries + 1);
  };

  const handleDecrement = () => {
    onMaxRetriesChange(maxRetries - 1);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 1;
    onMaxRetriesChange(value);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">Max Retries</Label>
        {retryCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 px-2"
                onClick={onResetRetries}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset retry counter</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button 
          variant="outline" 
          size="icon" 
          className="h-8 w-8"
          onClick={handleDecrement}
          disabled={maxRetries <= 1}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <Input 
          type="number" 
          value={maxRetries} 
          className="h-8 text-center"
          min={1}
          max={50}
          onChange={handleInputChange}
        />
        <Button 
          variant="outline" 
          size="icon" 
          className="h-8 w-8"
          onClick={handleIncrement}
          disabled={maxRetries >= 50}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
};
