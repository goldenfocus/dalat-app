"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { PersonaImageUpload } from "@/components/admin/persona-image-upload";
import type { Persona } from "@/lib/types";

interface PersonaFormProps {
  persona?: Persona;
}

function sanitizeHandle(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "")
    .slice(0, 20);
}

type HandleStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export function PersonaForm({ persona }: PersonaFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [referenceImages, setReferenceImages] = useState<string[]>(
    persona?.reference_images ?? []
  );

  const isEditing = !!persona;

  // Handle state
  const [handle, setHandle] = useState(persona?.handle ?? "");
  const [handleStatus, setHandleStatus] = useState<HandleStatus>("idle");
  const [handleTouched, setHandleTouched] = useState(false);

  // Check handle availability
  useEffect(() => {
    if (!handle || !handleTouched) {
      setHandleStatus("idle");
      return;
    }

    if (handle.length < 2 || !/^[a-z0-9_]+$/.test(handle)) {
      setHandleStatus("invalid");
      return;
    }

    if (isEditing && handle === persona?.handle) {
      setHandleStatus("available");
      return;
    }

    setHandleStatus("checking");

    const timer = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("personas")
        .select("id")
        .eq("handle", handle)
        .maybeSingle();

      setHandleStatus(data ? "taken" : "available");
    }, 300);

    return () => clearTimeout(timer);
  }, [handle, handleTouched, isEditing, persona?.handle]);

  // Auto-suggest handle from name
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isEditing && !handleTouched) {
      setHandle(sanitizeHandle(e.target.value));
    }
  };

  const handleHandleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHandle(sanitizeHandle(e.target.value));
    setHandleTouched(true);
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const context = formData.get("context") as string;
    const style = formData.get("style") as string;

    if (!name) {
      setError("Name is required");
      return;
    }

    if (!handle || handle.length < 2) {
      setError("Handle must be at least 2 characters");
      return;
    }

    if (handleStatus === "taken") {
      setError("This handle is already taken");
      return;
    }

    if (referenceImages.length === 0) {
      setError("At least one reference image is required");
      return;
    }

    const supabase = createClient();

    startTransition(async () => {
      const data = {
        name,
        handle,
        context: context || null,
        style: style || null,
        reference_images: referenceImages,
      };

      if (isEditing) {
        const { error: updateError } = await supabase
          .from("personas")
          .update(data)
          .eq("id", persona.id);

        if (updateError) {
          setError(updateError.message);
          return;
        }
      } else {
        const { error: insertError } = await supabase
          .from("personas")
          .insert(data);

        if (insertError) {
          setError(insertError.message);
          return;
        }
      }

      router.push("/admin/personas");
      router.refresh();
    });
  }

  async function handleDelete() {
    if (!persona) return;
    if (!confirm(`Delete persona @${persona.handle}? This cannot be undone.`)) {
      return;
    }

    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("personas")
      .delete()
      .eq("id", persona.id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    router.push("/admin/personas");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="p-6 space-y-6">
          {/* Reference images upload */}
          <PersonaImageUpload
            personaId={persona?.id}
            currentImages={referenceImages}
            onImagesChange={setReferenceImages}
          />

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Display name *</Label>
            <Input
              id="name"
              name="name"
              placeholder="Riley"
              defaultValue={persona?.name ?? ""}
              onChange={handleNameChange}
              required
            />
            <p className="text-xs text-muted-foreground">
              The name shown when this persona is rendered
            </p>
          </div>

          {/* Handle */}
          <div className="space-y-2">
            <Label htmlFor="handle">Handle *</Label>
            <div className="flex items-center gap-0">
              <span className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded-l-md border border-r-0 border-input">
                @
              </span>
              <Input
                id="handle"
                value={handle}
                onChange={handleHandleChange}
                placeholder="riley"
                className="rounded-l-none"
              />
            </div>
            {handleTouched && (
              <p
                className={`text-xs ${
                  handleStatus === "available"
                    ? "text-green-600"
                    : handleStatus === "taken" || handleStatus === "invalid"
                    ? "text-red-500"
                    : "text-muted-foreground"
                }`}
              >
                {handleStatus === "checking" && "Checking..."}
                {handleStatus === "available" && "Available"}
                {handleStatus === "taken" && "Already taken"}
                {handleStatus === "invalid" &&
                  "Only lowercase letters, numbers, and underscores (min 2 chars)"}
              </p>
            )}
          </div>

          {/* Context */}
          <div className="space-y-2">
            <Label htmlFor="context">Context hint</Label>
            <Input
              id="context"
              name="context"
              placeholder="founder of the hackathon"
              defaultValue={persona?.context ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              Brief context about this person (helps the AI understand their
              role)
            </p>
          </div>

          {/* Style */}
          <div className="space-y-2">
            <Label htmlFor="style">Rendering style</Label>
            <Input
              id="style"
              name="style"
              placeholder="friendly illustrated style"
              defaultValue={persona?.style ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              How the AI should render this person (e.g., &quot;cartoon style&quot;,
              &quot;professional portrait&quot;)
            </p>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3">
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending
                ? isEditing
                  ? "Saving..."
                  : "Creating..."
                : isEditing
                ? "Save changes"
                : "Create persona"}
            </Button>
            {isEditing && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isPending}
              >
                Delete
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
