# dalat.app caption worker (Mac mini)

Claims `caption_jobs` from dalat.app and runs vision captioning with zero
pay-per-token API keys: batched headless `claude -p` (subscription, Haiku)
first, optional local ollama VLM (`OLLAMA_FALLBACK_MODEL=qwen2.5vl:7b`) as
fallback. Raw model output is validated server-side by
`/api/admin/caption-jobs/complete` — the worker never writes captions itself.

Deploy: copy this directory to the mini, run `./install.sh` (asks for
`ADMIN_API_KEY` once). Logs: `~/Library/Logs/dalat-caption-worker.log`.
Restart: `launchctl kickstart -k gui/$(id -u)/com.goldenfocus.dalat-caption-worker`.
