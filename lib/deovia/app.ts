export const APP = 'dalat' as const;
export function loginPath(next: string) { return `/auth/login?next=${encodeURIComponent(next)}`; }
export async function landingPath(_id: string, next: string) { return `/auth/continue?next=${encodeURIComponent(next)}`; }
