/** Arrival forms and shared staff queues own their refresh lifecycle. */
export function isArrivalWorkspacePath(pathname: string): boolean {
  const path = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "");
  return /^\/staff\/?$/.test(path) || /^\/events\/[^/]+\/(?:arrive|host)\/?$/.test(path);
}
