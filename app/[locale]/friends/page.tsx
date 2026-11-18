import type { Metadata } from "next";
import Image from "next/image";
import { ArrowUpRight, Heart, Users, Download } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, type Locale } from "@/lib/i18n/routing";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { OriginalText } from "@/components/ui/original-text";
import source from "@/messages/en.json";

type Props = { params: Promise<{ locale: Locale }> };
const groupName = "🇻🇳 Đà Lạt 💚 Friends of Friends 🫶";
const channels = [{ name: "Zalo", href: "https://zalo.me/g/zteyzjcunev9vrhmliqm", qr: "/friends/zalo-qr.svg", color: "bg-blue-600 hover:bg-blue-700" }];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "friendsCommunity" });
  return generateLocalizedMetadata({ locale, path: "/friends", title: t("title") + " · Đà Lạt", description: t("invite"), image: "https://dalat.app/friends/avatar.webp" });
}
export default async function FriendsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "friendsCommunity" });
  return <main className="min-h-screen bg-[#f7f8f2] text-[#193d31] dark:bg-[#10251e] dark:text-[#ecf5e9]">
    <div className="mx-auto max-w-5xl px-5 pb-28 pt-10 sm:px-8 sm:pt-16">
      <header className="grid items-center gap-8 pb-12 md:grid-cols-[1.3fr_0.7fr] md:gap-16 md:pb-16">
        <div>
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">{t("eyebrow")}</p>
          <p className="mb-3 text-sm font-medium">🇻🇳 Đà Lạt 💚</p>
          <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">{t("title")} <span className="whitespace-nowrap">🫶</span></h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed opacity-75">{t("tagline")}</p>
          <a href="#join" className="mt-7 inline-flex min-h-12 items-center gap-3 rounded-full bg-[#225b42] px-6 py-3 font-medium text-white transition hover:bg-[#184530]">{t("joinTitle")}<ArrowUpRight aria-hidden="true" className="h-4 w-4"/></a>
        </div>
        <Image src="/friends/avatar.webp" alt={t("avatarAlt")} width={768} height={768} priority className="mx-auto aspect-square w-56 rounded-full shadow-lg sm:w-72 md:w-full"/>
      </header>
      <section className="grid gap-5 border-t border-emerald-900/15 py-10 dark:border-white/15 sm:grid-cols-[0.6fr_1.4fr]">
        <h2 className="flex items-start gap-2 text-lg font-semibold"><Heart aria-hidden="true" className="mt-1 h-5 w-5"/>{t("storyTitle")}</h2>
        <div className="max-w-2xl space-y-5 text-base leading-7 opacity-85">
          <p>{t("story")}</p><p>{t("invite")}</p>
          {locale !== "en" && <OriginalText sourceLocale="en" text={source.friendsCommunity.story + "\n\n" + source.friendsCommunity.invite}/>}
        </div>
      </section>
      <section id="join" className="scroll-mt-24 rounded-[2rem] border border-emerald-900/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5 sm:p-9">
        <h2 className="text-2xl font-semibold">{t("joinTitle")}</h2>
        <p className="mt-2 text-sm leading-6 opacity-70">{t("joinDescription")}</p>
        <p className="mt-5 text-sm font-medium">{groupName}</p>
        <div className="mt-6 grid gap-6">
          {channels.map(channel => <div key={channel.name} className="grid items-center gap-6 rounded-2xl bg-[#f7f8f2] p-5 dark:bg-black/15 sm:grid-cols-[1fr_176px]">
            <div>
              <div className="mb-2 flex items-center gap-2"><Users aria-hidden="true" className="h-5 w-5"/><h3 className="text-lg font-semibold">{channel.name}</h3></div>
              <p className="mb-5 max-w-lg text-sm leading-6 opacity-75">{t("note")}</p>
              <a href={channel.href} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-12 items-center gap-2 rounded-full px-6 py-3 font-medium text-white transition ${channel.color}`}>{t("join",{platform:channel.name})}<ArrowUpRight aria-hidden="true" className="h-4 w-4"/></a>
              <a href={channel.href} target="_blank" rel="noopener noreferrer" className="mt-4 block break-all text-xs underline underline-offset-4 opacity-70">{channel.href.replace("https://", "")}</a>
            </div>
            <div className="text-center">
              <a href={channel.href} target="_blank" rel="noopener noreferrer" className="inline-block rounded-xl bg-white p-2"><Image unoptimized src={channel.qr} alt={t("qrAlt",{platform:channel.name})} width={160} height={160}/></a>
              <p className="mt-1 text-xs opacity-70">{t("scan")}</p>
              <a href={`/friends/${channel.name.toLowerCase()}-qr.png`} download={`friends-of-friends-${channel.name.toLowerCase()}-qr.png`} className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs underline underline-offset-4"><Download aria-hidden="true" className="h-3 w-3"/>{t("download")}</a>
              <a href={channel.href} target="_blank" rel="noopener noreferrer" className="mt-4 block break-all text-xs underline underline-offset-4 opacity-70">{channel.href.replace("https://", "")}</a>
            </div>
          </div>)}
        </div>
      </section>
      <footer className="mt-9 flex flex-col items-start justify-between gap-4 text-sm sm:flex-row">
        <p className="opacity-65">{t("footer")}<br/><Link href="/" className="mt-1 inline-block font-medium underline underline-offset-4">Dalat.app</Link></p>
        <Link href="/calendar" className="inline-flex min-h-11 items-center gap-2 font-medium">{t("events")}<ArrowUpRight aria-hidden="true" className="h-4 w-4"/></Link>
      </footer>
    </div>
  </main>;
}
