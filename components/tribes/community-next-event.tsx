import Image from 'next/image';
import { Link } from '@/lib/i18n/routing';
import { getTranslations } from 'next-intl/server';
import { Calendar, MapPin, ArrowUpRight } from 'lucide-react';
import { DALAT_TIMEZONE } from '@/lib/timezone';
export async function CommunityNextEvent({ event, locale, communitySlug }: { event: { slug: string; title: string; image_url: string | null; starts_at: string; location_name: string | null }; locale: string; communitySlug: string }) {
  const t = await getTranslations('tribes');
  const date = new Intl.DateTimeFormat(locale,{ weekday:'long',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:DALAT_TIMEZONE }).format(new Date(event.starts_at));
  return <section aria-label={t('nextGathering')} className="rounded-2xl border bg-card overflow-hidden shadow-sm">
    <Link href={`/events/${event.slug}?fromCommunity=${encodeURIComponent(communitySlug)}`} className={event.image_url ? "grid sm:grid-cols-[2fr_3fr] group" : "block group"}>
      {event.image_url && <div className="relative min-h-48 sm:min-h-64 order-last sm:order-first"><Image src={event.image_url} alt={event.title} fill sizes="(max-width: 640px) 100vw, 360px" className="object-cover" /></div>}
      <div className="p-6 sm:p-8 space-y-4">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">{t('nextGathering')}</p>
        <h2 className="text-2xl sm:text-3xl font-semibold leading-tight">{event.title}</h2>
        <p className="flex gap-2 text-sm"><Calendar className="h-4 w-4 shrink-0 mt-0.5" />{date}</p>
        {event.location_name && <p className="flex gap-2 text-sm text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" />{event.location_name}</p>}
        <span className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-primary-foreground font-medium">{t('viewEventRsvp')}<ArrowUpRight className="h-4 w-4" /></span>
      </div>
    </Link>
  </section>;
}
