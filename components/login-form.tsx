"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OAuthButtons } from "@/components/auth/oauth-buttons";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div className={cn("flex flex-col gap-4", className)} {...props}>
      <Link
        href="/"
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to events
      </Link>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome to dalat.app</CardTitle>
          <CardDescription>
            Sign in to discover events in Da Lat
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OAuthButtons />
        </CardContent>
      </Card>
    </div>
  );
}
