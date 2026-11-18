import {describe,it,expect,vi,afterEach} from "vitest";
import {downloadBlob} from "./download-blob";
afterEach(()=>vi.unstubAllGlobals());
describe("download progress",()=>{
 it("reports real bytes received before the file is ready",async()=>{
  const progress=vi.fn();
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array([1,2]));controller.enqueue(new Uint8Array([3,4,5]));controller.close();}}),{headers:{"content-length":"5","content-type":"video/mp4"}})));
  const blob=await downloadBlob("/video",{signal:new AbortController().signal,onProgress:progress});
  expect(progress.mock.calls.map(([p])=>p.loaded)).toEqual([0,2,5]);
  expect(progress.mock.calls[2][0].total).toBe(5);
  expect(blob.size).toBe(5); expect(blob.type).toBe("video/mp4");
 });
 it("falls back to the same-origin route if direct CDN access fails",async()=>{
  const fetcher=vi.fn().mockRejectedValueOnce(new TypeError("CORS")).mockResolvedValueOnce(new Response("video"));
  vi.stubGlobal("fetch",fetcher);
  await downloadBlob("https://cdn.dalat.app/video",{signal:new AbortController().signal,fallbackUrl:"/download?quality=mobile",onProgress:vi.fn()});
  expect(fetcher.mock.calls[1][0]).toBe("/download?quality=mobile");
 });
 it("does not retry a cancelled download",async()=>{
  const controller=new AbortController();controller.abort();
  const fetcher=vi.fn().mockRejectedValue(new DOMException("Cancelled","AbortError"));
  vi.stubGlobal("fetch",fetcher);
  await expect(downloadBlob("/video",{signal:controller.signal,fallbackUrl:"/fallback",onProgress:vi.fn()})).rejects.toThrow("Cancelled");
  expect(fetcher).toHaveBeenCalledOnce();
 });
});
