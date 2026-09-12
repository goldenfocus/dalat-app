'use client';
export type CommunityVisit = { id: string; at: number; source: string; campaign?: string };
const key = (slug: string) => `community-visit:${slug}`;
function optedOut() { return navigator.doNotTrack === '1' || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl; }
export function currentCommunityVisit(slug: string): CommunityVisit | null {
  if (typeof window === 'undefined' || optedOut()) return null;
  try { const v=JSON.parse(sessionStorage.getItem(key(slug)) || 'null'); return v && Date.now()-v.at<1800000 ? v : null; } catch { return null; }
}
export async function trackCommunityActivity(slug: string, kind: 'view'|'event_click'|'join_click'|'share_click') {
  if (optedOut()) return;
  let visit=currentCommunityVisit(slug);
  if (!visit) {
    const params=new URLSearchParams(window.location.search);
    let source=params.get('utm_source') || 'direct';
    if (source==='direct' && document.referrer) { try { const host=new URL(document.referrer).hostname; if (host!==window.location.hostname) source=host.includes('facebook')?'facebook':host.includes('whatsapp')?'whatsapp':'other'; } catch {} }
    visit={id:crypto.randomUUID(),at:Date.now(),source,campaign:params.get('utm_campaign') || undefined};
    try { sessionStorage.setItem(key(slug),JSON.stringify(visit)); } catch {}
  }
  await fetch(`/api/communities/${encodeURIComponent(slug)}/activity`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...visit,kind}),keepalive:true}).catch(()=>{});
}
