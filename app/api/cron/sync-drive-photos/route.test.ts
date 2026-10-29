// @vitest-environment node
import {afterEach,describe,expect,it,vi} from "vitest";
vi.mock("@/lib/drive-photos/sync",()=>({syncDrivePhotos:vi.fn().mockResolvedValue({state:"complete",seen:0})}));
import {GET} from "./route";
import {syncDrivePhotos} from "@/lib/drive-photos/sync";
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
describe("Drive cron access",()=>{
  it("rejects requests before provider access",async()=>{
    vi.stubEnv("CRON_SECRET","secret");
    expect((await GET(new Request("https://dalat.app/api/cron/sync-drive-photos"))).status).toBe(401);
    expect(syncDrivePhotos).not.toHaveBeenCalled();
  });
  it("reports unconfigured access without claiming an empty successful sync",async()=>{
    vi.stubEnv("CRON_SECRET","secret");vi.stubEnv("GOOGLE_DRIVE_API_KEY","");
    const response=await GET(new Request("https://dalat.app/api/cron/sync-drive-photos",{headers:{authorization:"Bearer secret"}}));
    expect(await response.json()).toMatchObject({state:"setup_required"});expect(syncDrivePhotos).not.toHaveBeenCalled();
  });
  it("runs only with an authenticated configured connection",async()=>{
    vi.stubEnv("CRON_SECRET","secret");vi.stubEnv("GOOGLE_DRIVE_API_KEY","drive-key");
    const response=await GET(new Request("https://dalat.app/api/cron/sync-drive-photos",{headers:{authorization:"Bearer secret"}}));
    expect(await response.json()).toMatchObject({state:"complete",seen:0});expect(syncDrivePhotos).toHaveBeenCalledWith("drive-key");
  });
});
