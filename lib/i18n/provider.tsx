'use client';

import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';

interface I18nProviderProps {
  locale: string;
  messages: Record<string, unknown>;
  children: ReactNode;
}

export function I18nProvider({ locale, messages, children }: I18nProviderProps) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
