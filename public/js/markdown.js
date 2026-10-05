// Small, safe Markdown renderer for the reader. It builds DOM nodes with
// textContent / setAttribute only (never innerHTML), and only allows http(s)
// links and images, so untrusted article text cannot inject markup or scripts.
import { el } from "./common.js";

const SAFE_URL = /^https?:\/\//i;

// Order matters: image, link (label may contain one image), code, bold, italic.
const INLINE = new RegExp([
    String.raw`!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)`,                                              // 1 alt, 2 src
    String.raw`\[((?:[^\[\]]|!\[[^\]]*\]\([^)]*\))*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)`,                    // 3 label, 4 href
    "`([^`]+)`",                                                                                         // 5 code
    String.raw`\*\*([^*]+?)\*\*|__([^_]+?)__`,                                                          // 6/7 bold
    String.raw`\*([^*\s][^*]*?)\*`                                                                       // 8 italic
].join("|"), "g");

function appendInline(parent, text) {
    let last = 0;
    for (const m of text.matchAll(INLINE)) {
        if (m.index > last) parent.append(text.slice(last, m.index));
        last = m.index + m[0].length;

        if (m[2] !== undefined) {
            if (SAFE_URL.test(m[2])) {
                parent.append(el("img", { src: m[2], alt: m[1], loading: "lazy", referrerpolicy: "no-referrer" }));
            } else if (m[1]) {
                parent.append(m[1]);
            }
        } else if (m[4] !== undefined) {
            const label = m[3] || m[4];
            if (SAFE_URL.test(m[4])) {
                const link = el("a", { href: m[4], target: "_blank", rel: "noopener noreferrer" });
                appendInline(link, label);
                parent.append(link);
            } else {
                appendInline(parent, label);
            }
        } else if (m[5] !== undefined) {
            parent.append(el("code", { text: m[5] }));
        } else if (m[6] !== undefined || m[7] !== undefined) {
            const strong = el("strong");
            appendInline(strong, m[6] ?? m[7]);
            parent.append(strong);
        } else if (m[8] !== undefined) {
            const em = el("em");
            appendInline(em, m[8]);
            parent.append(em);
        }
    }
    if (last < text.length) parent.append(text.slice(last));
}

const splitRow = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
const isTableSeparator = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line || "");

export function renderMarkdown(markdown) {
    const root = document.createDocumentFragment();
    const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (!line.trim()) { i++; continue; }

        // Fenced code block
        if (/^\s*```/.test(line)) {
            const code = [];
            i++;
            while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
            i++;
            root.append(el("pre", {}, [el("code", { text: code.join("\n") })]));
            continue;
        }

        // Heading
        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        if (heading) {
            const node = el(`h${heading[1].length}`);
            appendInline(node, heading[2].replace(/\s+#+\s*$/, ""));
            root.append(node);
            i++;
            continue;
        }

        // Horizontal rule
        if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { root.append(el("hr")); i++; continue; }

        // Blockquote
        if (/^\s*>/.test(line)) {
            const quote = [];
            while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ""));
            const node = el("blockquote");
            node.append(renderMarkdown(quote.join("\n")));
            root.append(node);
            continue;
        }

        // Table
        if (line.includes("|") && isTableSeparator(lines[i + 1])) {
            const head = splitRow(line);
            i += 2;
            const body = [];
            while (i < lines.length && lines[i].includes("|") && lines[i].trim()) body.push(splitRow(lines[i++]));
            const cell = (tag, text) => { const c = el(tag); appendInline(c, text); return c; };
            root.append(el("div", { class: "table-wrap" }, [el("table", {}, [
                el("thead", {}, [el("tr", {}, head.map((h) => cell("th", h)))]),
                el("tbody", {}, body.map((row) => el("tr", {}, row.map((c) => cell("td", c)))))
            ])]));
            continue;
        }

        // Lists (flat; nested indentation is shown as separate items)
        const listMatch = /^\s*([-*+]|\d+[.)])\s+/.exec(line);
        if (listMatch) {
            const ordered = /\d/.test(listMatch[1]);
            const list = el(ordered ? "ol" : "ul");
            while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
                const item = el("li");
                appendInline(item, lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, ""));
                list.append(item);
                i++;
            }
            root.append(list);
            continue;
        }

        // Paragraph: gather until a blank line or another block starts
        const paragraph = [];
        while (i < lines.length && lines[i].trim()
            && !/^\s*(```|#{1,6}\s|>|([-*+]|\d+[.)])\s)/.test(lines[i])) {
            paragraph.push(lines[i++].trim());
        }
        if (paragraph.length === 0) { paragraph.push(lines[i++].trim()); }
        const p = el("p");
        appendInline(p, paragraph.join(" "));
        root.append(p);
    }
    return root;
}
