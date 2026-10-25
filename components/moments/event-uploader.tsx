'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight, Check, ChevronDown, CloudUpload, FolderOpen, ImageIcon, Loader2, Pause, Play, RotateCcw, ShieldCheck, Video } from 'lucide-react';
import { Link } from '@/lib/i18n/routing';
import { ALL_ALLOWED_TYPES } from '@/lib/media-utils';
import { Button } from '@/components/ui/button';
import { clearFinished, enqueueFiles, getEmptyUploadSnapshot, getUploadSnapshot, pauseUploads, retryUploads, startUploads, subscribeUploads } from '@/lib/uploads/engine';
import { isFinished, isWorking, type UploadJob } from '@/lib/uploads/types';
import { loadFile } from '@/lib/uploads/store';
import { MomentCaptionEditor } from './moment-caption-editor';

export function useEventUploads() {
  const state = useSyncExternalStore(subscribeUploads, getUploadSnapshot, getEmptyUploadSnapshot);
  useEffect(() => { void startUploads().catch(() => {}); }, []);
  return state;
}

function UploadRow({ job }: { job: UploadJob }) {
  const t = useTranslations('moments.uploader');
  const Icon = job.isVideo ? Video : ImageIcon;
  const [localPreview, setLocalPreview] = useState<string>();
  useEffect(() => {
    if (job.isVideo || job.previewUrl || !job.durable || job.mime.includes('hei')) return;
    let alive = true;
    let url: string | undefined;
    void loadFile(job.id).then(file => {
      if (!file || !alive) return;
      url = URL.createObjectURL(file); setLocalPreview(url);
    }).catch(() => {});
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [job.id, job.isVideo, job.previewUrl, job.durable, job.mime]);
  const preview = job.previewUrl || localPreview;
  const done = isFinished(job.phase);
  const errorKey = job.error === 'storage' ? 'storageError' : job.error === 'missing-file' ? 'missingFile' : job.error === 'auth' ? 'signIn' : job.error?.startsWith('file:') ? 'unsupported' : 'retryHelp';
  const contents = <>
    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">{preview ? <img src={preview} alt="" loading="lazy" decoding="async" width={48} height={48} className="h-full w-full object-cover" /> : <Icon className="h-5 w-5 text-muted-foreground" />}</div>
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium">{job.name}</p>
      <p className={`text-xs ${job.phase === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
        {job.phase === 'error' ? t(errorKey) : t(`status.${job.phase}`)}
        {job.phase === 'uploading' && ` · ${job.progress}%`}
      </p>
      {job.phase === 'uploading' && <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${job.progress}%` }} /></div>}
    </div>
    {done ? <Check className="h-4 w-4 shrink-0 text-primary" /> : isWorking(job.phase) ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" /> : null}
  </>;
  return job.momentId ? <div>{job.phase === 'pending' ? <div className="flex min-h-16 items-center gap-3 px-2 py-2">{contents}</div> : <Link href={`/events/${job.eventSlug}/moments/${job.momentId}`} className="flex min-h-16 items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted/50">{contents}</Link>}<div className="pl-16"><MomentCaptionEditor momentId={job.momentId} /></div></div> :
    <div className="flex min-h-16 items-center gap-3 px-2 py-2">{contents}</div>;
}

interface Props { eventId: string; eventSlug: string; eventTitle: string; userId: string; requiresApproval?: boolean }
export function EventUploader({ eventId, eventSlug, eventTitle, userId, requiresApproval }: Props) {
  const t = useTranslations('moments.uploader');
  const locale = useLocale();
  const state = useEventUploads();
  const input = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [drag, setDrag] = useState(false);
  const [canFolder, setCanFolder] = useState(false);
  const [legacyCount, setLegacyCount] = useState(0);
  const [recovering, setRecovering] = useState(false);
  const jobs = state.jobs.filter(job => job.eventId === eventId && job.userId === userId);
  const complete = jobs.filter(job => isFinished(job.phase)).length;
  const working = jobs.some(job => isWorking(job.phase));
  const paused = jobs.some(job => job.phase === 'paused');
  const failed = jobs.some(job => job.phase === 'error');
  const processing = jobs.filter(job => job.phase === 'processing').length;
  const persistent = jobs.every(job => job.durable);
  const saving = state.staging > 0;
  const allDone = jobs.length > 0 && complete === jobs.length && !saving;
  useEffect(() => { setCanFolder('webkitdirectory' in document.createElement('input') && !/iPhone|iPad|Android/i.test(navigator.userAgent)); }, []);
  useEffect(() => {
    let alive = true;
    void fetch('/api/moments/uploads/legacy', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId }) }).then(async response => {
        if (response.ok && alive) setLegacyCount((await response.json()).count || 0);
      }).catch(() => {});
    return () => { alive = false; };
  }, [eventId]);
  const recover = async () => {
    setRecovering(true); setError('');
    try {
      const response = await fetch('/api/moments/uploads/legacy', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, publish: true }) });
      if (!response.ok) throw new Error('recover');
      setLegacyCount(0);
      window.dispatchEvent(new CustomEvent('dalat:moment-added', { detail: { eventId } }));
    } catch { setError(t('startError')); }
    finally { setRecovering(false); }
  };

  const add = (files: File[]) => {
    if (!files.length) return;
    setError('');
    void enqueueFiles(files, { eventId, eventSlug, eventTitle, userId, locale }).catch(() => setError(t('startError')));
  };
  return <section className="space-y-5" aria-label={t('title')}>
    <Link href={`/events/${eventSlug}/moments`} className="inline-flex items-center gap-2 py-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />{t('back')}</Link>
    <div className={`overflow-hidden rounded-3xl border bg-card transition-colors ${drag ? 'border-primary bg-primary/5' : 'border-border'}`}
      onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); add(Array.from(e.dataTransfer.files)); }}>
      <div className="space-y-5 p-6 sm:p-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><CloudUpload className="h-7 w-7" /></div>
        <div className="space-y-2"><h2 className="text-2xl font-semibold tracking-tight">{t('title')}</h2><p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{t('intro')}</p></div>
        <Button size="lg" className="h-14 w-full gap-2 text-base" onClick={() => input.current?.click()} disabled={saving}>
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
          {saving ? t('saving') : jobs.length ? t('addMore') : t('choose')}
        </Button>
        {canFolder && <button className="flex w-full items-center justify-center gap-2 py-1 text-sm text-muted-foreground hover:text-foreground" onClick={() => folder.current?.click()} disabled={saving}><FolderOpen className="h-4 w-4" />{t('folder')}</button>}
        <p className="text-center text-xs leading-relaxed text-muted-foreground">{requiresApproval ? t('approval') : t('autoShare')}</p>
      </div>
      {jobs.length > 0 && <div className="border-t bg-muted/30 p-5 sm:px-8">
        <div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="font-medium" role="status" aria-live="polite">{allDone ? t('done') : t('count', { complete, total: jobs.length })}</p><p className="mt-1 text-xs text-muted-foreground">{processing ? t('processingCount', { count: processing }) : t('captionsLater')}</p></div>{allDone && <ShieldCheck className="h-6 w-6 shrink-0 text-primary" />}</div>
        <div className="my-4 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${jobs.length ? complete / jobs.length * 100 : 0}%` }} /></div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><Link href={`/events/${eventSlug}/moments`}>{t('view')}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
          {working && <Button variant="ghost" size="sm" onClick={() => void pauseUploads(eventId)}><Pause className="mr-1.5 h-4 w-4" />{t('pause')}</Button>}
          {(paused || failed) && <Button variant="ghost" size="sm" onClick={() => void retryUploads(eventId)}>{failed ? <RotateCcw className="mr-1.5 h-4 w-4" /> : <Play className="mr-1.5 h-4 w-4" />}{failed ? t('retry') : t('resume')}</Button>}
          {allDone && !processing && <Button variant="ghost" size="sm" onClick={() => void clearFinished(eventId)}>{t('clear')}</Button>}
        </div>
      </div>}
    </div>
    {(working || paused || failed || saving) && <div className="flex gap-3 rounded-2xl border p-4 text-sm leading-relaxed">
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
      <div><p className="font-medium">{!state.online ? t('offline') : saving ? t('saving') : persistent ? t('saved') : t('storageError')}</p><p className="mt-1 text-muted-foreground">{!state.online ? t('offlineHelp') : t('backgroundHelp')}</p></div>
    </div>}
    {legacyCount > 0 && <div className="space-y-3 rounded-2xl border p-4 text-sm"><p>{t('savedDrafts', { count: legacyCount })}</p><Button variant="outline" size="sm" disabled={recovering} onClick={() => void recover()}>{recovering && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('recoverDrafts')}</Button></div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {jobs.length > 0 && <div className="rounded-2xl border bg-card p-3">
      {(showAll ? jobs : jobs.slice(-8)).map(job => <UploadRow key={job.id} job={job} />)}
      {jobs.length > 8 && <button className="flex w-full items-center justify-center gap-1 p-3 text-sm text-muted-foreground" onClick={() => setShowAll(!showAll)}>{showAll ? t('showLess') : t('showAll', { count: jobs.length })}<ChevronDown className={`h-4 w-4 ${showAll ? 'rotate-180' : ''}`} /></button>}
    </div>}
    <input ref={input} type="file" multiple accept={ALL_ALLOWED_TYPES.join(',')} className="hidden" aria-label={t('choose')}
      onChange={e => { add(Array.from(e.target.files || [])); e.target.value = ''; }} />
    <input ref={folder} type="file" multiple {...{ webkitdirectory: '' }} className="hidden" aria-label={t('folder')}
      onChange={e => { add(Array.from(e.target.files || [])); e.target.value = ''; }} />
  </section>;
}
