/**
 * Type definitions for the Pro Photographer bulk upload feature
 */

export type FileUploadStatus =
  | 'queued'      // In queue, not yet started
  | 'hashing'     // Computing file hash for duplicate detection
  | 'validating'  // Checking file type/size
  | 'converting'  // Converting HEIC/MOV to web format
  | 'uploading'   // Uploading to Supabase storage
  | 'uploaded'    // In storage, pending database insert
  | 'saving'      // Being saved to database in batch
  | 'complete'    // Fully done
  | 'skipped'     // Skipped as duplicate
  | 'error'       // Failed with error
  | 'retrying';   // Retry in progress

export type FileMediaType = 'photo' | 'video';

export interface FileUploadState {
  id: string;                   // Client-generated UUID
  file: File;                   // Original File object
  name: string;                 // filename.jpg
  size: number;                 // bytes
  type: FileMediaType;          // Determined from MIME
  status: FileUploadStatus;
  progress: number;             // 0-100 for upload progress
  previewUrl: string | null;    // Object URL for thumbnail
  mediaUrl: string | null;      // Supabase storage URL after upload
  thumbnailUrl: string | null;  // Video thumbnail URL (Supabase Storage)
  cfVideoUid: string | null;    // Cloudflare Stream video UID
  cfPlaybackUrl: string | null; // Cloudflare HLS playback URL
  videoStatus: string | null;   // Video encoding status
  momentId: string | null;      // Database ID after save
  error: string | null;         // Error message if failed
  retryCount: number;           // Number of retry attempts
  caption: string | null;       // Optional caption
  batchId: string;              // Groups files from same session
  fileHash: string | null;      // SHA-256 hash for duplicate detection
}

export interface BulkUploadStats {
  total: number;
  queued: number;
  hashing: number;
  converting: number;
  uploading: number;
  uploaded: number;
  saving: number;
  complete: number;
  skipped: number;
  failed: number;
}

export interface BulkUploadState {
  batchId: string;
  eventId: string;
  userId: string;
  files: Map<string, FileUploadState>;
  status: 'idle' | 'uploading' | 'paused' | 'complete' | 'error';
  concurrency: number;          // How many parallel uploads (default 5)
  stats: BulkUploadStats;
}

export type BulkUploadAction =
  | { type: 'ADD_FILES'; files: File[] }
  | { type: 'REMOVE_FILE'; id: string }
  | { type: 'UPDATE_FILE'; id: string; updates: Partial<FileUploadState> }
  | { type: 'START_UPLOAD' }
  | { type: 'PAUSE_UPLOAD' }
  | { type: 'RESUME_UPLOAD' }
  | { type: 'RETRY_FILE'; id: string }
  | { type: 'RETRY_ALL_FAILED' }
  | { type: 'SET_CAPTION'; id: string; caption: string }
  | { type: 'SET_BATCH_CAPTION'; ids: string[]; caption: string }
  | { type: 'CLEAR_COMPLETE' }
  | { type: 'MARK_FILES_SAVING'; ids: string[] }
  | { type: 'MARK_FILES_COMPLETE'; ids: string[]; momentIds: string[] }
  | { type: 'MARK_FILES_ERROR'; ids: string[]; error: string }
  | { type: 'MARK_FILES_SKIPPED'; ids: string[] }
  | { type: 'RESET' };

// Response from create_moments_batch RPC
export interface CreateMomentsBatchResponse {
  ok: boolean;
  count: number;
  moment_ids: string[];
  status: string;
}

// Batch data format for database insert
export interface MomentBatchItem {
  content_type: FileMediaType;
  media_url: string;
  text_content: string | null;
  batch_id: string;
  thumbnail_url?: string;      // Client-generated video thumbnail
  cf_video_uid?: string;       // Cloudflare Stream video UID
  cf_playback_url?: string;    // Cloudflare HLS playback URL
  video_status?: string;       // 'uploading' | 'processing' | 'ready'
  file_hash?: string;          // SHA-256 hash for duplicate detection
}
