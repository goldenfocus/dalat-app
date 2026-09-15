'use client';
import {useEffect} from 'react';
import {trackCommunityActivity} from '@/lib/communities/activity';
export function CommunityActivity({slug}:{slug:string}) {
 useEffect(()=>{
  void trackCommunityActivity(slug,'view');
  const click=(event:MouseEvent)=>{const anchor=(event.target as Element).closest('a');if(anchor?.getAttribute('href')?.includes('/events/'))void trackCommunityActivity(slug,'event_click');};
  document.addEventListener('click',click);return()=>document.removeEventListener('click',click);
 },[slug]);return null;
}
