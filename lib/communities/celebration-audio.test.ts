import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
beforeEach(()=>{const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});});
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
describe('celebration audio',()=>{
 it('primes silently on tap and reuses the unlocked element for success',async()=>{
 const audio={volume:1,currentTime:8,play:vi.fn().mockResolvedValue(undefined),pause:vi.fn()};
 vi.stubGlobal('Audio',vi.fn(function(){return audio;}));
 const {prepareCelebrationAudio,takeCelebrationAudio}=await import('./celebration-audio');
 prepareCelebrationAudio();expect(audio.play).toHaveBeenCalledOnce();expect(audio.volume).toBe(0);
 await Promise.resolve();expect(audio.pause).toHaveBeenCalledOnce();expect(audio.currentTime).toBe(0);
 expect(takeCelebrationAudio()).toBe(audio);expect(Audio).toHaveBeenCalledOnce();
 });
 it('does not prime when the user muted celebrations',async()=>{
 localStorage.setItem('dalat-celebration-muted','true');const ctor=vi.fn();vi.stubGlobal('Audio',ctor);
 const {prepareCelebrationAudio}=await import('./celebration-audio');prepareCelebrationAudio();expect(ctor).not.toHaveBeenCalled();
 });
});
