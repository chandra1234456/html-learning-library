// Dashboard: lists saved pages from Firestore.
import { deleteDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
    el, initTheme, requireUser, toast, showFlash, formatDate,
    friendlyError, confirmDialog, pagesCollection, pageDoc
} from "./common.js";
import { listPages } from "./data.js";

const $ = (id) => document.getElementById(id);

let pages = [];

initTheme();
showFlash();
requireUser(() => loadPages());

$("search").addEventListener("input", render);
$("retry-btn").addEventListener("click", () => loadPages(true));
$("refresh-btn").addEventListener("click", () => loadPages(true));

function showOnly(...visibleIds) {
    for (const id of ["skeletons", "cards", "empty-state", "no-results", "load-error"]) {
        $(id).hidden = !visibleIds.includes(id);
    }
}

// force=true bypasses the cache (refresh button / retry).
async function loadPages(force = false) {
    if (force || pages.length === 0) showOnly("skeletons"); // never show the empty state before Firestore has answered
    try {
        pages = await listPages({
            force,
            // Called if a stale cache was silently refreshed from the server.
            onUpdate: (fresh) => { pages = fresh; updateCategoryFilter(); render(); }
        });
        updateCategoryFilter();
        render();
        if (force) toast("✓ Library refreshed");
    } catch (error) {
        $("load-error-text").textContent = friendlyError(error, "Unable to load your pages.");
        showOnly("load-error");
    }
}

let activeCategory = "All";

// Chips for "All" plus only the categories that actually have pages.
function updateCategoryFilter() {
    const used = [...new Set(pages.map((p) => p.category || "Other"))].sort();
    if (activeCategory !== "All" && !used.includes(activeCategory)) activeCategory = "All";
    $("category-chips").replaceChildren(...["All", ...used].map((name) => {
        const chip = el("button", { type: "button", class: "chip", "aria-pressed": String(name === activeCategory), text: name });
        chip.addEventListener("click", () => {
            activeCategory = name;
            updateCategoryFilter();
            render();
        });
        return chip;
    }));
    $("category-chips").hidden = used.length < 2;
}

function matches(page, term, category) {
    if (category !== "All" && page.category !== category) return false;
    if (!term) return true;
    const haystack = [page.title, page.description, page.category, ...(page.tags || [])].join(" ").toLowerCase();
    return haystack.includes(term);
}

function render() {
    $("page-count").textContent = pages.length ? `${pages.length} ${pages.length === 1 ? "page" : "pages"}` : "";
    if (pages.length === 0) return showOnly("empty-state");
    const term = $("search").value.trim().toLowerCase();
    const category = activeCategory;
    const visible = pages.filter((page) => matches(page, term, category));
    if (visible.length === 0) return showOnly("no-results");
    $("cards").replaceChildren(...visible.map(buildCard));
    showOnly("cards");
}

function buildCard(page) {
    const deleteBtn = el("button", { type: "button", class: "btn btn-small btn-ghost btn-danger", text: "Delete" });
    deleteBtn.addEventListener("click", () => deletePage(page));

    // All user-provided text goes through textContent (via el), never innerHTML.
    return el("article", { class: "card" }, [
        el("span", { class: "card-category", text: page.category || "Other" }),
        el("h2", { class: "card-title" }, [
            el("a", { href: `viewer.html?id=${encodeURIComponent(page.id)}`, text: page.title })
        ]),
        page.description ? el("p", { class: "card-desc", text: page.description }) : null,
        (page.tags || []).length ? el("div", { class: "tags" }, page.tags.slice(0, 5).map((tag) => el("span", { class: "tag", text: `#${tag}` }))) : null,
        el("div", { class: "card-footer" }, [
            el("span", { class: "card-meta", text: formatDate(page.updatedAt) }),
            el("div", { class: "card-actions" }, [
                el("a", { class: "btn btn-small btn-ghost", href: `editor.html?id=${encodeURIComponent(page.id)}`, text: "Edit" }),
                deleteBtn
            ])
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
        updateCategoryFilter();
        render();
        toast("✓ Page deleted");
    } catch (error) {
        toast(`⚠ ${friendlyError(error, "Unable to delete page. Please try again.")}`, "error");
    }
}
