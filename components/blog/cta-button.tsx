"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CtaButtonProps {
  url: string;
  text: string;
}

export function CtaButton({ url, text }: CtaButtonProps) {
  const isExternal = url.startsWith("http");

  if (isExternal) {
    return (
      <div className="flex justify-center my-8">
        <Button
          asChild
          size="lg"
          className="gap-2 px-8 active:scale-95 transition-all"
        >
          <a href={url} target="_blank" rel="noopener noreferrer">
            {text}
            <ArrowRight className="w-4 h-4" />
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex justify-center my-8">
      <Button
        asChild
        size="lg"
        className="gap-2 px-8 active:scale-95 transition-all"
      >
        <Link href={url}>
          {text}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </Button>
    </div>
  );
}
