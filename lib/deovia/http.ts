import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { origin } from './server';
export function privateResponse(response: NextResponse) {
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}
export function reply(body: unknown, status = 200) { return privateResponse(NextResponse.json(body, { status })); }
export function redirect(path: string) { return privateResponse(NextResponse.redirect(new URL(path, origin))); }
export function sameOrigin(request: Request) { return request.headers.get('origin') === origin; }
export async function setCookie(name: string, value: string, maxAge = 600) {
  (await cookies()).set(name, value, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge });
}
export async function limitedBody(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get('content-length') || 0) > 8192) throw new Error('Too large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  let size = 0; const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8192) { await reader.cancel(); throw new Error('Too large'); }
    chunks.push(value);
  }
  const raw = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid body');
  return raw as Record<string, unknown>;
}
