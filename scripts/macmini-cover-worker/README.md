# dalat.app Cover Worker (Mac mini)

Polls dalat.app for blog posts missing covers, generates images locally with mflux (FLUX schnell), uploads direct to R2, marks the job done.

## Quickstart

1. Copy this folder to the mini: `scp -r scripts/macmini-cover-worker brain1.goldenfocus.io:~/dalat-cover-worker` (or `git clone` the repo and cd here)
2. Run `./install.sh` — installs uv + mflux if missing, prompts for `ADMIN_API_KEY`, installs the launchd job (auto-starts on boot, auto-restarts on crash)
3. Logs: `tail -f ~/Library/Logs/dalat-cover-worker.log` — one line per job (`done slug=... tier=macmini duration=...s`)
4. Verify: pick a slug from the log and check the post — its cover should be a `https://cdn.dalat.app/blog-media/...` URL
5. Re-running `./install.sh` is safe (idempotent); delete `worker.env` first to change the API key

## Config (worker.env)

`DALAT_BASE_URL` (default https://dalat.app) · `ADMIN_API_KEY` (required) · `POLL_MINUTES` (10) · `MFLUX_BIN` (mflux-generate) · `MODEL` (schnell) · `STEPS` (3)
