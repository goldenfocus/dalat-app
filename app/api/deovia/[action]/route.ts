import { cookies } from 'next/headers';
import { internal, sync } from '@/lib/deovia/internal';
import { enabled } from '@/lib/deovia/server';
import { reply } from '@/lib/deovia/http';
import { confirm } from '@/lib/deovia/flow';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ action: string }> }) {
  if ((await params).action !== 'status') return reply({ error: 'Not found' }, 404);
  return reply({ available: enabled(), enabled: enabled() && !(await cookies()).has('__Host-deovia_checked') });
}
export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (action === 'sync') return sync(request);
  if (action === 'confirm') return confirm(request);
  return internal(request, action);
}
