import { RentalsHeader } from "@/components/rentals/header";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { notFound } from "next/navigation";
import { getMessages, setRequestLocale } from "next-intl/server";
import { locales } from "@/lib/i18n/routing";
import "./rentals.css";

export default async function RentalsLayout({ children, params }: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!hasLocale(locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages({ locale });
  const rentalsMessages = Object.fromEntries(["calendar", "common", "nav", "rentalsDetails", "rentalsPilot", "translations", "userMenu"]
    .map(key => [key, messages[key]]));

  return (
    <NextIntlClientProvider locale={locale} messages={rentalsMessages}>
      <div data-rentals-page>
        <RentalsHeader locale={locale} />
        {children}
      </div>
    </NextIntlClientProvider>
  );
}
