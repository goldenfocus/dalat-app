// Gallery gestures ported from the Dalat.app Rentals pilot.
function mediaIcon(label, kind, pathData = 'M6 6l12 12M18 6 6 18') {
  const control = document.createElement('button');
  control.type = 'button';
  control.className = 'media-icon ' + kind;
  control.setAttribute('aria-label', label);
  const namespace = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(namespace, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS(namespace, 'path');
  path.setAttribute('d', pathData);
  icon.append(path);
  control.append(icon);
  return control;
}

function videoSoundControl(player, labels) {
  const speaker = 'M11 5 6 9H3v6h3l5 4z';
  const control = mediaIcon(labels.mute, 'media-sound', speaker);
  function update() {
    control.querySelector('path').setAttribute('d', speaker + (player.muted
      ? 'M16 9l6 6m0-6-6 6' : 'M15 9a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12'));
    control.setAttribute('aria-label', player.muted ? labels.unmute : labels.mute);
  }
  control.onclick = () => { player.muted = !player.muted; update(); };
  player.addEventListener('volumechange', update);
  update();
  return control;
}

export function openListingMedia(items, start, opener, labels) {
  const dialog = document.createElement('dialog');
  dialog.className = 'media-overlay gallery-viewer';
  dialog.setAttribute('autofocus', '');
  const video = document.createElement('video');
  video.className = 'media-player';
  video.playsInline = true;
  const photo = document.createElement('img');
  photo.className = 'media-player';
  photo.draggable = false;
  const feedback = document.createElement('p');
  feedback.className = 'media-feedback';
  feedback.setAttribute('role', 'status');
  feedback.textContent = labels.unavailable;
  const surface = document.createElement('button');
  surface.type = 'button';
  surface.className = 'media-touch';
  const labelPlayback = () => surface.setAttribute('aria-label', video.paused ? labels.play : labels.pause);
  const play = () => video.play().catch(labelPlayback);
  video.onplay = video.onpause = video.onended = labelPlayback;
  video.onerror = () => { if (video.getAttribute('src')) feedback.hidden = false; };
  surface.onclick = () => { if (video.paused) play(); else video.pause(); };
  const sound = videoSoundControl(video, labels);
  const close = mediaIcon(labels.close, 'media-close');
  close.onclick = () => dialog.close();
  const previous = mediaIcon(labels.previous, 'media-edge media-previous', 'm15 5-7 7 7 7');
  const next = mediaIcon(labels.next, 'media-edge media-next', 'm9 5 7 7-7 7');
  const reset = mediaIcon(labels.reset, 'media-reset-zoom', 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0m-2 4 6 6M7.5 10h5');
  reset.append(labels.reset);
  const touches = new Map();
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let index = start;
  let press;
  let suppressClick = false;
  let disposed = false;

  function renderZoom() {
    const width = dialog.clientWidth;
    const height = dialog.clientHeight;
    const mediaWidth = video.hidden ? photo.naturalWidth : video.videoWidth;
    const mediaHeight = video.hidden ? photo.naturalHeight : video.videoHeight;
    const ratio = mediaWidth && mediaHeight ? mediaWidth / mediaHeight : width / height;
    const maxX = Math.max(0, (Math.min(width, height * ratio) * scale - width) / 2);
    const maxY = Math.max(0, (Math.min(height, width / ratio) * scale - height) / 2);
    offsetX = Math.max(-maxX, Math.min(maxX, offsetX));
    offsetY = Math.max(-maxY, Math.min(maxY, offsetY));
    dialog.style.setProperty('--media-scale', scale);
    dialog.style.setProperty('--media-x', offsetX + 'px');
    dialog.style.setProperty('--media-y', offsetY + 'px');
    previous.hidden = next.hidden = scale > 1 || items.length === 1;
    reset.hidden = scale === 1;
  }
  function resetZoom() {
    scale = 1;
    offsetX = offsetY = 0;
    if (document.activeElement === reset) dialog.focus({ preventScroll: true });
    renderZoom();
  }
  reset.onclick = resetZoom;
  photo.onload = video.onloadedmetadata = renderZoom;

  function clearVideo() {
    video.pause();
    video.querySelectorAll("track").forEach(track => track.remove());
    if (video.hasAttribute('src')) {
      video.removeAttribute('src');
      video.load();
    }
  }
  function show() {
    const item = items[index];
    dialog.setAttribute('aria-label', item.label);
    for (const [control, disabled] of [[previous, index === 0], [next, index === items.length - 1]]) {
      control.setAttribute('aria-disabled', String(disabled));
      control.tabIndex = disabled ? -1 : 0;
    }
    feedback.hidden = true;
    clearVideo();
    photo.hidden = item.kind === "video";
    video.hidden = sound.hidden = surface.hidden = item.kind !== "video";
    if (item.kind !== "video") {
      photo.removeAttribute('src');
      photo.alt = item.label;
      photo.src = item.src;
      return;
    }
    video.poster = item.poster ?? "";
    video.muted = true;
    video.controls = true;
    surface.hidden = true;
    if (item.captions) {
      const track = document.createElement("track");
      track.kind = "captions";
      track.src = item.captions.src;
      track.srclang = item.captions.locale;
      track.label = item.captions.label;
      track.default = true;
      video.append(track);
    }
    video.src = item.src;
    labelPlayback();
    play();
  }
  function move(direction) {
    const target = index + direction;
    if (scale > 1 || target < 0 || target >= items.length) return;
    index = target;
    show();
  }
  previous.onclick = () => move(-1);
  next.onclick = () => move(1);
  dialog.onkeydown = event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (scale > 1) return;
    event.preventDefault();
    move(event.key === 'ArrowLeft' ? -1 : 1);
  };
  dialog.onpointerdown = event => {
    if (!touches.size) suppressClick = false;
    if (event.button !== 0 || touches.size === 2 || event.target.closest('.media-close,.media-sound,.media-reset-zoom')) return;
    const point = { x: event.clientX, y: event.clientY };
    if (event.pointerType === 'touch') touches.set(event.pointerId, point);
    if (touches.size > 1) {
      press = null;
      suppressClick = true;
      for (const id of touches.keys()) dialog.setPointerCapture(id);
    } else if (event.isPrimary) {
      press = { id: event.pointerId, ...point };
    }
  };
  dialog.onpointermove = event => {
    const before = touches.get(event.pointerId);
    if (!before) return;
    const after = { x: event.clientX, y: event.clientY };
    touches.set(event.pointerId, after);
    if (touches.size > 1) {
      const other = [...touches].find(([id]) => id !== event.pointerId)[1];
      const beforeDistance = Math.hypot(before.x - other.x, before.y - other.y);
      if (beforeDistance < 1) return;
      const afterDistance = Math.hypot(after.x - other.x, after.y - other.y);
      const nextScale = Math.max(1, Math.min(5, scale * afterDistance / beforeDistance));
      const factor = nextScale / scale;
      const rect = dialog.getBoundingClientRect();
      const anchorX = (before.x + other.x) / 2 - rect.left - rect.width / 2;
      const anchorY = (before.y + other.y) / 2 - rect.top - rect.height / 2;
      offsetX = anchorX + (after.x - before.x) / 2 + (offsetX - anchorX) * factor;
      offsetY = anchorY + (after.y - before.y) / 2 + (offsetY - anchorY) * factor;
      scale = nextScale;
    } else if (scale > 1) {
      offsetX += after.x - before.x;
      offsetY += after.y - before.y;
    } else return;
    renderZoom();
  };
  function releaseTouch(event) {
    if (touches.delete(event.pointerId) && !touches.size && scale > 1 && scale <= 1.02) resetZoom();
  }
  dialog.onpointercancel = event => {
    releaseTouch(event);
    press = null;
    suppressClick = true;
  };
  dialog.onpointerup = event => {
    releaseTouch(event);
    if (!press || press.id !== event.pointerId) return;
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    press = null;
    suppressClick = Math.hypot(dx, dy) > 10;
    if (Math.abs(dx) >= 36 && Math.abs(dx) > Math.abs(dy) * 1.25) move(dx < 0 ? 1 : -1);
  };
  dialog.addEventListener('click', event => {
    if (!suppressClick || event.detail === 0) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    window.removeEventListener('resize', renderZoom);
    clearVideo();
    dialog.remove();
  };
  dialog.onclose = () => { dispose(); opener.focus({ preventScroll: true }); };
  dialog.append(video, photo, feedback, surface, previous, next, reset, sound, close);
  const container = opener.closest('dialog[open]') || document.body;
  container.append(dialog);
  dialog.showModal();
  show();
  resetZoom();
  window.addEventListener('resize', renderZoom);
  return dispose;
}
