import { createClient } from '@/lib/supabase/server';
import { isValidLocale } from '@/lib/locale';
import type { Locale } from '@/lib/types';
import { defaultLocale } from './config';

export async function getUserLocale(): Promise<Locale> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('locale')
        .eq('id', user.id)
        .single();

      if (profile?.locale && isValidLocale(profile.locale)) {
        return profile.locale;
      }
    }
  } catch {
    // Fall through to default
  }

  return defaultLocale;
}
