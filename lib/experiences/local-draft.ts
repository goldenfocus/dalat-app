// IndexedDB retains binary originals across refreshes and offline failures, scoped by account.
export async function localDraft<T>(
  key: string,
  value?: T,
): Promise<T | undefined> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("dalat-experience-recovery", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("drafts");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(
        "drafts",
        value === undefined ? "readonly" : "readwrite",
      );
      const store = tx.objectStore("drafts");
      const r = value === undefined ? store.get(key) : store.put(value, key);
      tx.oncomplete = () => resolve(value === undefined ? r.result : value);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function clearLocalDraft(key: string) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("dalat-experience-recovery", 1);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("drafts", "readwrite");
      tx.objectStore("drafts").delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
