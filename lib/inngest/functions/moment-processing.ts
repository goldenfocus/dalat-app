import { inngest } from '../client';
import { createClient } from '@supabase/supabase-js';
import { analyzeImage, analyzeVideo, analyzeAudio, analyzeDocument } from '@/lib/ai/content-analyzers';
import { triggerTranslationServer } from '@/lib/translations';
import type { MomentContentType, TranslationFieldName } from '@/lib/types';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface MomentCreatedEvent {
  data: {
    momentId: string;
    contentType: MomentContentType;
    mediaUrl: string | null;
    fileUrl: string | null;
    cfVideoUid: string | null;
    cfPlaybackUrl: string | null;
    mimeType: string | null;
    filename: string | null;
    title: string | null;
    artist: string | null;
    album: string | null;
    genre: string | null;
    durationSeconds: number | null;
  };
}

/**
 * Main moment processing function - triggered when a new moment is created.
 * Routes to appropriate analyzer based on content type.
 */
export const processMomentMetadata = inngest.createFunction(
  {
    id: 'process-moment-metadata',
    name: 'Process Moment Metadata',
    concurrency: { limit: 5 }, // Rate limit concurrent processing
    retries: 2,
  },
  { event: 'moment/created' },
  async ({ event, step }) => {
    const {
      momentId,
      contentType,
      mediaUrl,
      fileUrl,
      cfVideoUid,
      cfPlaybackUrl,
      mimeType,
      filename,
      title,
      artist,
      album,
      genre,
      durationSeconds,
    } = event.data as MomentCreatedEvent['data'];

    const supabase = getSupabase();
    const startTime = Date.now();

    // Set processing status
    await step.run('set-processing-status', async () => {
      await supabase.rpc('upsert_moment_metadata', {
        p_moment_id: momentId,
        p_processing_status: 'processing',
      });
    });

    try {
      let metadata: Record<string, unknown> = {};

      // Route to appropriate analyzer based on content type
      switch (contentType) {
        case 'photo':
        case 'image': {
          const imageUrl = mediaUrl || fileUrl;
          if (!imageUrl) throw new Error('No image URL provided');

          const analysis = await step.run('analyze-image', async () => {
            return analyzeImage(imageUrl);
          });

          metadata = {
            p_ai_description: analysis.ai_description,
            p_ai_title: analysis.ai_title,
            p_ai_tags: analysis.ai_tags,
            p_scene_description: analysis.scene_description,
            p_mood: analysis.mood,
            p_quality_score: analysis.quality_score,
            p_detected_objects: analysis.detected_objects,
            p_detected_text: analysis.detected_text,
            p_detected_faces_count: analysis.detected_faces_count,
            p_dominant_colors: analysis.dominant_colors,
            p_location_hints: analysis.location_hints,
            p_content_language: analysis.content_language,
          };
          break;
        }

        case 'video': {
          if (!cfPlaybackUrl || !cfVideoUid) {
            // Video not ready yet, skip for now
            await supabase.rpc('upsert_moment_metadata', {
              p_moment_id: momentId,
              p_processing_status: 'pending',
              p_processing_error: 'Video not ready for processing',
            });
            return { success: false, reason: 'Video not ready' };
          }

          const analysis = await step.run('analyze-video', async () => {
            return analyzeVideo(cfPlaybackUrl, cfVideoUid, durationSeconds || undefined);
          });

          metadata = {
            p_ai_description: analysis.ai_description,
            p_ai_title: analysis.ai_title,
            p_ai_tags: analysis.ai_tags,
            p_scene_description: analysis.scene_description,
            p_mood: analysis.mood,
            p_quality_score: analysis.quality_score,
            p_video_transcript: analysis.video_transcript,
            p_video_summary: analysis.video_summary,
            p_key_frame_urls: analysis.key_frame_urls,
            p_content_language: analysis.content_language,
          };
          break;
        }

        case 'audio': {
          const audioUrl = fileUrl || mediaUrl;
          if (!audioUrl) throw new Error('No audio URL provided');

          const analysis = await step.run('analyze-audio', async () => {
            return analyzeAudio(audioUrl, {
              title,
              artist,
              album,
              genre,
              duration_seconds: durationSeconds,
            });
          });

          metadata = {
            p_ai_description: analysis.ai_description,
            p_ai_title: analysis.ai_title,
            p_ai_tags: analysis.ai_tags,
            p_mood: analysis.mood,
            p_quality_score: analysis.quality_score,
            p_audio_transcript: analysis.audio_transcript,
            p_audio_summary: analysis.audio_summary,
            p_audio_language: analysis.audio_language,
          };
          break;
        }

        case 'pdf':
        case 'document': {
          const docUrl = fileUrl || mediaUrl;
          if (!docUrl) throw new Error('No document URL provided');

          const analysis = await step.run('analyze-document', async () => {
            return analyzeDocument(docUrl, mimeType, filename);
          });

          metadata = {
            p_ai_description: analysis.ai_description,
            p_ai_title: analysis.ai_title,
            p_ai_tags: analysis.ai_tags,
            p_quality_score: analysis.quality_score,
            p_pdf_summary: analysis.pdf_summary,
            p_pdf_extracted_text: analysis.pdf_extracted_text,
            p_pdf_page_count: analysis.pdf_page_count,
            p_pdf_key_topics: analysis.pdf_key_topics,
            p_content_language: analysis.content_language,
          };
          break;
        }

        case 'youtube': {
          // YouTube videos already have metadata, just mark as completed
          metadata = {
            p_processing_status: 'completed',
          };
          break;
        }

        case 'text': {
          // Text-only moments don't need AI processing
          metadata = {
            p_processing_status: 'skipped',
          };
          break;
        }

        default:
          throw new Error(`Unknown content type: ${contentType}`);
      }

      // Store metadata
      const durationMs = Date.now() - startTime;
      await step.run('store-metadata', async () => {
        await supabase.rpc('upsert_moment_metadata', {
          p_moment_id: momentId,
          ...metadata,
          p_processing_status: 'completed',
          p_processing_duration_ms: durationMs,
        });
      });

      // Trigger translations for AI-generated descriptions
      const aiDescription = metadata.p_ai_description as string | undefined;
      const sceneDescription = metadata.p_scene_description as string | undefined;
      const videoSummary = metadata.p_video_summary as string | undefined;
      const audioSummary = metadata.p_audio_summary as string | undefined;
      const pdfSummary = metadata.p_pdf_summary as string | undefined;

      const fieldsToTranslate: { field_name: TranslationFieldName; text: string }[] = [];

      if (aiDescription) {
        fieldsToTranslate.push({ field_name: 'ai_description', text: aiDescription });
      }
      if (sceneDescription) {
        fieldsToTranslate.push({ field_name: 'scene_description', text: sceneDescription });
      }
      if (videoSummary) {
        fieldsToTranslate.push({ field_name: 'video_summary', text: videoSummary });
      }
      if (audioSummary) {
        fieldsToTranslate.push({ field_name: 'audio_summary', text: audioSummary });
      }
      if (pdfSummary) {
        fieldsToTranslate.push({ field_name: 'pdf_summary', text: pdfSummary });
      }

      if (fieldsToTranslate.length > 0) {
        await step.run('trigger-translations', async () => {
          await triggerTranslationServer('moment', momentId, fieldsToTranslate);
        });
      }

      return {
        success: true,
        momentId,
        contentType,
        durationMs,
        fieldsTranslated: fieldsToTranslate.length,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      // Store error status
      await supabase.rpc('upsert_moment_metadata', {
        p_moment_id: momentId,
        p_processing_status: 'failed',
        p_processing_error: error instanceof Error ? error.message : String(error),
        p_processing_duration_ms: durationMs,
      });

      throw error; // Re-throw for Inngest retry
    }
  }
);

/**
 * Process video when it becomes ready (Cloudflare Stream webhook).
 * Triggered by: cloudflare/video.ready event
 */
export const processVideoWhenReady = inngest.createFunction(
  {
    id: 'process-video-when-ready',
    name: 'Process Video When Ready',
  },
  { event: 'cloudflare/video.ready' },
  async ({ event, step }) => {
    const { videoUid, playbackUrl } = event.data as {
      videoUid: string;
      playbackUrl: string;
    };

    const supabase = getSupabase();

    // Find the moment with this video UID
    const { data: moment } = await supabase
      .from('moments')
      .select('id, content_type, video_duration_seconds')
      .eq('cf_video_uid', videoUid)
      .single();

    if (!moment) {
      return { success: false, reason: 'Moment not found for video UID' };
    }

    // Check if already processed
    const { data: existingMetadata } = await supabase
      .from('moment_metadata')
      .select('processing_status')
      .eq('moment_id', moment.id)
      .single();

    if (existingMetadata?.processing_status === 'completed') {
      return { success: true, reason: 'Already processed' };
    }

    // Trigger processing
    await step.sendEvent('trigger-video-processing', {
      name: 'moment/created',
      data: {
        momentId: moment.id,
        contentType: 'video',
        mediaUrl: null,
        fileUrl: null,
        cfVideoUid: videoUid,
        cfPlaybackUrl: playbackUrl,
        mimeType: 'video/mp4',
        filename: null,
        title: null,
        artist: null,
        album: null,
        genre: null,
        durationSeconds: moment.video_duration_seconds,
      },
    });

    return { success: true, momentId: moment.id };
  }
);

/**
 * Cron job to process pending moments (failed or never processed).
 * Runs every 4 hours.
 */
export const processPendingMoments = inngest.createFunction(
  {
    id: 'process-pending-moments',
    name: 'Process Pending Moments',
  },
  { cron: '0 */4 * * *' }, // Every 4 hours
  async ({ step }) => {
    const supabase = getSupabase();

    // Find moments without metadata or with failed/pending status
    const { data: pendingMoments } = await supabase
      .from('moments')
      .select(`
        id,
        content_type,
        media_url,
        file_url,
        cf_video_uid,
        cf_playback_url,
        mime_type,
        original_filename,
        title,
        artist,
        album,
        genre,
        video_duration_seconds,
        audio_duration_seconds,
        moment_metadata!left(processing_status)
      `)
      .eq('status', 'published')
      .in('content_type', ['photo', 'video', 'image', 'audio', 'pdf', 'document'])
      .or('moment_metadata.is.null,moment_metadata.processing_status.in.(pending,failed)')
      .limit(50);

    if (!pendingMoments || pendingMoments.length === 0) {
      return { success: true, processed: 0 };
    }

    // Queue each moment for processing
    const events = pendingMoments.map((moment) => ({
      name: 'moment/created' as const,
      data: {
        momentId: moment.id,
        contentType: moment.content_type,
        mediaUrl: moment.media_url,
        fileUrl: moment.file_url,
        cfVideoUid: moment.cf_video_uid,
        cfPlaybackUrl: moment.cf_playback_url,
        mimeType: moment.mime_type,
        filename: moment.original_filename,
        title: moment.title,
        artist: moment.artist,
        album: moment.album,
        genre: moment.genre,
        durationSeconds: moment.video_duration_seconds || moment.audio_duration_seconds,
      },
    }));

    await step.sendEvent('queue-pending-moments', events);

    return {
      success: true,
      queued: events.length,
    };
  }
);

/**
 * Manual trigger to reprocess a specific moment.
 */
export const reprocessMoment = inngest.createFunction(
  {
    id: 'reprocess-moment',
    name: 'Reprocess Moment',
  },
  { event: 'moment/reprocess' },
  async ({ event, step }) => {
    const { momentId } = event.data as { momentId: string };

    const supabase = getSupabase();

    // Fetch moment details
    const { data: moment } = await supabase
      .from('moments')
      .select(`
        id,
        content_type,
        media_url,
        file_url,
        cf_video_uid,
        cf_playback_url,
        mime_type,
        original_filename,
        title,
        artist,
        album,
        genre,
        video_duration_seconds,
        audio_duration_seconds
      `)
      .eq('id', momentId)
      .single();

    if (!moment) {
      return { success: false, reason: 'Moment not found' };
    }

    // Reset metadata status
    await supabase.rpc('upsert_moment_metadata', {
      p_moment_id: momentId,
      p_processing_status: 'pending',
      p_processing_error: null,
    });

    // Trigger processing
    await step.sendEvent('trigger-reprocessing', {
      name: 'moment/created',
      data: {
        momentId: moment.id,
        contentType: moment.content_type,
        mediaUrl: moment.media_url,
        fileUrl: moment.file_url,
        cfVideoUid: moment.cf_video_uid,
        cfPlaybackUrl: moment.cf_playback_url,
        mimeType: moment.mime_type,
        filename: moment.original_filename,
        title: moment.title,
        artist: moment.artist,
        album: moment.album,
        genre: moment.genre,
        durationSeconds: moment.video_duration_seconds || moment.audio_duration_seconds,
      },
    });

    return { success: true, momentId };
  }
);
