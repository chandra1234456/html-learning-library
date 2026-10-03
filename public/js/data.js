// Data layer with caching so the app avoids needless Firestore reads.
//
// Two cache levels:
//  1. Firestore's persistent local cache (IndexedDB, enabled in firebase-config.js)
//     keeps every document the app has loaded or written, across reloads and tabs.
//  2. A "last synced" timestamp. While it is fresh (SYNC_TTL_MS) reads are served
//     from the local cache with zero network reads. When it is stale the cached
//     data is shown immediately and refreshed from the server in the background
//     (stale-while-revalidate). Writes made by this app update the cache at once.
import {
    getDoc, getDocFromCache, getDocs, getDocsFromCache, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { pagesCollection, pageDoc } from "./common.js";

const SYNC_TTL_MS = 10 * 60 * 1000;
const SYNC_KEY = "hll-last-sync";

function lastSync() {
    try { return Number(localStorage.getItem(SYNC_KEY)) || 0; } catch { return 0; }
}
function markSynced() {
    try { localStorage.setItem(SYNC_KEY, String(Date.now())); } catch { /* storage blocked */ }
}
const isFresh = () => Date.now() - lastSync() < SYNC_TTL_MS;

const listQuery = () => query(pagesCollection(), orderBy("updatedAt", "desc"));
const toPages = (snapshot) => snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));

async function fetchFromServer() {
    const snapshot = await getDocs(listQuery());
    markSynced();
    return toPages(snapshot);
}

/**
 * Returns all pages, newest-updated first.
 * @param {{force?: boolean, onUpdate?: (pages: object[]) => void}} options
 *   force: skip the cache and read from the server.
 *   onUpdate: called with fresh data when a stale cache was refreshed in the background.
 */
export async function listPages({ force = false, onUpdate } = {}) {
    if (!force) {
        try {
            const cached = await getDocsFromCache(listQuery());
            if (!cached.empty) {
                if (!isFresh()) {
                    fetchFromServer().then((pages) => onUpdate?.(pages)).catch(() => { /* keep showing cache */ });
                }
                return toPages(cached);
            }
        } catch { /* nothing cached yet — fall through to the server */ }
    }
    return fetchFromServer();
}

/**
 * Returns one page snapshot. Uses the cache while the library is freshly synced,
 * unless `fresh` is set (the editor always loads the latest version).
 */
export async function getPage(pageId, { fresh = false } = {}) {
    if (!fresh && isFresh()) {
        try {
            const cached = await getDocFromCache(pageDoc(pageId));
            if (cached.exists()) return cached;
        } catch { /* not cached — go to the server */ }
    }
    return getDoc(pageDoc(pageId));
}
