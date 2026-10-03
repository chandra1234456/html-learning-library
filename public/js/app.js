// Dashboard: lists the signed-in user's pages from Firestore.
import { getDocs, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
    CATEGORIES, el, initTheme, requireUser, toast, showFlash, formatDate,
    friendlyError, confirmDialog, pagesCollection, pageDoc
} from "./common.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const $ = (id) => document.getElementById(id);

let pages = [];

initTheme();
showFlash();
requireUser(loadPages);

$("search").addEventListener("input", render);
$("category-filter").addEventListener("change", render);
$("retry-btn").addEventListener("click", loadPages);

function showOnly(...visibleIds) {
    for (const id of ["skeletons", "cards", "empty-state", "no-results", "load-error"]) {
        $(id).hidden = !visibleIds.includes(id);
    }
}

async function loadPages() {
    showOnly("skeletons"); // never show the empty state before Firestore has answered
    try {
        // Newest-updated first. Single-field orderBy needs no composite index.
        const snapshot = await getDocs(query(pagesCollection(), orderBy("updatedAt", "desc")));
        pages = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
        updateStats();
        updateCategoryFilter();
        render();
    } catch (error) {
        $("load-error-text").textContent = friendlyError(error, "Unable to load your pages.");
        showOnly("load-error");
    }
}

function updateStats() {
    const cutoff = Date.now() - WEEK_MS;
    const within = (ts) => ts?.toMillis && ts.toMillis() >= cutoff;
    $("stat-total").textContent = pages.length;
    $("stat-categories").textContent = new Set(pages.map((p) => p.category)).size;
    $("stat-added").textContent = pages.filter((p) => within(p.createdAt)).length;
    $("stat-updated").textContent = pages.filter((p) => within(p.updatedAt)).length;
}

function updateCategoryFilter() {
    const select = $("category-filter");
    const previous = select.value || "All";
    // Preset categories plus any custom ones that exist in the data.
    const custom = [...new Set(pages.map((p) => p.category))].filter((c) => c && !CATEGORIES.includes(c)).sort();
    select.replaceChildren(...["All", ...CATEGORIES, ...custom].map((name) => el("option", { value: name, text: name })));
    select.value = [...select.options].some((o) => o.value === previous) ? previous : "All";
}

function matches(page, term, category) {
    if (category !== "All" && page.category !== category) return false;
    if (!term) return true;
    const haystack = [page.title, page.description, page.category, ...(page.tags || [])].join(" ").toLowerCase();
    return haystack.includes(term);
}

function render() {
    if (pages.length === 0) return showOnly("empty-state");
    const term = $("search").value.trim().toLowerCase();
    const category = $("category-filter").value;
    const visible = pages.filter((page) => matches(page, term, category));
    if (visible.length === 0) return showOnly("no-results");
    $("cards").replaceChildren(...visible.map(buildCard));
    showOnly("cards");
}

function buildCard(page) {
    const deleteBtn = el("button", { type: "button", class: "btn btn-small btn-danger", text: "Delete" });
    deleteBtn.addEventListener("click", () => deletePage(page));

    // All user-provided text goes through textContent (via el), never innerHTML.
    return el("article", { class: "card" }, [
        el("h2", { class: "card-title", text: `📄 ${page.title}` }),
        el("span", { class: "category-badge", text: page.category || "Other" }),
        el("p", { class: "card-desc", text: page.description || "No description." }),
        el("div", { class: "tags" }, (page.tags || []).map((tag, i) => el("span", { class: `tag tag-${i % 5}`, text: `#${tag}` }))),
        el("div", { class: "card-meta", text: `Created: ${formatDate(page.createdAt)} · Updated: ${formatDate(page.updatedAt)}` }),
        el("div", { class: "card-actions" }, [
            el("a", { class: "btn btn-small btn-primary", href: `viewer.html?id=${encodeURIComponent(page.id)}`, text: "Open" }),
            el("a", { class: "btn btn-small", href: `editor.html?id=${encodeURIComponent(page.id)}`, text: "Edit" }),
            deleteBtn
        ])
    ]);
}

async function deletePage(page) {
    const confirmed = await confirmDialog({
        title: "Delete this page?",
        detail: page.title,
        message: "This action cannot be undone."
    });
    if (!confirmed) return;
    try {
        await deleteDoc(pageDoc(page.id));
        pages = pages.filter((p) => p.id !== page.id);
        updateStats();
        updateCategoryFilter();
        render();
        toast("✓ Page deleted");
    } catch (error) {
        toast(`⚠ ${friendlyError(error, "Unable to delete page. Please try again.")}`, "error");
    }
}
