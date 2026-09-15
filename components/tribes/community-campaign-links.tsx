'use client';
import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {Button} from '@/components/ui/button';
export function CommunityCampaignLinks({path}:{path:string}) {
 const t=useTranslations('tribes');const [copied,setCopied]=useState('');
 return <div className="flex flex-wrap gap-2">{['WhatsApp','Facebook','Instagram','LinkedIn'].map(source=><Button key={source} variant="outline" size="sm" onClick={async()=>{const url=new URL(path,window.location.origin);url.searchParams.set('utm_source',source.toLowerCase());url.searchParams.set('utm_campaign','community');try{await navigator.clipboard.writeText(url.toString());setCopied(source);}catch{setCopied('');}}}>{copied===source?t('copied'):source}</Button>)}</div>;
}
