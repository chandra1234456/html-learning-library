// Data layer with caching so the app avoids needless Firestore reads.
//
// Two cache levels:
//  1. Firestore's persistent local cache (IndexedDB, enabled in firebase-config.js)
//     keeps every document the app has loaded or written, across reloads and tabs.
//  2. A "last synced" timestamp per collection. While it is fresh (SYNC_TTL_MS)
//     reads are served from the local cache with zero network reads. When it is
//     stale the cached data is shown immediately and refreshed from the server in
//     the background (stale-while-revalidate). Writes made by this app update the
//     cache at once.
import {
    getDoc, getDocFromCache, getDocs, getDocsFromCache, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { pagesCollection, pageDoc, articlesCollection } from "./common.js";

const SYNC_TTL_MS = 10 * 60 * 1000;

function lastSync(key) {
    try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; }
}
function markSynced(key) {
    try { localStorage.setItem(key, String(Date.now())); } catch { /* storage blocked */ }
}
const isFresh = (key) => Date.now() - lastSync(key) < SYNC_TTL_MS;
const toItems = (snapshot) => snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));

// Cache-first list read shared by pages and articles.
async function cachedList(buildQuery, syncKey, { force = false, onUpdate } = {}) {
    const fetchFromServer = async () => {
        const snapshot = await getDocs(buildQuery());
        markSynced(syncKey);
        return toItems(snapshot);
    };
    if (!force) {
        try {
            const cached = await getDocsFromCache(buildQuery());
            if (!cached.empty) {
                if (!isFresh(syncKey)) {
                    fetchFromServer().then((items) => onUpdate?.(items)).catch(() => { /* keep showing cache */ });
                }
                return toItems(cached);
            }
        } catch { /* nothing cached yet — fall through to the server */ }
    }
    return fetchFromServer();
}

const PAGES_KEY = "hll-last-sync";
const ARTICLES_KEY = "hll-last-sync-articles";

/** All pages, newest-updated first. force: skip cache. onUpdate: called after a background refresh. */
export function listPages(options) {
    return cachedList(() => query(pagesCollection(), orderBy("updatedAt", "desc")), PAGES_KEY, options);
}

/** All saved reader articles, most recently read first. */
export function listArticles(options) {
    return cachedList(() => query(articlesCollection(), orderBy("lastReadAt", "desc")), ARTICLES_KEY, options);
}

/**
 * One page snapshot. Uses the cache while the library is freshly synced,
 * unless `fresh` is set (the editor always loads the latest version).
 */
export async function getPage(pageId, { fresh = false } = {}) {
    if (!fresh && isFresh(PAGES_KEY)) {
        try {
            const cached = await getDocFromCache(pageDoc(pageId));
            if (cached.exists()) return cached;
        } catch { /* not cached — go to the server */ }
    }
    return getDoc(pageDoc(pageId));
}
