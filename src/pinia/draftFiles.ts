// Structured cloning in IndexedDB keeps File contents out of the JSON chat history.
let connection: Promise<IDBDatabase> | undefined;
function database() {
  return connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('iovagent-chat-drafts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readDraftFiles(key: string): Promise<File[]> {
  const db = await database();
  return new Promise((resolve,reject) => {
    const read = db.transaction('files').objectStore('files').get(key);
    read.onsuccess = () => resolve(read.result || []);
    read.onerror = () => reject(read.error);
  });
}
export async function writeDraftFiles(key: string, files: File[]) {
  const db = await database();
  return new Promise<void>((resolve,reject) => {
    const tx = db.transaction('files','readwrite');
    if (files.length) tx.objectStore('files').put(files,key);
    else tx.objectStore('files').delete(key);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
}
