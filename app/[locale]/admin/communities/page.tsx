import {notFound} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';
import {createClient as createAdmin} from '@supabase/supabase-js';
import {Link} from '@/lib/i18n/routing';
export default async function AdminCommunities() {
 const db=await createClient();const {data:allowed}=await db.rpc('is_admin');if(!allowed)notFound();
 const admin=createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
 const {data:communities}=await admin.from('tribes').select('id,name,slug,member_count').order('created_at',{ascending:false}).limit(100);
 const t=await getTranslations('tribes');
 return <div className="space-y-6"><h1 className="text-2xl font-semibold">{t('insights')}</h1><div className="grid gap-3 sm:grid-cols-2">{communities?.map(c=><Link key={c.id} href={`/communities/${c.slug}/insights`} className="rounded-xl border p-5 hover:bg-muted"><h2 className="font-medium">{c.name}</h2><p className="text-sm text-muted-foreground">{c.member_count} {t('members')}</p></Link>)}</div></div>;
}
