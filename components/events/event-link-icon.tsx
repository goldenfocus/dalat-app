"use client";
import { useState } from "react";
import { normalizeEventContactLink } from "@/lib/events/contact-link";
import { Facebook, Globe, Instagram, MessageCircle, Music2, Send, Youtube, Phone } from "lucide-react";
import { detectEventLinkPlatform } from "@/lib/events/contact-links";
export function EventLinkIcon({ url, imageUrl }: { url: string; imageUrl?: string | null }) {
  const [failed,setFailed]=useState<string|null>(null);
  const src=imageUrl ? normalizeEventContactLink(imageUrl) : null;
  if(src && failed!==src) return <img src={src} alt="" referrerPolicy="no-referrer" loading="lazy"
    className="h-10 w-10 shrink-0 rounded-full object-cover" onError={()=>setFailed(src)}/>;
  const platform = detectEventLinkPlatform(url);
  const props = { className: "h-5 w-5 shrink-0", "aria-hidden": true as const };
  if (platform === "zalo") return <span aria-hidden="true" className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-blue-600 text-xs font-bold text-white">Z</span>;
  if (platform === "whatsapp") return <span aria-hidden="true" className="relative inline-flex h-5 w-5 shrink-0 text-green-600"><MessageCircle {...props}/><Phone className="absolute left-1 top-1 h-3 w-3"/></span>;
  if (platform === "telegram") return <Send {...props}/>;
  if (platform === "facebook") return <Facebook {...props}/>;
  if (platform === "instagram") return <Instagram {...props}/>;
  if (platform === "youtube") return <Youtube {...props}/>;
  if (platform === "tiktok") return <Music2 {...props}/>;
  return <Globe {...props}/>;
}
