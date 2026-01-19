import { Link } from "@/lib/i18n/routing";
import { Plus, User, ImageIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import type { Persona } from "@/lib/types";

async function getPersonas(): Promise<Persona[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("personas")
    .select("*")
    .order("name");
  return data ?? [];
}

export default async function PersonasPage() {
  const personas = await getPersonas();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI Personas</h1>
          <p className="text-muted-foreground">
            Manage @mention personas for AI image generation
          </p>
        </div>
        <Link href="/admin/personas/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Persona
          </Button>
        </Link>
      </div>

      {personas.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center">
          <User className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">No personas yet</h2>
          <p className="text-muted-foreground mb-4">
            Add personas so you can use @mentions in AI image generation.
          </p>
          <Link href="/admin/personas/new">
            <Button>Add Persona</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {personas.map((persona) => (
            <Link
              key={persona.id}
              href={`/admin/personas/${persona.id}/edit`}
              className="group rounded-lg border bg-card p-4 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start gap-4">
                {/* Reference image preview */}
                <div className="shrink-0 w-16 h-16 rounded-lg bg-muted overflow-hidden">
                  {persona.reference_images?.[0] ? (
                    <img
                      src={persona.reference_images[0]}
                      alt={persona.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <User className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{persona.name}</h3>
                  <p className="text-sm text-primary font-mono">
                    @{persona.handle}
                  </p>
                  {persona.context && (
                    <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                      {persona.context}
                    </p>
                  )}
                </div>
              </div>

              {/* Reference images count */}
              <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                <ImageIcon className="w-3 h-3" />
                <span>
                  {persona.reference_images?.length || 0} reference{" "}
                  {persona.reference_images?.length === 1 ? "image" : "images"}
                </span>
                {persona.style && (
                  <>
                    <span className="text-muted-foreground/50">·</span>
                    <span className="truncate">{persona.style}</span>
                  </>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
