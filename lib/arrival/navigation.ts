/** Arrival forms, staff queues and the in-memory rehearsal own their refresh lifecycle. */
export function isArrivalWorkspacePath(pathname: string): boolean {
  const path = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "");
  return /^\/staff\/?$/.test(path) || /^\/practice\/rehearsal\/?$/.test(path) || /^\/events\/[^/]+\/(?:arrive|host|prepare)\/?$/.test(path);
}
