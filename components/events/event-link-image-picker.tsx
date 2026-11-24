"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePlus, Loader2 } from "lucide-react";
export function EventLinkImagePicker({value, onChange, onBusyChange}: {value:string; onChange:(url:string)=>void; onBusyChange:(busy:boolean)=>void}) {
 const t=useTranslations("eventForm");
 const [busy,setBusy]=useState(false),[error,setError]=useState(false);
 return <div className="mt-2">
   <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-primary">
    {busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <ImagePlus className="h-4 w-4"/>}
    {busy ? t("linkImageUploading") : value ? t("changeLinkImage") : t("addLinkImage")}
    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" disabled={busy}
      onChange={async e=>{
       const file=e.target.files?.[0]; if(!file)return;
       e.target.value="";
       if(!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)||file.size>5*1024*1024){setError(true);return;}
       setBusy(true);onBusyChange(true);setError(false);
       try {
        const {uploadFile}=await import("@/lib/storage/client");
        const ext=file.type==="image/jpeg"?"jpg":file.type.split("/")[1];
        const result=await uploadFile("event-media",file,{filename:"link-images/"+crypto.randomUUID()+"."+ext});
        onChange(result.publicUrl);
       } catch { setError(true); } finally {setBusy(false);onBusyChange(false);}
      }}/>
   </label>
   {error && <p role="alert" className="text-sm text-destructive">{t("linkImageError")}</p>}
 </div>;
}
