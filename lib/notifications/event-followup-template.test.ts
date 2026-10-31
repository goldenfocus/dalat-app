// @vitest-environment node
import {describe,expect,it} from 'vitest';
import {buildEventFollowup,type FollowupEvent} from './event-followup-template';
import {locales} from '@/lib/i18n/locales';
const event:FollowupEvent={id:'event',title:'Language Exchange <script>alert(1)</script>',slug:'language-exchange',series_id:'series',starts_at:'2026-11-04T11:00:00Z',ends_at:'2026-11-04T13:00:00Z'};
describe('attendee email content',()=>{
 it('has the event, album, EZViet, upload and next-event links with safe content',async()=>{
  const mail=await buildEventFollowup(event,'en',[{title:'Next <session>',slug:'next-exchange',starts_at:'2026-11-11T11:00:00Z'}],'https://dalat.app/unsubscribe');
  expect(mail.html).not.toContain('<script>');expect(mail.html).toContain('&lt;script&gt;');
  for(const url of ['https://dalat.app/events/language-exchange','https://dalat.app/events/language-exchange/moments','https://dalat.app/events/language-exchange/moments/new','https://ezviet.org/meet','https://dalat.app/events/next-exchange'])expect(mail.html).toContain(url);
  expect(mail.text).toContain('6:00');expect(mail.text).not.toContain('you learned');expect(mail.html).toContain('lang="en"');
 });
 it.each(locales)('renders %s without missing translations and keeps URLs localized',async(locale)=>{
  const mail=await buildEventFollowup({...event,title:'Language Exchange'},locale,[],'https://dalat.app/unsubscribe');
  expect(mail.subject).not.toContain('eventFollowupEmail.');expect(mail.html).toContain(`lang="${locale}"`);
  expect(mail.html).toContain(`https://dalat.app${locale==='en'?'':`/${locale}`}/events/language-exchange/moments/new`);
  expect(mail.html).not.toContain('Join us again');
 });
});
