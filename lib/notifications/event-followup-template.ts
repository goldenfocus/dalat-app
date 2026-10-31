import { createTranslator } from 'next-intl';
import { locales } from '@/lib/i18n/locales';
import type { Locale } from '@/lib/i18n/routing';

export interface FollowupEvent { id: string; title: string; slug: string; starts_at: string; ends_at: string | null; series_id: string }
export interface NextFollowupEvent { title: string; slug: string; starts_at: string }
const escape = (text: string) => text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function followupLocale(value: string | null | undefined): Locale {
  return locales.includes(value as Locale) ? value as Locale : 'en';
}

export async function buildEventFollowup(event: FollowupEvent, locale: Locale, upcoming: NextFollowupEvent[], unsubscribeUrl: string) {
  const messages = (await import(`@/messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages, namespace: 'eventFollowupEmail', onError(error) { throw error; } });
  const eventLabel = `${event.title} · ${new Intl.DateTimeFormat(locale,{dateStyle:'long',timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(event.starts_at))}`;
  const prefix = locale === 'en' ? '' : `/${locale}`;
  const eventUrl = `https://dalat.app${prefix}/events/${encodeURIComponent(event.slug)}`;
  const albumUrl = `${eventUrl}/moments`;
  const uploadUrl = `${albumUrl}/new`;
  const practiceUrl = 'https://ezviet.org/meet';
  const link = (url:string,label:string,primary=false) => `<a href="${escape(url)}" style="display:inline-block;margin:6px 8px 6px 0;padding:12px 18px;border-radius:8px;${primary?'background:#255c4e;color:#fff;':'background:#f1f4f2;color:#255c4e;'}text-decoration:none;font-weight:600">${escape(label)}</a>`;
  // These are review prompts from EZViet's conversation guide, not claims of individual learning.
  const phrases = ['Chào bạn, mình tên là ___. Bạn tên là gì? — Hi, my name is ___. What’s your name?',
    'Bạn nói lại chậm một chút nhé. — Please say that again, slowly.'];
  const next = upcoming.slice(0,2).map(e => ({...e,date:new Intl.DateTimeFormat(locale,{dateStyle:'full',timeStyle:'short',timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(e.starts_at)),url:`https://dalat.app${prefix}/events/${encodeURIComponent(e.slug)}`}));
  const text = [t('heading'),t('intro',{eventTitle:eventLabel}),`${t('eventLink')}: ${eventUrl}`,`${t('albumLink')}: ${albumUrl}`,
    t('practiceHeading'),t('practiceBody'),...phrases,`${t('practiceLink')}: ${practiceUrl}`,t('uploadHeading'),t('uploadBody'),`${t('uploadLink')}: ${uploadUrl}`,
    ...(next.length?[t('nextHeading'),...next.map(e=>`${e.title} — ${e.date}\n${t('rsvpLink')}: ${e.url}`)]:[]),t('signoff'),`${t('unsubscribe')}: ${unsubscribeUrl}`].join('\n\n');
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f6f5f2;color:#292d29;font-family:Arial,sans-serif"><main style="max-width:560px;margin:24px auto;background:white;padding:28px;border-radius:16px;line-height:1.65"><p style="font-size:14px;color:#255c4e">ĐàLạt.app · Social House</p><h1 style="font-size:26px;line-height:1.25">${escape(t('heading'))}</h1><p>${escape(t('intro',{eventTitle:eventLabel}))}</p>${link(eventUrl,t('eventLink'))}${link(albumUrl,t('albumLink'))}<h2 style="font-size:20px">${escape(t('practiceHeading'))}</h2><p>${escape(t('practiceBody'))}</p>${phrases.map(p=>`<p style="padding:12px;background:#f6f5f2">${escape(p)}</p>`).join('')}${link(practiceUrl,t('practiceLink'))}<h2 style="font-size:20px">${escape(t('uploadHeading'))}</h2><p>${escape(t('uploadBody'))}</p>${link(uploadUrl,t('uploadLink'),true)}${next.length?`<h2 style="font-size:20px">${escape(t('nextHeading'))}</h2>${next.map(e=>`<p><strong>${escape(e.title)}</strong><br>${escape(e.date)}<br>${link(e.url,t('rsvpLink'))}</p>`).join('')}`:''}<p>${escape(t('signoff'))}</p><footer style="border-top:1px solid #eee;padding-top:16px;font-size:12px"><a href="${escape(unsubscribeUrl)}">${escape(t('unsubscribe'))}</a></footer></main></body></html>`;
  return {subject:t('subject',{eventTitle:eventLabel}).replace(/[\r\n]/g,' '),html,text};
}
