import {renderHook,act,cleanup} from '@testing-library/react';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {useShare} from './use-share';
vi.mock('@/lib/haptics',()=>({triggerHaptic:vi.fn()}));
afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe('share clipboard feedback',()=>{
 it('confirms a successful copy',async()=>{
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:vi.fn().mockResolvedValue(undefined)}});
  const {result}=renderHook(()=>useShare());
  await act(()=>result.current.copyText('https://dalat.app/de/social-house-dalat'));
  expect(result.current.copied).toBe(true);
 });
 it('never claims success when both clipboard paths fail',async()=>{
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:vi.fn().mockRejectedValue(new Error('denied'))}});
  Object.defineProperty(document,'execCommand',{configurable:true,value:vi.fn().mockReturnValue(false)});
  vi.spyOn(console,'error').mockImplementation(()=>{});
  const {result}=renderHook(()=>useShare());
  await act(()=>result.current.copyText('https://dalat.app/de/social-house-dalat'));
  expect(result.current.copied).toBe(false);
  expect(document.querySelector('textarea')).toBeNull();
 });
});
