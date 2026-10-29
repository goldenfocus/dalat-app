// @vitest-environment node
import {describe,it,expect,vi} from "vitest";
import {DriveClient,MAX_BYTES} from "./drive";
const json = (data:unknown) => new Response(JSON.stringify(data),{headers:{"content-type":"application/json"}});
const folder = {id:"root",name:"Source",mimeType:"application/vnd.google-apps.folder"};
describe("public Drive reader", () => {
  it("walks nested folders and every page, ignoring shortcuts",async()=>{
    const fetcher = vi.fn().mockResolvedValueOnce(json(folder))
      .mockResolvedValueOnce(json({nextPageToken:"next",files:[{id:"child",name:"2026-10-28",mimeType:folder.mimeType},{id:"shortcut",name:"link",mimeType:"application/vnd.google-apps.shortcut"}]}))
      .mockResolvedValueOnce(json({files:[{id:"p1",name:"photo.jpg",mimeType:"image/jpeg"}]}))
      .mockResolvedValueOnce(json({files:[{id:"p2",name:"IMG.jpg",mimeType:"image/jpeg"}]}));
    const result=await new DriveClient("secret",fetcher).list("root");
    expect(result.map(f=>f.names)).toEqual([["photo.jpg"],["2026-10-28","IMG.jpg"]]);
    expect(fetcher.mock.calls[2][0].searchParams.get("pageToken")).toBe("next");
    expect(fetcher.mock.calls[0][0].toString()).not.toContain("secret");
  });
  it("distinguishes inaccessible folders from empty ones",async()=>{
    await expect(new DriveClient("secret",vi.fn().mockResolvedValue(new Response("secret",{status:403}))).list("root")).rejects.toThrow("HTTP 403");
    await expect(new DriveClient("secret",vi.fn().mockResolvedValueOnce(json(folder)).mockResolvedValueOnce(json({files:[]}))).list("root")).resolves.toEqual([]);
  });
  it("rejects incomplete listings",async()=>{
    const request=vi.fn().mockResolvedValueOnce(json(folder)).mockResolvedValueOnce(json({incompleteSearch:true,files:[]}));
    await expect(new DriveClient("secret",request).list("root")).rejects.toThrow("incomplete");
  });
  it("bounds download sizes before and during streaming",async()=>{
    const file={id:"img",name:"IMG.jpg",mimeType:"image/jpeg",names:[]};
    await expect(new DriveClient("secret").download({...file,size:String(MAX_BYTES+1)})).rejects.toThrow("30 MB");
    const request=vi.fn().mockResolvedValue(new Response(new Uint8Array(MAX_BYTES+1)));
    await expect(new DriveClient("secret",request).download(file)).rejects.toThrow("30 MB");
  });
  it("honors owner download restrictions",async()=>{
    await expect(new DriveClient("secret").download({id:"img",name:"IMG.jpg",mimeType:"image/jpeg",names:[],capabilities:{canDownload:false}})).rejects.toThrow("disabled");
  });
});
