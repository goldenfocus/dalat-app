import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PersonaForm } from "@/components/admin/persona-form";
import type { Persona } from "@/lib/types";

interface EditPersonaPageProps {
  params: Promise<{ id: string }>;
}

async function getPersona(id: string): Promise<Persona | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("personas")
    .select("*")
    .eq("id", id)
    .single();
  return data;
}

export default async function EditPersonaPage({ params }: EditPersonaPageProps) {
  const { id } = await params;
  const persona = await getPersona(id);

  if (!persona) {
    notFound();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Edit Persona</h1>
        <p className="text-muted-foreground">
          Update @{persona.handle} persona
        </p>
      </div>
      <PersonaForm persona={persona} />
    </div>
  );
}
