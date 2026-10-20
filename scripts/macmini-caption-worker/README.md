# dalat.app caption worker (Mac mini)

Claims `caption_jobs` from dalat.app and runs vision captioning with zero
pay-per-token API keys: batched headless `claude -p` (subscription, Haiku)
first, optional local ollama VLM (`OLLAMA_FALLBACK_MODEL=qwen2.5vl:7b`) as
fallback. Raw model output is validated server-side by
`/api/admin/caption-jobs/complete` — the worker never writes captions itself.

Deploy: copy this directory to the mini, run `./install.sh` (asks for
`ADMIN_API_KEY` once). Logs: `~/Library/Logs/dalat-caption-worker.log`.
Restart: `launchctl kickstart -k gui/$(id -u)/com.goldenfocus.dalat-caption-worker`.


Automatic event recaps use this same worker. The application enqueues after
media completion and reconciles every 15 minutes; it waits until the event has
ended, uploads have been quiet for 15 minutes, and every supported moment has
finished analysis. Recaps publish on the original event page automatically;
new or removed moments refresh the evidence. Private events remain excluded.

Audio and video require existing `ffmpeg` and `whisper-cli` installations.
Set `WHISPER_MODEL` to a multilingual whisper.cpp model (for example,
`ggml-large-v3-turbo.bin`) and `WHISPER_VAD_MODEL` to a Silero VAD model.
The worker extracts the entire audio track and detects its language locally;
no speech is represented by an empty transcript, distinct from a missing one.
Existing ready Stream captions are reused when present. Sampled video frames and
full transcripts feed analysis, and all completed moments feed the recap.

Set `OLLAMA_FALLBACK_MODEL=qwen2.5vl:7b` for local image/video analysis and
optionally `OLLAMA_TEXT_MODEL=qwen3:14b` for recap generation. Keep `BATCH_SIZE=1`
for predictable processing latency. Active claims renew every minute during
long downloads, transcription and inference. Claude authentication/quota
errors activate the local fallback instead of consuming real failure attempts.
Local vision uses derivatives capped at 1280 pixels; original media is retained.
Every recap first extracts public topics from all evidence chunks. The advertised
agenda, inferred mood, and tags are excluded. Writing is followed by correction
and a separate factual/privacy audit. Audit feedback allows two automatic
corrections; drafts that still fail use the retry budget and stay unpublished.
The completion API requires the worker's publication-review
receipt, so older workers cannot publish unreviewed output. Historical events
with large transcripts cannot overflow the local model context. Invalid model
output uses the retry budget
instead of blocking the queue indefinitely.
Deploy `caption-worker.mjs`, `local-audio.mjs`, and `recap-context.mjs`, preserving `worker.env`,
then restart the existing launchd service. Apply the audio-job constraint
migration before deploying the application and updated worker.
