// Dashboard: lists saved pages from Firestore.
import { deleteDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
    el, initTheme, requireUser, toast, showFlash, formatDate, categoryHue,
    friendlyError, confirmDialog, pageDoc
} from "./common.js";
import { icon } from "./icons.js";
import { listPages } from "./data.js";

const $ = (id) => document.getElementById(id);

let pages = [];
let activeCategory = "All";
let animateNextRender = true; // card entrance animation only on first display, not on every keystroke

initTheme();
showFlash();

let searchTimer;
$("search").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 90); // debounce keeps typing smooth
});
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
    $("refresh-btn").disabled = true;
    try {
        pages = await listPages({
            force,
            // Called if a stale cache was silently refreshed from the server.
            onUpdate: (fresh) => { pages = fresh; updateAll(); }
        });
        animateNextRender = true;
        updateAll();
        if (force) toast("✓ Library refreshed");
    } catch (error) {
        $("load-error-text").textContent = `${friendlyError(error, "Unable to load your pages.")}${error?.code ? ` (${error.code})` : ""}`;
        showOnly("load-error");
    } finally {
        $("refresh-btn").disabled = false;
    }
}

function updateAll() {
    updateCategoryFilter();
    render();
}

/* ---------- Filter + render ---------- */
// Chips for "All" plus only the categories that actually have pages.
function updateCategoryFilter() {
    const used = [...new Set(pages.map((p) => p.category || "Other"))].sort();
    if (activeCategory !== "All" && !used.includes(activeCategory)) activeCategory = "All";
    $("category-chips").replaceChildren(...["All", ...used].map((name) => {
        const chip = el("button", {
            type: "button",
            class: name === "All" ? "chip chip-all" : "chip",
            "aria-pressed": String(name === activeCategory),
            style: name === "All" ? null : `--hue:${categoryHue(name)}`,
            text: name
        });
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
    if (category !== "All" && (page.category || "Other") !== category) return false;
    if (!term) return true;
    const haystack = [page.title, page.description, page.category, ...(page.tags || [])].join(" ").toLowerCase();
    return haystack.includes(term);
}

function render() {
    const categories = new Set(pages.map((p) => p.category || "Other")).size;
    $("page-count").textContent = pages.length
        ? `${pages.length} ${pages.length === 1 ? "page" : "pages"} · ${categories} ${categories === 1 ? "category" : "categories"}`
        : "";
    if (pages.length === 0) return showOnly("empty-state");
    const term = $("search").value.trim().toLowerCase();
    const visible = pages.filter((page) => matches(page, term, activeCategory));
    if (visible.length === 0) return showOnly("no-results");
    const grid = $("cards");
    grid.classList.toggle("animate", animateNextRender);
    animateNextRender = false;
    grid.replaceChildren(...visible.map(buildCard));
    showOnly("cards");
}

function buildCard(page, index) {
    const deleteBtn = el("button", { type: "button", class: "icon-btn icon-btn-danger", title: `Delete ${page.title}`, "aria-label": `Delete ${page.title}` }, [icon("trash", 17)]);
    deleteBtn.addEventListener("click", () => removePage(page));
    const editLink = el("a", { class: "icon-btn", href: `editor.html?id=${encodeURIComponent(page.id)}`, title: `Edit ${page.title}`, "aria-label": `Edit ${page.title}` }, [icon("edit", 17)]);

    // All user-provided text goes through textContent (via el), never innerHTML.
    return el("article", { class: "card", style: `--hue:${categoryHue(page.category || "Other")};--i:${Math.min(index, 12)}` }, [
        el("span", { class: "card-category", text: page.category || "Other" }),
        el("h2", { class: "card-title" }, [
            el("a", { href: `viewer.html?id=${encodeURIComponent(page.id)}`, text: page.title })
        ]),
        page.description ? el("p", { class: "card-desc", text: page.description }) : null,
        (page.tags || []).length ? el("div", { class: "tags" }, page.tags.slice(0, 5).map((tag) => el("span", { class: "tag", text: `#${tag}` }))) : null,
        el("div", { class: "card-footer" }, [
            el("span", { class: "card-meta", text: `Updated ${formatDate(page.updatedAt)}` }),
            el("div", { class: "card-actions" }, [editLink, deleteBtn])
        ])
    ]);
}

async function removePage(page) {
    const confirmed = await confirmDialog({
        title: "Delete this page?",
        detail: page.title,
        message: "This action cannot be undone."
    });
    if (!confirmed) return;
    try {
        await deleteDoc(pageDoc(page.id));
        pages = pages.filter((p) => p.id !== page.id);
        updateAll();
        toast("✓ Page deleted");
    } catch (error) {
        toast(`⚠ ${friendlyError(error, "Unable to delete page. Please try again.")}`, "error");
    }
}

// Start last so every binding above is initialised first.
requireUser(() => loadPages());
