'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Pencil, Loader2 } from 'lucide-react';
import { useRouter } from '@/lib/i18n/routing';
import { triggerTranslation } from '@/lib/translations-client';
import { Button } from '@/components/ui/button';

export function MomentCaptionEditor({ momentId, initialCaption }: { momentId: string; initialCaption?: string | null }) {
  const t = useTranslations('moments.uploader');
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(initialCaption || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(initialCaption !== undefined);
  const edit = async () => {
    setOpen(true);
    if (loaded) return;
    setBusy(true); setError(false);
    try {
      const response = await fetch(`/api/moments/${momentId}/caption`);
      if (!response.ok) throw new Error('load');
      setText((await response.json()).text_content || ''); setLoaded(true);
    } catch { setError(true); }
    finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setError(false);
    try {
      const response = await fetch(`/api/moments/${momentId}/caption`, { method: 'PATCH',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, locale }) });
      if (!response.ok) throw new Error('save');
      await triggerTranslation('moment', momentId, [{ field_name: 'text_content', text: text.trim() }]);
      setOpen(false); router.refresh();
    } catch { setError(true); }
    finally { setBusy(false); }
  };
  if (!open) return <button className="inline-flex items-center gap-1.5 py-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => void edit()}><Pencil className="h-3.5 w-3.5" />{t('editCaption')}</button>;
  return <div data-caption-editing className="space-y-2 py-2">
    <textarea value={text} onChange={e => setText(e.target.value)} disabled={busy || !loaded} maxLength={500} rows={3}
      aria-label={t('editCaption')} placeholder={t('captionPlaceholder')} className="w-full resize-y rounded-xl border bg-background p-3 text-sm" />
    {error && <p role="alert" className="text-xs text-destructive">{t('captionError')}</p>}
    <div className="flex gap-2"><Button size="sm" onClick={() => void save()} disabled={busy || !loaded}>{busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}{t('saveCaption')}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>{t('cancel')}</Button></div>
  </div>;
}
