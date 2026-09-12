import {notFound,redirect} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {Users,Eye,MousePointerClick,UserPlus,Share2,UserMinus} from 'lucide-react';
import {createClient} from '@/lib/supabase/server';
import {createClient as createAdmin} from '@supabase/supabase-js';
import {Link} from '@/lib/i18n/routing';
import {StatCard} from '@/components/admin/analytics/stat-card';
import {CommunityCampaignLinks} from '@/components/tribes/community-campaign-links';
export const metadata={title:'Community insights',robots:{index:false,follow:false}};
export default async function CommunityInsights({params}:{params:Promise<{slug:string}>}) {
 const {slug}=await params;const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)redirect(`/auth/login?next=${encodeURIComponent(`/communities/${slug}/insights`)}`);
 const {data:siteAdmin}=await db.rpc('is_admin');
 const reader=siteAdmin?createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}}):db;
 const {data:community}=await reader.from('tribes').select('id,name,slug,short_slug').eq('slug',slug).maybeSingle();if(!community)notFound();
 const {data:stats,error}=await db.rpc('get_community_stats',{p_community_id:community.id,p_days:30});if(error||!stats)notFound();
 const t=await getTranslations('tribes');
 const cards=[['members',stats.members,Users],['visits',stats.visits,Eye],['eventClicks',stats.event_clicks,MousePointerClick],['joinClicks',stats.join_clicks,MousePointerClick],['joinedVisits',stats.conversions,UserPlus],['newAccounts',stats.new_accounts,UserPlus],['joins',stats.joins,UserPlus],['leaves',stats.leaves,UserMinus],['shares',stats.share_clicks,Share2],['pending',stats.pending,Users],['blocked',stats.blocked,Users]] as const;
 return <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
  <Link href={`/communities/${slug}`} className="text-sm text-muted-foreground">← {community.name}</Link>
  <div><h1 className="text-3xl font-semibold">{t('insights')}</h1><p className="text-muted-foreground mt-2">{t('statsHint')}</p></div>
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{cards.map(([key,value,Icon])=><StatCard key={key} title={t(key)} value={value} icon={<Icon className="h-5 w-5"/>}/>)}</div>
  <section className="rounded-xl border p-5 space-y-3"><h2 className="font-semibold">{t('campaignLinks')}</h2><p className="text-sm text-muted-foreground">{t('campaignHint')}</p><CommunityCampaignLinks path={community.short_slug?`/${community.short_slug}`:`/communities/${slug}`}/></section>
  <section className="rounded-xl border p-5 space-y-3"><h2 className="font-semibold">{t('sources')}</h2><div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr>{['source','campaign','visits','joins','newAccounts'].map(k=><th key={k} className="p-2">{t(k)}</th>)}</tr></thead><tbody>{stats.sources.map((row:{source:string;campaign:string|null;visits:number;joins:number;new_accounts:number})=><tr key={`${row.source}:${row.campaign}`} className="border-t"><td className="p-2">{row.source}</td><td className="p-2">{row.campaign||'—'}</td><td className="p-2">{row.visits}</td><td className="p-2">{row.joins}</td><td className="p-2">{row.new_accounts}</td></tr>)}</tbody></table></div><p className="text-xs text-muted-foreground">{t('conversionHint')}</p></section>
 </main>;
}
