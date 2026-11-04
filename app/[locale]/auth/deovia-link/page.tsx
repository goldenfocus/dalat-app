import { getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n/routing';
import { pendingLink } from '@/lib/deovia/flow';
import { currentIdentity } from '@/lib/deovia/server';
import { loginPath } from '@/lib/deovia/app';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const t = await getTranslations('auth');
  const pending = await pendingLink(); const identity = await currentIdentity();
  return <main className="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center gap-5 px-4 py-12">
    <h1 className="text-2xl font-bold">{t('deoviaTitle')}</h1>
    <p className="text-muted-foreground">{t('deoviaDescription')}</p>
    {!pending || !identity ? <Link className="flex min-h-11 items-center underline" href={loginPath('/auth/deovia/link')}>{t('deoviaSignIn')}</Link> : <form method="post" action="/api/deovia/confirm" className="space-y-3">
      <p className="break-all text-sm text-muted-foreground">{identity.email}</p>
      <p className="text-sm text-muted-foreground">{t('deoviaReplace')}</p>
      <input type="hidden" name="token" value={pending.token} />
      <button className="min-h-11 w-full rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground" type="submit">{t('deoviaConnect')}</button>
    </form>}
    <Link className="flex min-h-11 items-center text-muted-foreground" href={pending?.next_path || '/'}>{t('deoviaLater')}</Link>
  </main>;
}
