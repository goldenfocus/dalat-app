import type { UploadJob } from './types';

let database: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('dalat-event-uploads', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('jobs', { keyPath: 'id' });
      request.result.createObjectStore('files');
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
    const tx = db.transaction(['jobs', 'files'], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Upload could not be saved on this device'));
    action(tx);
  });
}

export async function saveJob(job: UploadJob, file?: Blob): Promise<void> {
  await write(tx => {
    tx.objectStore('jobs').put(job);
    if (file) tx.objectStore('files').put(file, job.id);
  });
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
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = db.transaction('files').objectStore('files').get(id);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function releaseFile(id: string): Promise<void> {
  await write(tx => { tx.objectStore('files').delete(id); });
}
export async function removeJob(id: string): Promise<void> {
  await write(tx => { tx.objectStore('jobs').delete(id); tx.objectStore('files').delete(id); });
}
