// A code box with colour, and nothing to download for it.
//
// The two snippets on /widget are a dozen lines of HTML and one small script;
// a highlighting library is more code than the thing being highlighted. This
// tokenises just enough of both to make the shape visible: tags, attributes,
// values and strings. Anything it does not recognise stays plain, which is
// the right failure for a box whose only job is to be copied.
import type { ReactNode } from "react";

/** Attributes inside a tag: name, "=", quoted value, and the whitespace between. */
const ATTR_RE = /([^\s=]+)(=)("[^"]*"|'[^']*')|([^\s=]+)|(\s+)/g;

function tag(src: string, key: number): ReactNode {
  const m = /^(<\/?)([a-zA-Z][\w-]*)([\s\S]*?)(\/?>)$/.exec(src);
  if (!m) return <span key={key}>{src}</span>;
  const [, open, name, attrs, close] = m;
  const parts: ReactNode[] = [];
  let i = 0;
  for (const a of attrs.matchAll(ATTR_RE)) {
    if (a[1]) {
      parts.push(
        <span key={i++} className="tk-attr">{a[1]}</span>,
        <span key={i++} className="tk-p">{a[2]}</span>,
        <span key={i++} className="tk-val">{a[3]}</span>
      );
    } else if (a[4]) {
      parts.push(<span key={i++} className="tk-attr">{a[4]}</span>);
    } else {
      parts.push(a[5]);
    }
  }
  return (
    <span key={key}>
      <span className="tk-p">{open}</span>
      <span className="tk-tag">{name}</span>
      {parts}
      <span className="tk-p">{close}</span>
    </span>
  );
}

/** Script bodies: strings and a few keywords, the rest as it is. */
const JS_RE = /('[^']*'|"[^"]*")|\b(var|function|return|if|for|break|new|addEventListener)\b/g;

function script(src: string, key: number): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of src.matchAll(JS_RE)) {
    if (m.index! > last) out.push(src.slice(last, m.index));
    out.push(
      <span key={i++} className={m[1] ? "tk-val" : "tk-kw"}>
        {m[0]}
      </span>
    );
    last = m.index! + m[0].length;
  }
  if (last < src.length) out.push(src.slice(last));
  return <span key={key}>{out}</span>;
}

export function highlight(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Tags on one side, everything between them on the other. A <script> body is
  // "between" too, and is handed to the script pass instead of staying plain.
  const re = /<\/?[a-zA-Z][^>]*>/g;
  let last = 0;
  let inScript = false;
  let key = 0;
  for (const m of code.matchAll(re)) {
    const between = code.slice(last, m.index);
    if (between) out.push(inScript ? script(between, key++) : between);
    out.push(tag(m[0], key++));
    if (/^<script\b/i.test(m[0])) inScript = true;
    if (/^<\/script/i.test(m[0])) inScript = false;
    last = m.index! + m[0].length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

export default function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="wcode">
      <code>{highlight(code)}</code>
    </pre>
  );
}
