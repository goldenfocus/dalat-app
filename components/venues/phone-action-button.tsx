"use client";

import { Phone, MessageCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PhoneActionButtonProps {
  phone: string;
  zaloUrl?: string | null;
  className?: string;
}

export function PhoneActionButton({ phone, zaloUrl, className }: PhoneActionButtonProps) {
  // Format phone for SMS (remove spaces and special chars except +)
  const smsPhone = phone.replace(/[^\d+]/g, "");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={className}
          aria-label="Contact options"
        >
          <Phone className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[160px]">
        <DropdownMenuItem asChild className="py-3 px-4 text-base cursor-pointer">
          <a href={`tel:${phone}`} className="flex items-center gap-3">
            <Phone className="w-5 h-5" />
            <span>Call</span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="py-3 px-4 text-base cursor-pointer">
          <a href={`sms:${smsPhone}`} className="flex items-center gap-3">
            <MessageCircle className="w-5 h-5" />
            <span>SMS</span>
          </a>
        </DropdownMenuItem>
        {zaloUrl && (
          <DropdownMenuItem asChild className="py-3 px-4 text-base cursor-pointer">
            <a
              href={zaloUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3"
            >
              <svg viewBox="0 0 48 48" className="w-5 h-5">
                <path fill="currentColor" d="M24 4C12.954 4 4 12.954 4 24s8.954 20 20 20 20-8.954 20-20S35.046 4 24 4z"/>
                <path fill="var(--background, white)" d="M32.5 15h-17c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h2v4l5-4h10c1.1 0 2-.9 2-2V17c0-1.1-.9-2-2-2zM18 23h-2v-5h2v5zm8 0h-6v-1h4v-1h-3c-.6 0-1-.4-1-1v-2h6v1h-4v1h3c.6 0 1 .4 1 1v2zm6 0h-2v-5h2v5z"/>
              </svg>
              <span>Zalo</span>
            </a>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
