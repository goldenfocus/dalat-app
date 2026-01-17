"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BackButton() {
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => router.back()}
      className="mb-4 text-gray-500 hover:text-gray-900 pl-0 -ml-2"
    >
      <ArrowLeft className="w-4 h-4 mr-1" />
      Back
    </Button>
  );
}
