"use client";

import { useTransition } from "react";
import { useRouter } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";

export function PeopleRetry({ label }: { label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      className="min-h-11"
      loading={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      {label}
    </Button>
  );
}
