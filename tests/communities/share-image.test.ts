// @vitest-environment node
import {describe,it,expect,vi} from 'vitest';
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
vi.mock('@/lib/events/share-preview',()=>({buildCollageSourceUrl:()=>pixel}));
vi.mock('@/lib/supabase/server',()=>({createStaticClient:()=>({from:(table:string)=>{
 const q={select:()=>q,eq:()=>q,in:()=>q,gte:()=>q,order:()=>q,
 maybeSingle:async()=>({data:{id:'community',name:'Test community',cover_image_url:'https://cdn.dalat.app/cover.png',settings:{featured_photo_url:'https://cdn.dalat.app/photo.png'}}}),
 limit:async()=>({data:table==='events'?[{title:'Next gathering',image_url:'https://cdn.dalat.app/event.png',starts_at:'2040-09-17T03:00:00Z',ends_at:'2040-09-17T05:00:00Z'}]:[]})};return q;
}})}));
import {GET} from '@/app/[locale]/communities/[slug]/og-image/route';
describe('community share image',()=>{
 it('renders the complete three-image layout as a PNG',async()=>{
  const response=await GET(new Request('https://dalat.app/communities/test/og-image'),{params:Promise.resolve({slug:'test'})});
  const bytes=new Uint8Array(await response.arrayBuffer());
  expect(response.headers.get('content-type')).toContain('image/png');
  expect(Array.from(bytes.slice(0,8))).toEqual([137,80,78,71,13,10,26,10]);
 },15000);
});
