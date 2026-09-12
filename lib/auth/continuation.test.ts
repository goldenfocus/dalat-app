import { describe, expect, it } from 'vitest';
import { safeReturnPath, localizedPath, callbackUrl } from './continuation';
describe('authentication continuation',()=>{
 it.each(['https://evil.test','//evil.test','/\\evil.test','/x\ny','javascript:alert(1)'])('rejects external or malformed destination %s',value=>expect(safeReturnPath(value)).toBe('/'));
 it('preserves action query and avoids duplicate locale prefixes',()=>{
  expect(localizedPath('/vi/communities/test?join=1','vi')).toBe('/vi/communities/test?join=1');
  expect(localizedPath('/auth/continue?intent=abc','vi')).toBe('/auth/continue?intent=abc');
  expect(localizedPath('/communities/test','vi')).toBe('/vi/communities/test');
 });
 it('carries a particular intent through OAuth without carrying an external redirect',()=>{
  const id='71000000-0000-4000-8000-000000000001';
  const url=new URL(callbackUrl('https://dalat.app',new URLSearchParams({intent:id,next:'https://evil.test'})));
  expect(url.pathname).toBe('/auth/callback');
  expect(url.searchParams.get('next')).toBe(`/auth/continue?intent=${id}`);
 });
 it('retains existing login redirect links',()=>{
  const url=new URL(callbackUrl('https://dalat.app',new URLSearchParams({redirect:'/events/a'})));
  expect(url.searchParams.get('next')).toBe('/auth/continue?next=%2Fevents%2Fa');
 });
});
