import { Locale } from '@/lib/types';

export const locales: Locale[] = ['en', 'fr', 'vi'];
export const defaultLocale: Locale = 'en';

export type Messages = typeof import('@/messages/en.json');
