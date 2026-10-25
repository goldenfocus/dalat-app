import type { UploadJob } from './types';

let database: Promise<IDBDatabase> | undefined;
interface ChunkedFile { kind: 'chunks'; prefix: string; count: number; size: number; type: string }
type FileRecord = Blob | ChunkedFile;
const PART_SIZE = 1024 * 1024;
function open(): Promise<IDBDatabase> {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('dalat-event-uploads', 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('jobs')) request.result.createObjectStore('jobs', { keyPath: 'id' });
      if (!request.result.objectStoreNames.contains('files')) request.result.createObjectStore('files');
      if (!request.result.objectStoreNames.contains('chunks')) request.result.createObjectStore('chunks');
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); database = undefined; };
      resolve(request.result);
    };
    request.onerror = () => { database = undefined; reject(request.error); };
  });
  return database;
}

async function write(action: (tx: IDBTransaction) => void): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['jobs', 'files', 'chunks'], 'readwrite');
    let requestError: DOMException | null = null;
    tx.oncomplete = () => resolve();
    tx.onerror = event => { requestError = (event.target as IDBRequest).error; };
    tx.onabort = () => reject(tx.error || requestError || new Error('Upload could not be saved on this device'));
    try { action(tx); } catch (error) { tx.abort(); reject(error); }
  });
}

export async function saveJob(job: UploadJob, file?: Blob): Promise<void> {
  if (!file) { await write(tx => { tx.objectStore('jobs').put(job); }); return; }
  const previous = await read<FileRecord>('files', job.id);
  // Materialize bytes before acknowledging the selection. Persisting a File
  // object can retain a temporary picker handle in some engines, and WebKit
  // sometimes refuses Blob cloning entirely. Small ArrayBuffer parts survive
  // a full browser restart and never require reading a whole video into RAM.
  const chunked: ChunkedFile = { kind: 'chunks', prefix: `${job.id}:${crypto.randomUUID()}`,
    count: Math.ceil(file.size / PART_SIZE), size: file.size, type: job.mime || file.type };
  let written = 0;
  try {
    for (let index = 0; index < chunked.count; index++) {
      const data = await file.slice(index * PART_SIZE, (index + 1) * PART_SIZE).arrayBuffer();
      await write(tx => { tx.objectStore('chunks').put(data, `${chunked.prefix}:${index}`); });
      written++;
    }
    await write(tx => { tx.objectStore('jobs').put(job); tx.objectStore('files').put(chunked, job.id); });
  } catch (failure) {
    await write(tx => { for (let index = 0; index < written; index++) tx.objectStore('chunks').delete(`${chunked.prefix}:${index}`); }).catch(() => {});
    throw failure;
  }
  if (previous && !(previous instanceof Blob)) await removeChunks(previous).catch(() => {});
}
async function read<T>(store: string, id: string): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function removeChunks(record: ChunkedFile) {
  await write(tx => { for (let index = 0; index < record.count; index++) tx.objectStore('chunks').delete(`${record.prefix}:${index}`); });
}
export async function listJobs(): Promise<UploadJob[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = db.transaction('jobs').objectStore('jobs').getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function loadFile(id: string): Promise<Blob | undefined> {
  const source = await loadSource(id);
  return source?.slice(0, source.size);
}
export interface StoredSource { size: number; type: string; slice(start: number, end: number): Promise<Blob> }
export async function loadSource(id: string): Promise<StoredSource | undefined> {
  const record = await read<FileRecord>('files', id);
  if (!record) return undefined;
  if (record instanceof Blob) return { size: record.size, type: record.type,
    slice: async (start, end) => record.slice(start, end, record.type) };
  return { size: record.size, type: record.type, slice: async (start, end) => {
    const parts: BlobPart[] = [];
    const finish = Math.min(end, record.size);
    for (let index = Math.floor(start / PART_SIZE); index * PART_SIZE < finish; index++) {
      const bytes = await read<ArrayBuffer>('chunks', `${record.prefix}:${index}`);
      if (!bytes) throw new Error('missing-file');
      parts.push(bytes.slice(Math.max(0, start - index * PART_SIZE), Math.min(bytes.byteLength, finish - index * PART_SIZE)));
    }
    return new Blob(parts, { type: record.type });
  } };
}
export async function releaseFile(id: string): Promise<void> {
  const record = await read<FileRecord>('files', id);
  await write(tx => { tx.objectStore('files').delete(id); });
  if (record && !(record instanceof Blob)) await removeChunks(record);
}
export async function removeJob(id: string): Promise<void> {
  await releaseFile(id);
  await write(tx => { tx.objectStore('jobs').delete(id); });
}
