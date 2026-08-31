import { NextResponse } from 'next/server';

const NO_STORE = 'private, no-store, no-cache, max-age=0, must-revalidate';

export function noStoreJson(
  body: unknown,
  init?: ResponseInit,
): NextResponse {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', NO_STORE);
  response.headers.set('CDN-Cache-Control', 'no-store');
  response.headers.set('Vercel-CDN-Cache-Control', 'no-store');
  return response;
}
