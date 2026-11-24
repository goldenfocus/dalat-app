import { createClient } from "@/lib/supabase/server";
import { linkedCommunitySlug } from "@/lib/events/contact-links";
import { getTranslations } from "next-intl/server";
import { publicEventLinks, detectEventLinkPlatform } from "@/lib/events/contact-links";
import { EventLinkIcon } from "./event-link-icon";
export async function EventContactLinks({ primary, additional, names = {}, images = {}, hidePrimary = false }: {
 primary?: string | null; additional?: string[] | null; names?: Record<string,string>; images?: Record<string,string>; hidePrimary?: boolean;
}) {
 const links = publicEventLinks(primary, additional, hidePrimary);
 if (!links.length) return null;
 const t = await getTranslations("eventForm");
 const slugs=links.map(linkedCommunitySlug).filter((s):s is string=>!!s);
 const db=slugs.length ? await createClient() : null;
 const {data:communities}=db ? await db.from("tribes").select("slug,name,cover_image_url").in("slug",slugs).eq("is_listed",true).in("access_type",["public","request"]) : {data:[]};
 const communityFor=(href:string)=>communities?.find(c=>c.slug===linkedCommunitySlug(href));
 return <div className="flex flex-col items-start gap-3">
  {links.map(href => <a key={href} href={href} target="_blank" rel="noopener noreferrer"
    className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-primary hover:bg-muted">
    <EventLinkIcon url={href} imageUrl={images[href] || communityFor(href)?.cover_image_url}/>
    <span className="min-w-0"><span className="block break-words">{typeof names[href] === "string" && names[href].trim() ? names[href].trim().slice(0,80) : communityFor(href)?.name || t("linkPlatforms." + detectEventLinkPlatform(href))}</span>
      {links.length > 1 && <span className="block max-w-[65vw] truncate text-xs font-normal text-muted-foreground sm:max-w-md">{href.replace(/^https?:\/\//, "")}</span>}
    </span>
  </a>)}
 </div>;
}
