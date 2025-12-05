import React from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { ArrowUp, ArrowDown } from 'lucide-react';

interface PromptTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onCopyFromSite: () => void;
  onCopyToSite: () => void;
  disabled?: boolean;
}

export const PromptTextarea: React.FC<PromptTextareaProps> = ({
  value,
  onChange,
  onCopyFromSite,
  onCopyToSite,
  disabled = false,
}) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Tooltip>
          <TooltipTrigger asChild>
            <Label className="text-sm cursor-help">Prompt</Label>
          </TooltipTrigger>
          <TooltipContent>
            The prompt used for video generation. Import from site or type your own.
          </TooltipContent>
        </Tooltip>
        <div className="flex items-center text-xs text-muted-foreground">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 px-2 gap-1"
                onClick={onCopyFromSite}
                disabled={disabled}
              >
                <ArrowDown className="h-3.5 w-3.5" />
                <span className="font-medium sr-only">Import</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Import prompt from site textarea</TooltipContent>
          </Tooltip>
          <span className="text-border">|</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 px-2 gap-1"
                onClick={onCopyToSite}
                disabled={disabled || !value}
              >
                <ArrowUp className="h-3.5 w-3.5" />
                <span className="font-medium sr-only">Export</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Export prompt to site textarea</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <Textarea 
        placeholder="Your prompt will appear here..."
        className="min-h-[160px] text-xs resize-y"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
};
