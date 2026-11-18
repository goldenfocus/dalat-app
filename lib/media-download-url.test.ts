import {describe,it,expect} from "vitest";
import {isAllowedMediaDownloadUrl,selectMediaDownloadUrl} from "./media-download-url";
describe("media download boundary",()=>{
  it("allows our exact-master download and original media",()=>{
    expect(isAllowedMediaDownloadUrl("https://chicoman.com/downloads/videos/tho-khoai-tay-soft-opening-v2-portrait.mp4")).toBe(true);
    expect(isAllowedMediaDownloadUrl("https://cdn.dalat.app/moments/photo.jpg")).toBe(true);
  });
  it("rejects external, credentialed and non-download URLs",()=>{
    for(const url of ["http://chicoman.com/downloads/videos/a.mp4","https://chicoman.com.evil.test/downloads/videos/a.mp4","https://chicoman.com/private","https://user@chicoman.com/downloads/videos/a.mp4","https://chicoman.com:8443/downloads/videos/a.mp4","https://127.0.0.1/a.mp4"]) expect(isAllowedMediaDownloadUrl(url)).toBe(false);
  });
});

describe("download variants", () => {
 const moment={media_url:"https://cdn.dalat.app/mobile.mp4",file_url:"https://chicoman.com/downloads/videos/master.mp4",content_type:"youtube"};
 it("keeps the original as the default download",()=>expect(selectMediaDownloadUrl(moment,null)).toBe(moment.file_url));
 it("only selects the small copy for an explicit mobile request",()=>expect(selectMediaDownloadUrl(moment,"mobile")).toBe(moment.media_url));
 it("never follows an untrusted original URL",()=>expect(selectMediaDownloadUrl({...moment,file_url:"https://bad.example/private"},"original")).toBe(moment.media_url));
});
