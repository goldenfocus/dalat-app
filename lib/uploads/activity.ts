// Shared with SW/freshness guards without loading the upload engine.
let busy = false;
export const isMomentUploadActive = () => busy;
export function setMomentUploadActive(value: boolean) {
  if (busy === value) return;
  busy = value;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('dalat:upload-activity'));
}
