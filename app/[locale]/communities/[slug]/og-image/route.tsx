/* eslint-disable @next/next/no-img-element -- ImageResponse requires raw images. */
import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createStaticClient } from '@/lib/supabase/server';
import { communityPreviewImages, isUpcomingGathering } from '@/lib/communities/share-preview';
import { buildCollageSourceUrl } from '@/lib/events/share-preview';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = createStaticClient();
  const { data: community } = db ? await db.from('tribes').select('id,name,cover_image_url,settings').eq('slug',slug).eq('is_listed',true).in('access_type',['public','request']).maybeSingle() : { data: null };
  if (!community || !db) return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
  const { data: events } = await db.from('events').select('title,image_url,starts_at,ends_at').eq('tribe_id',community.id).eq('status','published').eq('tribe_visibility','public').gte('starts_at',new Date(Date.now()-86400000).toISOString()).order('starts_at').limit(20);
  const next = events?.find(e=>isUpcomingGathering(e));
  const sources = communityPreviewImages(community.cover_image_url,next?.image_url,community.settings?.featured_photo_url);
  const images = await Promise.all(sources.map(async src => {
    if (src.startsWith('/images/communities/')) {
      try { return `data:image/png;base64,${(await readFile(join(process.cwd(),'public',src))).toString('base64')}`; }
      catch { return null; }
    }
    return buildCollageSourceUrl(src,1200,630);
  }));
  const valid = images.flatMap((image,index) => image ? [{ image, source: sources[index] }] : []);
  const hero = valid[0]; const secondary = valid.slice(1);
  const response = new ImageResponse(<div style={{width:'100%',height:'100%',display:'flex',background:'#18352e',color:'white'}}>
    <div style={{display:'flex',position:'relative',width:secondary.length?800:1200,height:630}}>
      {hero && <img src={hero.image} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />}
      <div style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',display:'flex',flexDirection:'column',justifyContent:'space-between',padding:44,background:'linear-gradient(180deg,rgba(0,0,0,0.15),rgba(0,0,0,0.08) 35%,rgba(0,0,0,0.8))'}}>
        <div style={{fontSize:24}}>DaLat.app · Communities</div>
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <div style={{fontSize:58,fontWeight:700,lineHeight:1.08}}>{community.name.slice(0,85)}</div>
          <div style={{fontSize:26}}>Meet here. Stay connected.</div>
        </div>
      </div>
    </div>
    {secondary.length>0 && <div style={{width:400,height:630,display:'flex',flexDirection:'column'}}>
      {secondary.map(({ image, source },index)=><div key={index} style={{display:'flex',position:'relative',height:630/secondary.length,borderLeft:'6px solid #18352e',borderBottom:index===0&&secondary.length>1?'6px solid #18352e':undefined}}>
        <img src={image} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
        {source===next?.image_url && <div style={{display:'flex',position:'absolute',bottom:0,left:0,right:0,background:'rgba(0,0,0,0.75)',fontSize:24,padding:18}}>{next.title.slice(0,85)}</div>}
      </div>)}
    </div>}
  </div>,{width:1200,height:630});
  response.headers.set('Cache-Control','public, max-age=0, s-maxage=300');
  return response;
}
