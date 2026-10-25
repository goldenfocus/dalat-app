export type UploadPhase = 'queued' | 'preparing' | 'uploading' | 'finishing' | 'processing' | 'published' | 'pending' | 'paused' | 'error' | 'duplicate';

// Deliberately contains no File/Blob: a 150-item snapshot must stay small.
export interface UploadJob {
  id: string;
  batchId: string;
  userId: string;
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  locale: string;
  name: string;
  size: number;
  mime: string;
  isVideo: boolean;
  createdAt: number;
  lastModified?: number;
  phase: UploadPhase;
  progress: number;
  durable: boolean;
  prepared?: boolean;
  hash?: string;
  capturedAt?: string | null;
  remoteId?: string;
  momentId?: string;
  uploadUrl?: string;
  attempts?: number;
  error?: string;
  previewUrl?: string;
}

export interface UploadReceipt {
  id: string;
  status: 'waiting' | 'processing' | 'published' | 'pending' | 'error';
  momentId?: string;
  uploadUrl?: string;
  duplicate?: boolean;
  error?: string;
  previewUrl?: string;
}

export const isFinished = (phase: UploadPhase) =>
  ['published', 'pending', 'processing', 'duplicate'].includes(phase);
export const isWorking = (phase: UploadPhase) =>
  ['queued', 'preparing', 'uploading', 'finishing'].includes(phase);

const TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
};
export function mediaMime(name: string, mime: string): string | null {
  if (Object.values(TYPES).includes(mime)) return mime;
  return TYPES[name.split('.').pop()?.toLowerCase() || ''] || null;
}

export function mediaError(name: string, size: number, mime: string): string | null {
  const type = mediaMime(name, mime);
  if (!type) return 'unsupported';
  if (size <= 0) return 'empty';
  if (size > (type.startsWith('video/') ? 500 : 50) * 1024 * 1024) return 'size';
  return null;
}
