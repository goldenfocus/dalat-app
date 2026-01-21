'use client';

import { useState, useRef, useCallback, type KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (content: string) => Promise<boolean>;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = 'Say something...',
  maxLength = 500,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || isSending || disabled) return;
    setIsSending(true);
    const success = await onSend(trimmed);
    if (success) setValue('');
    setIsSending(false);
    inputRef.current?.focus();
  }, [value, isSending, disabled, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const charCount = value.length;
  const isNearLimit = charCount > maxLength * 0.8;
  const isOverLimit = charCount > maxLength;

  return (
    <div className="flex items-center gap-2 p-3 border-t bg-background">
      <div className="relative flex-1">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, maxLength + 50))}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isSending}
          className={cn(
            'w-full h-10 px-3 pr-12 rounded-lg border bg-muted/50 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-primary/50',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            isOverLimit && 'border-destructive focus:ring-destructive/50'
          )}
        />
        {isNearLimit && (
          <span className={cn(
            'absolute right-12 top-1/2 -translate-y-1/2 text-xs',
            isOverLimit ? 'text-destructive' : 'text-muted-foreground'
          )}>
            {charCount}/{maxLength}
          </span>
        )}
      </div>
      <Button
        size="icon"
        onClick={handleSend}
        disabled={disabled || isSending || !value.trim() || isOverLimit}
        className="h-10 w-10 shrink-0"
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}
