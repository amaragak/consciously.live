/**
 * Serialize a ProseMirror clipboard Slice to Markdown for text/plain copy.
 * TipTap/blog body is HTML; this only affects what lands on the clipboard.
 */

import type { Mark, Node as PMNode, Slice } from "@tiptap/pm/model";

function escapeMdPlain(text: string): string {
  // Escape characters that would flip markdown when we wrap with * / ** / [].
  return text.replace(/([\\`*_[\]#])/g, "\\$1");
}

function applyMarks(text: string, marks: readonly Mark[]): string {
  if (!text) return text;
  let out = text;
  // Innermost first so ** wraps * wraps link outer.
  const order = (name: string): number => {
    if (name === "code") return 0;
    if (name === "bold" || name === "strong") return 1;
    if (name === "italic" || name === "em") return 2;
    if (name === "subscript" || name === "superscript") return 3;
    if (name === "link") return 4;
    return 5;
  };
  const sorted = [...marks].sort(
    (a, b) => order(a.type.name) - order(b.type.name),
  );
  for (const mark of sorted) {
    switch (mark.type.name) {
      case "bold":
      case "strong":
        out = `**${out}**`;
        break;
      case "italic":
      case "em":
        out = `*${out}*`;
        break;
      case "code":
        out = `\`${out.replace(/`/g, "\\`")}\``;
        break;
      case "link": {
        const href = String(mark.attrs.href ?? "").trim();
        out = href ? `[${out}](${href})` : out;
        break;
      }
      case "subscript":
        out = `<sub>${out}</sub>`;
        break;
      case "superscript":
        out = `<sup>${out}</sup>`;
        break;
      default:
        break;
    }
  }
  return out;
}

function inlineToMarkdown(node: PMNode): string {
  if (node.isText) {
    return applyMarks(escapeMdPlain(node.text ?? ""), node.marks);
  }
  if (node.type.name === "hardBreak") {
    return "  \n";
  }
  if (node.type.name === "image" || node.type.name === "readImage") {
    const alt = String(node.attrs.alt ?? "").replace(/[[\]]/g, "");
    const src = String(node.attrs.src ?? "").trim();
    return src ? `![${alt}](${src})` : "";
  }
  let out = "";
  node.forEach((child) => {
    out += inlineToMarkdown(child);
  });
  return out;
}

function listItemBody(node: PMNode): string {
  const parts: string[] = [];
  node.forEach((child) => {
    if (child.type.name === "paragraph") {
      parts.push(inlineToMarkdown(child));
    } else if (
      child.type.name === "bulletList" ||
      child.type.name === "orderedList"
    ) {
      parts.push(blockToMarkdown(child).trimEnd());
    } else if (child.isTextblock) {
      parts.push(inlineToMarkdown(child));
    } else {
      parts.push(blockToMarkdown(child).trimEnd());
    }
  });
  return parts.filter(Boolean).join("\n");
}

function blockToMarkdown(node: PMNode): string {
  switch (node.type.name) {
    case "paragraph":
      return `${inlineToMarkdown(node)}\n\n`;
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.attrs.level) || 2));
      return `${"#".repeat(level)} ${inlineToMarkdown(node)}\n\n`;
    }
    case "blockquote": {
      const inner = blockChildren(node).trimEnd();
      if (!inner) return "> \n\n";
      return (
        inner
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n") + "\n\n"
      );
    }
    case "codeBlock": {
      const lang = String(node.attrs.language ?? "").trim();
      return `\`\`\`${lang}\n${node.textContent}\n\`\`\`\n\n`;
    }
    case "horizontalRule":
      return "---\n\n";
    case "bulletList":
      return listToMarkdown(node, false) + "\n";
    case "orderedList":
      return listToMarkdown(node, true) + "\n";
    case "listItem":
      return `${listItemBody(node)}\n`;
    case "image":
    case "readImage": {
      const alt = String(node.attrs.alt ?? "").replace(/[[\]]/g, "");
      const src = String(node.attrs.src ?? "").trim();
      return src ? `![${alt}](${src})\n\n` : "";
    }
    case "doc":
      return blockChildren(node);
    default:
      if (node.isTextblock) return `${inlineToMarkdown(node)}\n\n`;
      if (node.childCount) return blockChildren(node);
      return node.textContent ? `${node.textContent}\n\n` : "";
  }
}

function listToMarkdown(node: PMNode, ordered: boolean): string {
  const lines: string[] = [];
  let i = 0;
  node.forEach((item) => {
    i += 1;
    const body = listItemBody(item);
    const [first, ...rest] = body.split("\n");
    const bullet = ordered ? `${i}.` : "-";
    lines.push(`${bullet} ${first ?? ""}`);
    for (const line of rest) {
      lines.push(`  ${line}`);
    }
  });
  return lines.join("\n") + "\n";
}

function blockChildren(node: PMNode): string {
  let out = "";
  node.forEach((child) => {
    out += blockToMarkdown(child);
  });
  return out;
}

/** Convert a clipboard Slice to markdown (for text/plain). */
export function sliceToMarkdown(slice: Slice): string {
  const { content, openStart, openEnd } = slice;
  if (!content.size) return "";

  // Mid-block selection: fragment is open → serialize as inline / partial blocks.
  if (openStart > 0 || openEnd > 0) {
    let out = "";
    content.forEach((node) => {
      if (node.isTextblock || node.isInline || node.isText) {
        out += inlineToMarkdown(node);
      } else {
        out += blockToMarkdown(node).replace(/\n+$/, "");
      }
      // Separate sibling open blocks lightly.
      if (!node.isInline && !node.isText) out += "\n\n";
    });
    return out.replace(/\n{3,}/g, "\n\n").replace(/\s+$/u, "");
  }

  let out = "";
  content.forEach((node) => {
    out += blockToMarkdown(node);
  });
  return out.replace(/\n{3,}/g, "\n\n").replace(/\s+$/u, "");
}
