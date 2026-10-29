export interface DriveFile {
  id: string; name: string; mimeType: string; size?: string; md5Checksum?: string;
  modifiedTime?: string; imageMediaMetadata?: { time?: string };
  capabilities?: { canDownload?: boolean }; names: string[];
}
export const MAX_BYTES = 30 * 1024 * 1024;
export class DriveClient {
  constructor(private key: string, private request: typeof fetch = fetch) {}
  private async get(path: string, params: Record<string, string>) {
    const url = new URL(`https://www.googleapis.com/drive/v3/files${path}`);
    for (const [k,v] of Object.entries(params)) url.searchParams.set(k,v);
    const response = await this.request(url, {
      headers: { "X-Goog-Api-Key": this.key }, signal: AbortSignal.timeout(20000), redirect: "error", cache: "no-store",
    });
    // Never log Google's response body or a request URL: either can contain credentials.
    if (!response.ok) throw new Error(`Google Drive returned HTTP ${response.status}; check API enablement, key restrictions, and public folder access`);
    return response;
  }
  async list(rootId: string): Promise<DriveFile[]> {
    // Verify the source is reachable even when a list would return an empty result.
    const root = await (await this.get(`/${rootId}`, { fields: "id,name,mimeType" })).json();
    if (root.mimeType !== "application/vnd.google-apps.folder") throw new Error("Drive source is not a folder");
    const queue = [{ id: rootId, names: [] as string[] }];
    const seen = new Set<string>(); const photos: DriveFile[] = [];
    while (queue.length) {
      const folder = queue.shift()!;
      if (seen.has(folder.id)) continue;
      seen.add(folder.id);
      if (seen.size > 150 || folder.names.length > 8) throw new Error("Drive folder safety limit exceeded");
      let token = ""; const tokens = new Set<string>();
      do {
        const params: Record<string,string> = { q: `'${folder.id}' in parents and trashed = false`, pageSize: "1000", fields: "nextPageToken,incompleteSearch,files(id,name,mimeType,size,md5Checksum,modifiedTime,imageMediaMetadata(time),capabilities(canDownload))" };
        if (token) params.pageToken = token;
        const data = await (await this.get("", params)).json();
        if (data.incompleteSearch) throw new Error("Google Drive returned an incomplete listing");
        for (const file of data.files || []) {
          if (!/^[\w-]+$/.test(file.id)) throw new Error("Invalid Drive file ID");
          if (file.mimeType === "application/vnd.google-apps.folder") queue.push({ id: file.id, names: [...folder.names, file.name] });
          // Shortcuts never widen this source to another tree. Other file types are ignored.
          else if (["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(file.mimeType)) photos.push({ ...file, names: [...folder.names, file.name] });
          if (photos.length > 10000) throw new Error("Drive photo safety limit exceeded");
        }
        token = data.nextPageToken || "";
        if (token && tokens.has(token)) throw new Error("Repeated Drive page token");
        tokens.add(token);
      } while (token);
    }
    return photos;
  }
  async download(file: DriveFile): Promise<Buffer> {
    if (file.capabilities?.canDownload === false) throw new Error("Owner has disabled downloading");
    if (Number(file.size) > MAX_BYTES) throw new Error("Photo exceeds 30 MB limit");
    const response = await this.get(`/${file.id}`, { alt: "media" });
    if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("Photo exceeds 30 MB limit");
    const reader = response.body?.getReader(); if (!reader) throw new Error("Empty download");
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) { const {done, value} = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BYTES) throw new Error("Photo exceeds 30 MB limit"); chunks.push(value); }
    } finally { await reader.cancel(); }
    if (!size) throw new Error("Empty photo");
    return Buffer.concat(chunks);
  }
}
