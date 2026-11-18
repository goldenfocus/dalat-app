import {render,fireEvent,cleanup} from "@testing-library/react";
import {describe,it,expect,vi,afterEach} from "vitest";
import {PromoLightboxContent} from "./promo-media-section";
import type {EventPromoMedia} from "@/lib/types";
vi.mock("next-intl",()=>({useTranslations:()=> (key:string)=>key,useLocale:()=> "en"}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/lib/i18n/routing",()=>({Link:"a"}));
afterEach(cleanup);
const item={id:"p",media_type:"youtube",media_url:"https://chicoman.com/downloads/videos/a.mp4",thumbnail_url:null,youtube_url:null,youtube_video_id:"3ZdEJC6MmGw",source_moment_id:"m",title:null,caption:null,sort_order:0,is_ai_suggested:false,promo_source:"event",created_at:"2026-11-17"} as EventPromoMedia;
describe("promo playback",()=>{
 it("returns to the event when a hosted film ends",()=>{
  const onEnded=vi.fn();const {container}=render(<PromoLightboxContent item={item} onEnded={onEnded}/>);
  const video=container.querySelector("video")!;expect(video).toBeTruthy();expect(container.querySelector("iframe")).toBeNull();
  fireEvent.ended(video);expect(onEnded).toHaveBeenCalledOnce();
 });
 it("also returns when an uploaded video ends",()=>{
  const onEnded=vi.fn();const {container}=render(<PromoLightboxContent item={{...item,media_type:"video"}} onEnded={onEnded}/>);
  fireEvent.ended(container.querySelector("video")!);expect(onEnded).toHaveBeenCalledOnce();
 });
});
