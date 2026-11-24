"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EventLinkIcon } from "./event-link-icon";
import { EventLinkImagePicker } from "./event-link-image-picker";
import { normalizeEventContactLink } from "@/lib/events/contact-link";
import { MAX_EVENT_LINKS, detectEventLinkPlatform } from "@/lib/events/contact-links";

type Row = { id: number; url: string; name: string; image: string };
export function EventLinksInput({ primary, additional, names = {}, images = {}, copying = false, onChange }: {
 primary?: string | null; additional?: string[] | null; names?: Record<string,string>; images?: Record<string,string>; copying?: boolean;
 onChange?: (primary: string, additional: string[], names: Record<string,string>, images: Record<string,string>) => void;
}) {
 const t = useTranslations("eventForm");
 const [rows,setRows] = useState<Row[]>(() => (copying ? [""] : [primary || "", ...(additional || [])]).map((url,id) => ({
   id,url,name: copying ? "" : names[normalizeEventContactLink(url) || url] || "",
   image: copying ? "" : images[normalizeEventContactLink(url) || url] || "",
 })));
 const nextId=useRef(rows.length);
 const callback=useRef(onChange); callback.current=onChange;
 const [uploading,setUploading]=useState<Set<number>>(() => new Set());
 useEffect(() => {
   const named=Object.fromEntries(rows.filter(row=>row.url && row.name.trim()).map(row=>[normalizeEventContactLink(row.url)||row.url,row.name]));
   const pictured=Object.fromEntries(rows.filter(row=>row.url && row.image).map(row=>[normalizeEventContactLink(row.url)||row.url,row.image]));
   callback.current?.(rows[0]?.url || "",rows.slice(1).map(row=>row.url),named,pictured);
 },[rows]);
 const update=(id:number,patch:Partial<Row>)=>setRows(current=>current.map(row=>row.id===id?{...row,...patch}:row));
 const busy=(id:number,value:boolean)=>setUploading(current=>{const next=new Set(current);if(value)next.add(id);else next.delete(id);return next;});
 const remove=(row:Row,index:number)=>{
   setRows(current=>index===0?current.map(item=>item.id===row.id?{...item,url:"",name:"",image:""}:item):current.filter(item=>item.id!==row.id));
   busy(row.id,false);
 };
 return <fieldset className="space-y-3" data-event-link-uploading={uploading.size ? "true" : "false"}>
   <legend className="text-sm font-medium">{t("contactLinksTitle")}</legend>
   {rows.map((row,index)=><div key={row.id} className="flex items-start gap-2">
     <span className="pt-2"><EventLinkIcon url={row.url} imageUrl={row.image}/></span>
     <div className="min-w-0 flex-1">
       <label className="sr-only" htmlFor={"event-contact-link-"+row.id}>{t("contactLinkNumber",{number:index+1})}</label>
       <Input id={"event-contact-link-"+row.id} name={index===0?"external_chat_url":"additional_links"} type="text" inputMode="url"
         disabled={uploading.has(row.id)} value={row.url} onChange={e=>update(row.id,{url:e.target.value})}
         autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={2048}
         placeholder={t("externalLinkPlaceholder")} aria-describedby="event-contact-help"/>
       <label className="sr-only" htmlFor={"event-contact-name-"+row.id}>{t("contactLinkName")}</label>
       <Input id={"event-contact-name-"+row.id} name="contact_link_name" className="mt-2"
         value={row.name} onChange={e=>update(row.id,{name:e.target.value})} maxLength={80} placeholder={t("contactLinkName")}/>
       <input type="hidden" name="contact_link_image" value={row.image}/>
       {row.url.trim() && <EventLinkImagePicker value={row.image} onChange={image=>update(row.id,{image})} onBusyChange={value=>busy(row.id,value)}/>}
       {row.url && <span className="text-xs text-muted-foreground">{t("linkPlatforms."+detectEventLinkPlatform(row.url))}</span>}
     </div>
     <Button type="button" variant="ghost" size="icon" disabled={uploading.has(row.id)} aria-label={t("removeContactLink",{number:index+1})} onClick={()=>remove(row,index)}><X className="h-4 w-4"/></Button>
   </div>)}
   {rows.length<MAX_EVENT_LINKS && <Button type="button" variant="outline" size="sm" onClick={()=>setRows(current=>[...current,{id:nextId.current++,url:"",name:"",image:""}])}><Plus className="mr-2 h-4 w-4"/>{t("addContactLink")}</Button>}
   <p id="event-contact-help" className="text-sm text-muted-foreground">{t("contactLinksHelp")}</p>
   {copying && <p className="text-sm text-muted-foreground">{t("externalLinkNotCopied")}</p>}
 </fieldset>;
}
