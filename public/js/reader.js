// Reader: paste an article URL, read it in a clean layout (or in a web view).
//
// Most sites (Medium included) forbid being embedded in other pages and block
// cross-origin fetches, so a static app can't load them directly. The article
// text is fetched through the free r.jina.ai reader service, which returns the
// page as Markdown; markdown.js then renders it safely.
import { setDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { el, initTheme, requireUser, toast, friendlyError, formatDate, articleDoc, confirmDialog } from "./common.js";
import { listArticles } from "./data.js";
import { renderMarkdown } from "./markdown.js";

const $ = (id) => document.getElementById(id);
const READER_ENDPOINT = "https://r.jina.ai/";
const PREFS_KEY = "hll-reader-prefs";
const FETCH_TIMEOUT_MS = 40000;

let currentUrl = "";
let webFrameLoaded = false;
let prefs = { size: 1.1, serif: false, full: true };
let saved = [];

initTheme();

/* ---------- Storage helpers (may be blocked in private mode) ---------- */
const readJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } };

function init() {
    prefs = { ...prefs, ...readJson(PREFS_KEY, {}) };
    applyPrefs();
    loadSaved();

    $("url-form").addEventListener("submit", (event) => {
        event.preventDefault();
        openArticle($("url-input").value);
    });
    $("error-retry").addEventListener("click", () => openArticle(currentUrl));

    $("font-up").addEventListener("click", () => changeSize(0.08));
    $("font-down").addEventListener("click", () => changeSize(-0.08));
    $("width-toggle").addEventListener("click", () => { prefs.full = !prefs.full; applyPrefs(); });
    $("toggle-saved").addEventListener("click", toggleSaved);
    $("font-toggle").addEventListener("click", () => { prefs.serif = !prefs.serif; applyPrefs(); });
    $("copy-link").addEventListener("click", copyShareLink);
    setupTabs();

    // Deep link: reader.html?url=https://...
    const initial = new URLSearchParams(location.search).get("url");
    if (initial) {
        $("url-input").value = initial;
        openArticle(initial);
    }
}

/* ---------- Preferences ---------- */
function changeSize(delta) {
    prefs.size = Math.min(1.6, Math.max(0.9, +(prefs.size + delta).toFixed(2)));
    applyPrefs();
}
function applyPrefs() {
    const article = $("panel-reader");
    article.style.setProperty("--reader-size", `${prefs.size}rem`);
    article.classList.toggle("serif", prefs.serif);
    article.classList.toggle("narrow", !prefs.full);
    $("width-toggle").setAttribute("aria-pressed", String(prefs.full));
    $("width-toggle").textContent = prefs.full ? "↔ Full" : "↔ Focus";
    $("font-toggle").setAttribute("aria-pressed", String(prefs.serif));
    $("font-toggle").textContent = prefs.serif ? "Sans" : "Serif";
    writeJson(PREFS_KEY, prefs);
}

/* ---------- URL handling ---------- */
function normalizeUrl(raw) {
    let text = raw.trim();
    if (!text) return null;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;
    try {
        const url = new URL(text);
        return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
    } catch {
        return null;
    }
}

function show(which) {
    $("reader-loading").hidden = which !== "loading";
    $("reader-error").hidden = which !== "error";
    $("reader-view").hidden = which !== "view";
}

/* ---------- Fetch + render ---------- */
async function openArticle(raw) {
    const url = normalizeUrl(raw);
    $("url-error").textContent = "";
    if (!url) {
        $("url-error").textContent = "Please enter a valid web address, e.g. https://example.com/article";
        $("url-input").focus();
        return;
    }
    currentUrl = url;
    $("url-input").value = url;
    $("read-btn").disabled = true;
    $("error-open").href = url;
    show("loading");
    history.replaceState(null, "", `?url=${encodeURIComponent(url)}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(READER_ENDPOINT + url, { signal: controller.signal, headers: { Accept: "text/plain" } });
        if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
        const article = parseReaderResponse(await response.text(), url);
        renderArticle(article, url);
        saveArticle(url, article.title);
        show("view");
        window.scrollTo({ top: $("reader-view").offsetTop - 80, behavior: "smooth" });
    } catch (error) {
        showFetchError(error);
    } finally {
        clearTimeout(timer);
        $("read-btn").disabled = false;
    }
}

function showFetchError(error) {
    console.error(error);
    let message = "Something went wrong while loading the article.";
    if (error?.name === "AbortError") message = "The site took too long to respond.";
    else if (error?.status === 429) message = "Too many requests right now. Wait a moment and try again.";
    else if (error?.status >= 400 && error?.status < 500) message = "The site refused to share this page (it may be paywalled, private or block readers).";
    else if (error?.status >= 500) message = "The reader service is having trouble. Try again shortly.";
    else if (error?.code === "EMPTY") message = "No readable article text was found on that page.";
    else if (!navigator.onLine) message = friendlyError({ code: "unavailable" });
    $("reader-error-text").textContent = `${message} You can still open the original page.`;
    show("error");
}

// r.jina.ai answers with a small header block followed by "Markdown Content:".
function parseReaderResponse(text, url) {
    let title = "";
    let body = text;
    const marker = text.indexOf("Markdown Content:");
    if (marker !== -1) {
        const head = text.slice(0, marker);
        title = (/^Title:\s*(.*)$/m.exec(head) || [])[1] || "";
        body = text.slice(marker + "Markdown Content:".length);
    }
    body = body.trim();
    if (body.length < 80 || /^Warning:\s*Target URL returned error/i.test(text)) {
        throw Object.assign(new Error("Empty"), { code: "EMPTY" });
    }
    // The article body usually repeats the title as its first heading.
    body = body.replace(/^#\s+.*\n+/, (heading) => (heading.toLowerCase().includes(title.toLowerCase().slice(0, 25)) ? "" : heading));
    return { title: title.trim() || new URL(url).hostname, markdown: cleanMarkdown(body) };
}

// Removes page chrome that wastes space: tiny avatars, empty links, "5 min read",
// "--" separators and similar one-line boilerplate near the top.
function cleanMarkdown(markdown) {
    const text = markdown
        .replace(/!\[[^\]]*\]\(https?:\/\/[^)\s]*resize:(?:fill|fit):\d{1,2}:\d+[^)]*\)/g, "") // small avatar images first...
        .replace(/\[\s*\]\([^)]*\)/g, "");                                                    // ...then the now-empty links around them
    const boilerplate = /^\s*(\d+\s*min read|Listen|Share|Follow|Member-only story|Press enter or click to view image in full size|Open in app|Sign up|Sign in)\s*$/i;
    const bareLink = /^\s*\[?https?:\/\/\S+?\]?(\(https?:\/\/[^)]*\))?\s*$/; // a line that is only a URL (e.g. author byline link)
    const kept = text.split("\n").filter((line, index) => !/^\s*--+\s*$/.test(line) && !(index < 40 && (boilerplate.test(line) || bareLink.test(line))));
    return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function renderArticle({ title, markdown }, url) {
    document.title = `${title} – Reader`;
    $("article-title").textContent = title;
    $("article-source").textContent = new URL(url).hostname.replace(/^www\./, "");
    $("article-body").replaceChildren(renderMarkdown(markdown));
    $("open-original").href = url;

    // Reset the web view so it loads lazily for the new URL.
    webFrameLoaded = false;
    $("web-frame").replaceChildren();
    selectTab($("tab-reader"));
}

/* ---------- Tabs ---------- */
const tabs = () => [$("tab-reader"), $("tab-web")];
function selectTab(selected) {
    for (const tab of tabs()) {
        const active = tab === selected;
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
        $(tab.getAttribute("aria-controls")).hidden = !active;
    }
    $("font-up").hidden = $("font-down").hidden = $("font-toggle").hidden = selected !== $("tab-reader");
    if (selected === $("tab-web") && !webFrameLoaded) {
        webFrameLoaded = true;
        const frame = el("iframe", {
            src: currentUrl,
            title: "Web view",
            referrerpolicy: "no-referrer",
            sandbox: "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        });
        $("web-frame").replaceChildren(frame);
    }
}
function setupTabs() {
    for (const tab of tabs()) {
        tab.addEventListener("click", () => selectTab(tab));
        tab.addEventListener("keydown", (event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                const list = tabs();
                const next = list[(list.indexOf(tab) + 1) % list.length];
                selectTab(next);
                next.focus();
            }
        });
    }
}

/* ---------- Saved articles (Firestore collection "articles") ---------- */
// The document id is a hash of the URL, so reading the same article again updates one document.
async function articleId(url) {
    try {
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url));
        return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
    } catch {
        return btoa(unescape(encodeURIComponent(url))).replace(/[^a-z0-9]/gi, "").slice(0, 60); // insecure-context fallback
    }
}

async function saveArticle(url, title) {
    try {
        const id = await articleId(url);
        const existing = saved.find((item) => item.id === id);
        await setDoc(articleDoc(id), {
            url,
            title: title.slice(0, 400),
            host: new URL(url).hostname.replace(/^www\./, ""),
            savedAt: existing?.savedAt ?? serverTimestamp(), // keep the original save date
            lastReadAt: serverTimestamp()
        }, { merge: true });
        await loadSaved(true);
    } catch (error) {
        console.error(error);
        toast("⚠ Article opened, but it couldn't be saved to your list", "warning");
    }
}

async function loadSaved(force = false) {
    try {
        saved = await listArticles({ force, onUpdate: (fresh) => { saved = fresh; renderSaved(); } });
        renderSaved();
    } catch (error) {
        console.error(error); // the reader still works without the saved list
    }
}

function toggleSaved() {
    const list = $("saved-list");
    list.hidden = !list.hidden;
    $("toggle-saved").textContent = list.hidden ? "Show" : "Hide";
    $("toggle-saved").setAttribute("aria-expanded", String(!list.hidden));
}

function renderSaved() {
    $("saved").hidden = saved.length === 0;
    $("saved-count").textContent = saved.length;
    $("saved-list").replaceChildren(...saved.map((item) => {
        const open = el("button", { type: "button", class: "saved-open", title: item.url }, [
            el("span", { class: "saved-title", text: item.title || item.url }),
            el("span", { class: "saved-meta", text: `${item.host || new URL(item.url).hostname} · ${formatDate(item.lastReadAt)}` })
        ]);
        open.addEventListener("click", () => { $("url-input").value = item.url; openArticle(item.url); });
        const remove = el("button", { type: "button", class: "btn btn-small btn-ghost btn-danger saved-remove", "aria-label": `Remove ${item.title}`, text: "✕" });
        remove.addEventListener("click", () => removeArticle(item));
        return el("div", { class: "saved-item" }, [open, remove]);
    }));
}

async function removeArticle(item) {
    const ok = await confirmDialog({ title: "Remove saved article?", detail: item.title, message: "It will be removed from your saved list.", confirmLabel: "Remove" });
    if (!ok) return;
    try {
        await deleteDoc(articleDoc(item.id));
        saved = saved.filter((a) => a.id !== item.id);
        renderSaved();
        toast("✓ Article removed");
    } catch (error) {
        toast(`⚠ ${friendlyError(error, "Unable to remove article.")}`, "error");
    }
}

async function copyShareLink() {
    const link = `${location.origin}${location.pathname}?url=${encodeURIComponent(currentUrl)}`;
    try {
        await navigator.clipboard.writeText(link);
        toast("✓ Link copied");
    } catch {
        toast("⚠ Unable to copy link", "error");
    }
}

// Start last: init() uses the helpers above (const bindings must be initialised first).
requireUser(init);
