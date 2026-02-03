import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import * as path from 'path';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    protocol.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        downloadFile(response.headers.location!, destPath).then(resolve).catch(reject);
        return;
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
  });
}

function getVideoCreationDate(filePath: string): string | null {
  try {
    const output = execFileSync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      filePath
    ], { encoding: 'utf8' });

    const data = JSON.parse(output);
    const tags = data.format?.tags || {};
    const dateStr = tags.creation_time || tags.date || tags['com.apple.quicktime.creationdate'];
    if (dateStr) {
      const date = new Date(dateStr);
      if (date.getTime() && !Number.isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
    return null;
  } catch {
    return null;
  }
}

function getImageCreationDate(filePath: string): string | null {
  try {
    // Use exiftool to get DateTimeOriginal (when photo was taken)
    const output = execFileSync('exiftool', [
      '-DateTimeOriginal',
      '-CreateDate',
      '-ModifyDate',
      '-j',
      filePath
    ], { encoding: 'utf8' });

    const data = JSON.parse(output);
    if (data && data[0]) {
      // Try DateTimeOriginal first (most accurate), then CreateDate, then ModifyDate
      const dateStr = data[0].DateTimeOriginal || data[0].CreateDate || data[0].ModifyDate;
      if (dateStr) {
        // EXIF dates are in format "YYYY:MM:DD HH:MM:SS"
        const normalized = dateStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
        const date = new Date(normalized);
        if (date.getTime() && !Number.isNaN(date.getTime())) {
          return date.toISOString();
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function backfill() {
  const contentType = process.argv[2] || 'all'; // 'video', 'photo', or 'all'

  const tmpDir = '/tmp/media-meta';
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  let updated = 0;
  let noMeta = 0;

  // Process videos
  if (contentType === 'video' || contentType === 'all') {
    const { data: videos, error } = await supabase
      .from('moments')
      .select('id, media_url')
      .eq('content_type', 'video')
      .is('captured_at', null)
      .not('media_url', 'is', null);

    if (error) { console.error('Error:', error); return; }
    console.log('Videos to process:', videos?.length || 0);

    for (const video of videos || []) {
      const ext = video.media_url.split('.').pop()?.toLowerCase() || 'mp4';
      const filePath = path.join(tmpDir, `${video.id}.${ext}`);
      try {
        process.stdout.write(`[V ${updated + noMeta + 1}/${videos!.length}] ${video.id.substring(0, 8)}... `);
        await downloadFile(video.media_url, filePath);
        const capturedAt = getVideoCreationDate(filePath);
        if (capturedAt) {
          await supabase.from('moments').update({ captured_at: capturedAt }).eq('id', video.id);
          console.log(`-> ${capturedAt.substring(0, 19)}`);
          updated++;
        } else {
          console.log('-> no metadata');
          noMeta++;
        }
        fs.unlinkSync(filePath);
      } catch (err) {
        console.log(`-> error: ${err instanceof Error ? err.message : err}`);
        noMeta++;
        try { fs.unlinkSync(filePath); } catch {}
      }
    }
  }

  // Process photos
  if (contentType === 'photo' || contentType === 'all') {
    const { data: photos, error } = await supabase
      .from('moments')
      .select('id, media_url')
      .eq('content_type', 'photo')
      .is('captured_at', null)
      .not('media_url', 'is', null);

    if (error) { console.error('Error:', error); return; }
    console.log('Photos to process:', photos?.length || 0);

    for (const photo of photos || []) {
      const ext = photo.media_url.split('.').pop()?.toLowerCase() || 'jpg';
      const filePath = path.join(tmpDir, `${photo.id}.${ext}`);
      try {
        process.stdout.write(`[P ${updated + noMeta + 1}] ${photo.id.substring(0, 8)}... `);
        await downloadFile(photo.media_url, filePath);
        const capturedAt = getImageCreationDate(filePath);
        if (capturedAt) {
          await supabase.from('moments').update({ captured_at: capturedAt }).eq('id', photo.id);
          console.log(`-> ${capturedAt.substring(0, 19)}`);
          updated++;
        } else {
          console.log('-> no metadata');
          noMeta++;
        }
        fs.unlinkSync(filePath);
      } catch (err) {
        console.log(`-> error: ${err instanceof Error ? err.message : err}`);
        noMeta++;
        try { fs.unlinkSync(filePath); } catch {}
      }
    }
  }

  console.log(`\nDone! Updated: ${updated}, No metadata: ${noMeta}`);
}

backfill();
