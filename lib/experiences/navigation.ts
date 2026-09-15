export function isExperienceEditorPath(path: string) {
  return /^\/(?:[a-z]{2}\/)?experiences\/(?:new\/?|[^/]+\/edit\/?)$/.test(path);
}

export function isExperiencePath(path: string) {
  return /^\/(?:[a-z]{2}\/)?experiences(?:\/|$)/.test(path);
}
