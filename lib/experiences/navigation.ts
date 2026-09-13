export function isExperienceEditorPath(path: string) {
  return /^\/(?:[a-z]{2}\/)?experiences\/(?:new\/?|[^/]+\/edit\/?)$/.test(path);
}
