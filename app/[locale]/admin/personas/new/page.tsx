import { PersonaForm } from "@/components/admin/persona-form";

export default function NewPersonaPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Add Persona</h1>
        <p className="text-muted-foreground">
          Create a new @mention persona for AI image generation
        </p>
      </div>
      <PersonaForm />
    </div>
  );
}
