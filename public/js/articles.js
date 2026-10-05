// Saved articles: lists everything opened in the Reader; clicking one reopens it there.
import { deleteDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
    el, initTheme, requireUser, toast, showFlash, formatDate, categoryHue,
    friendlyError, confirmDialog, articleDoc
} from "./common.js";
import { listArticles } from "./data.js";

const $ = (id) => document.getElementById(id);

let articles = [];
let animateNextRender = true;

initTheme();
showFlash();

let searchTimer;
$("search").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 90);
});
$("retry-btn").addEventListener("click", () => loadArticles(true));
$("refresh-btn").addEventListener("click", () => loadArticles(true));

function showOnly(...visibleIds) {
    for (const id of ["skeletons", "cards", "empty-state", "no-results", "load-error"]) {
        $(id).hidden = !visibleIds.includes(id);
    }
}

async function loadArticles(force = false) {
    if (force || articles.length === 0) showOnly("skeletons");
    $("refresh-btn").disabled = true;
    try {
        articles = await listArticles({
            force,
            onUpdate: (fresh) => { articles = fresh; render(); }
        });
        animateNextRender = true;
        render();
        if (force) toast("✓ Saved articles refreshed");
    } catch (error) {
        $("load-error-text").textContent = `${friendlyError(error, "Unable to load saved articles.")}${error?.code ? ` (${error.code})` : ""}`;
        showOnly("load-error");
    } finally {
        $("refresh-btn").disabled = false;
    }
}

function render() {
    $("article-count").textContent = articles.length ? `${articles.length} ${articles.length === 1 ? "article" : "articles"}` : "";
    if (articles.length === 0) return showOnly("empty-state");
    const term = $("search").value.trim().toLowerCase();
    const visible = articles.filter((a) => !term || [a.title, a.host, a.url].join(" ").toLowerCase().includes(term));
    if (visible.length === 0) return showOnly("no-results");
    const grid = $("cards");
    grid.classList.toggle("animate", animateNextRender);
    animateNextRender = false;
    grid.replaceChildren(...visible.map(buildCard));
    showOnly("cards");
}

const readerLink = (article) => `reader.html?url=${encodeURIComponent(article.url)}`;

function buildCard(article, index) {
    const host = article.host || new URL(article.url).hostname.replace(/^www\./, "");
    const removeBtn = el("button", { type: "button", class: "btn btn-small btn-ghost btn-danger", text: "Remove" });
    removeBtn.addEventListener("click", () => removeArticle(article));

    // User-provided text goes through textContent (via el), never innerHTML.
    return el("article", { class: "card article-card", style: `--hue:${categoryHue(host)};--i:${Math.min(index, 12)}` }, [
        el("span", { class: "card-category", text: host }),
        el("h2", { class: "card-title" }, [el("a", { href: readerLink(article), text: article.title || article.url })]),
        el("p", { class: "article-url", title: article.url, text: article.url }),
        el("div", { class: "card-footer" }, [
            el("span", { class: "card-meta", text: `Read ${formatDate(article.lastReadAt)}` }),
            el("div", { class: "card-actions" }, [
                el("a", { class: "btn btn-small btn-ghost", href: article.url, target: "_blank", rel: "noopener noreferrer", text: "Original ↗" }),
                removeBtn
            ])
        ])
    ]);
}

async function removeArticle(article) {
    const confirmed = await confirmDialog({
        title: "Remove saved article?",
        detail: article.title || article.url,
        message: "It will be removed from your saved list.",
        confirmLabel: "Remove"
    });
    if (!confirmed) return;
    try {
        await deleteDoc(articleDoc(article.id));
        articles = articles.filter((a) => a.id !== article.id);
        render();
        toast("✓ Article removed");
    } catch (error) {
        toast(`⚠ ${friendlyError(error, "Unable to remove article.")}`, "error");
    }
}

// Start last so every binding above is initialised first.
requireUser(() => loadArticles());
