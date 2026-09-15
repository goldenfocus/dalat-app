import { LoginForm } from '@/components/login-form';
import { getIntentLabel } from '@/lib/auth/intent-display';
export default async function Page({ searchParams }: { searchParams: Promise<{ intent?: string }> }) {
  const label=await getIntentLabel((await searchParams).intent);
  return <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
    <div className="w-full max-w-sm space-y-6">
      {label && <p className="text-center text-2xl font-semibold">{label}</p>}
      <LoginForm />
    </div>
  </div>;
}
