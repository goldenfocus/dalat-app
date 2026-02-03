export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col">
      <div className="flex-1 container max-w-4xl mx-auto px-4 py-8">
        {children}
      </div>
    </main>
  );
}
