import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

/**
 * Ships the venueMenu messages with the HTML for the client widgets below it.
 * Route-island namespaces otherwise arrive after first paint, so server-rendered
 * buttons would show raw keys (e.g. "venueMenu.signInToPreorder") until hydration.
 */
export async function MenuIntl({ children }: { children: React.ReactNode }) {
  const messages = await getMessages();
  return <NextIntlClientProvider messages={{ venueMenu: messages.venueMenu, arrival: messages.arrival }}>{children}</NextIntlClientProvider>;
}
