'use client';
import { createContext, useContext, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { RsvpCelebration } from './rsvp-celebration';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
interface Community { slug: string; name: string }
const Context = createContext<{ community: Community | null; eventSlug: string; join: boolean; setJoin: (value: boolean) => void }>({ community: null, eventSlug: '', join: false, setJoin: () => {} });
export function CommunityRsvpProvider({ children, community, eventSlug, initiallyJoin = false }: { children: React.ReactNode; community: Community | null; eventSlug: string; initiallyJoin?: boolean }) {
  const [join,setJoin] = useState(initiallyJoin && !!community);
  return <Context.Provider value={{community,eventSlug,join,setJoin}}>{children}</Context.Provider>;
}
export function useCommunityRsvp() { return useContext(Context); }
export function CommunityRsvpChoice({ id = 'also-join-community' }: { id?: string }) {
  const { community,join,setJoin }=useCommunityRsvp();
  const t=useTranslations('tribes');
  if (!community) return null;
  return <div className="flex items-start gap-3 rounded-lg border p-3">
    <Checkbox id={id} checked={join} onCheckedChange={v=>setJoin(v===true)} />
    <Label htmlFor={id} className="text-sm leading-relaxed cursor-pointer">{t('alsoJoin',{name:community.name})}</Label>
  </div>;
}
export function CommunityActionNotice({ status, community }: { status?: string; community?: Community }) {
  const t=useTranslations('tribes');
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (community && status === 'joined' && url.searchParams.get('communityStatus') === 'joined') {
      url.searchParams.delete('communityStatus');
      window.history.replaceState(window.history.state, '', url);
      setCelebrate(true);
    }
  }, [status, community]);
  const keys: Record<string,string>={joined:'joinSuccess',requested:'pendingRequest',failed:'rsvpJoinFailed'};
  if (!status || !keys[status]) return null;
  return <>{celebrate && community && <RsvpCelebration kind="community" eventUrl={`${window.location.origin}/communities/${community.slug}`} eventTitle={community.name} eventDescription={null} startsAt="" onComplete={() => setCelebrate(false)} />}<p role="status" className="rounded-lg border p-4 text-sm">{t(keys[status])}</p></>;
}
