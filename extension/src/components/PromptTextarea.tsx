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
}

export const PromptTextarea: React.FC<PromptTextareaProps> = ({
  value,
  onChange,
  onCopyFromSite,
  onCopyToSite,
}) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">Prompt</Label>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 px-2 gap-1"
                onClick={onCopyFromSite}
              >
                <ArrowDown className="h-3.5 w-3.5" />
                <span className="font-medium">Import</span>
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
                disabled={!value}
              >
                <ArrowUp className="h-3.5 w-3.5" />
                <span className="font-medium">Export</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Export prompt to site textarea</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <Textarea 
        placeholder="Your prompt will appear here..."
        className="min-h-[80px] resize-none text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
};
