import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function runProcess(binary, args, { input, cwd, timeout = 600_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-8000); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (status, signal) => { clearTimeout(timer); resolve({ status, signal, stdout, stderr }); });
    child.stdin.end(input);
  });
}

/** Download the entire audio track, then transcribe locally with language detection. */
export async function transcribeMedia(sourceUrl, directory, env) {
  if (!sourceUrl || !sourceUrl.startsWith('https://')) throw new Error('Missing HTTPS audio source');
  if (!env.WHISPER_MODEL || !existsSync(env.WHISPER_MODEL)) throw new Error('WHISPER_MODEL is unavailable');
  const audio = join(directory, 'audio.wav');
  const extract = await runProcess(env.FFMPEG_BIN || '/opt/homebrew/bin/ffmpeg', ['-nostdin', '-y', '-loglevel', 'error', '-i', sourceUrl, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', audio]);
  if (extract.status !== 0) {
    if (/does not contain any stream|matches no streams/i.test(extract.stderr)) return { text: '', language: 'und' };
    throw new Error(`Audio extraction failed (${extract.status}): ${extract.stderr.slice(-400)}`);
  }
  const prefix = join(directory, 'transcript');
  const args = ['-m', env.WHISPER_MODEL, '-f', audio, '-l', 'auto', '-oj', '-of', prefix];
  if (env.WHISPER_VAD_MODEL) args.push('--vad', '-vm', env.WHISPER_VAD_MODEL);
  const result = await runProcess(env.WHISPER_BIN || '/opt/homebrew/bin/whisper-cli', args, { timeout: 1_800_000 });
  if (result.status !== 0) throw new Error(`Transcription failed (${result.status}): ${result.stderr.slice(-400)}`);
  const parsed = JSON.parse(readFileSync(`${prefix}.json`, 'utf8'));
  if (!Array.isArray(parsed.transcription)) throw new Error('Transcription output has no segments');
  const text = parsed.transcription.map((segment) => String(segment.text ?? '').trim()).filter((line) => line && !/^\[(?:BLANK_AUDIO|silence|music)\]$/i.test(line)).join(' ');
  return { text, language: parsed.result?.language || 'und' };
}
