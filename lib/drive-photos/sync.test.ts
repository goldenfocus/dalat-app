// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from "vitest";
import sharp from "sharp";
import {SOURCE} from "./matching";
const mocks=vi.hoisted(()=>({db:vi.fn(),list:vi.fn(),download:vi.fn(),upload:vi.fn()}));
vi.mock("@supabase/supabase-js",()=>({createClient:mocks.db}));
vi.mock("./drive",()=>({DriveClient:class {list=mocks.list;download=mocks.download;}}));
vi.mock("@/lib/storage/r2",()=>({R2StorageProvider:class {upload=mocks.upload;}}));
import {syncDrivePhotos,fingerprint} from "./sync";
let moments:Record<string,unknown>[];
let ledger:Record<string,unknown>[];
let event:Record<string,unknown>;
let failLedgerOnce:boolean;
function database() {
  return {rpc:vi.fn().mockResolvedValue({data:true,error:null}),from(table:string){
    let verb="select",value:Record<string,unknown>,single=false;
    const filters:Record<string,unknown>={};
    const q: Record<string,unknown> = {};
    for (const name of ["select","order","range","limit"]) q[name]=()=>q;
    q.eq=(k:string,v:unknown)=>{filters[k]=v;return q;};
    q.insert=(v:Record<string,unknown>)=>{verb="insert";value=v;return q;};
    q.upsert=(v:Record<string,unknown>)=>{verb="upsert";value=v;return q;};
    q.update=(v:Record<string,unknown>)=>{verb="update";value=v;return q;};
    q.single=q.maybeSingle=()=>{single=true;return q;};
    q.then=(resolve:(v:unknown)=>unknown)=>{
      let rows:Record<string,unknown>[]=[];
      if(table==="events") rows=[event];
      if(table==="moments") rows=moments;
      if(table==="drive_photo_imports") rows=ledger;
      if(table==="event_settings") rows=[{moments_enabled:true,moments_require_approval:false}];
      if(verb==="insert"&&table==="moments") moments.push(value);
      if(verb==="upsert"&&table==="drive_photo_imports") {
        if(failLedgerOnce){failLedgerOnce=false;return resolve({data:null,error:{code:"NETWORK"}});}
        ledger=ledger.filter(r=>r.file_id!==value.file_id);ledger.push(value);
      }
      const data=rows.filter(r=>Object.entries(filters).every(([k,v])=>r[k]===v));
      return resolve({data:single?(data[0]||null):data,error:null});
    };
    return q;
  }};
}
beforeEach(async()=>{
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://example.supabase.co");vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","test");
  moments=[];ledger=[];failLedgerOnce=false;
  event={id:"event",slug:"event",starts_at:"2026-01-07T11:00:00Z",ends_at:"2026-01-07T13:00:00Z",venue_id:SOURCE.venueId,series_id:SOURCE.seriesId,created_by:"owner",status:"published",tribe_id:null};
  mocks.db.mockImplementation(database);mocks.upload.mockReset().mockImplementation(async(_bucket,path)=>`https://cdn.example/${path}`);
  mocks.list.mockReset().mockResolvedValue([{id:"photo",name:"IMG.jpg",mimeType:"image/jpeg",names:["2026-01-07","IMG.jpg"]}]);
  mocks.download.mockResolvedValue(await sharp({create:{width:8,height:8,channels:3,background:"red"}}).jpeg().toBuffer());
});
describe("photo import recovery and safety",()=>{
  it("imports into the correct existing event and skips a second scan",async()=>{
    expect(await syncDrivePhotos("key")).toMatchObject({imported:1,failed:0});
    expect(moments).toHaveLength(1);expect(moments[0]).toMatchObject({event_id:"event",user_id:"owner",status:"published",content_type:"photo"});
    expect(ledger[0]).toMatchObject({status:"imported",source_url:"https://drive.google.com/file/d/photo/view"});
    const uploads=mocks.upload.mock.calls.length;
    expect(await syncDrivePhotos("key")).toMatchObject({imported:0});expect(moments).toHaveLength(1);expect(mocks.upload).toHaveBeenCalledTimes(uploads);
  });
  it("recovers a published moment when the ledger write failed",async()=>{
    failLedgerOnce=true;
    expect(await syncDrivePhotos("key")).toMatchObject({failed:1});expect(moments).toHaveLength(1);
    expect(await syncDrivePhotos("key")).toMatchObject({duplicates:1});expect(moments).toHaveLength(1);expect(ledger[0].status).toBe("imported");
  });
  it("deduplicates a second Drive file containing the same photo",async()=>{
    await syncDrivePhotos("key");
    mocks.list.mockResolvedValue([{id:"copy",name:"copy.jpg",mimeType:"image/jpeg",names:["2026-01-07","copy.jpg"]}]);
    expect(await syncDrivePhotos("key")).toMatchObject({duplicates:1,imported:0});expect(moments).toHaveLength(1);
  });
  it("does not move a previously imported source after renaming, even on later retries",async()=>{
    await syncDrivePhotos("key");
    mocks.list.mockResolvedValue([{id:"photo",name:"IMG.jpg",mimeType:"image/jpeg",names:["2026-01-14","IMG.jpg"]}]);
    expect(await syncDrivePhotos("key")).toMatchObject({held:1});expect(await syncDrivePhotos("key")).toMatchObject({held:1});
    expect(moments).toHaveLength(1);expect(moments[0].event_id).toBe("event");
  });
  it("holds undated files without publishing",async()=>{
    mocks.list.mockResolvedValue([{id:"photo",name:"IMG.jpg",mimeType:"image/jpeg",names:["IMG.jpg"]}]);
    expect(await syncDrivePhotos("key")).toMatchObject({held:1});expect(moments).toHaveLength(0);expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("keeps private events out of a public import",async()=>{
    event.tribe_id="private";event.tribe_visibility="members_only";
    expect(await syncDrivePhotos("key")).toMatchObject({held:1});expect(moments).toHaveLength(0);
  });
  it("tracks path and source revisions in the fingerprint",()=>{
    const file={id:"photo",name:"IMG.jpg",mimeType:"image/jpeg",names:["2026-01-07"]};
    expect(fingerprint(file)).not.toBe(fingerprint({...file,names:["2026-01-14"]}));
  });
});
