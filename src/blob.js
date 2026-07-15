// Blob (file) view highlighting for .hl files.
//
// GitHub's code view is a React app with virtualized lines: only the
// visible window of `div.react-file-line[data-line-number]` divs exists,
// and React recycles them as you scroll. So: parse the WHOLE file once
// (raw text lives in the #read-only-cursor-text-area overlay), pre-split
// the spans per line, then patch line divs as they mount — re-verifying
// on every mutation batch because a recycled div keeps our dataset mark
// while its line number and text change under it.
import { applySpans } from './dom.js';

const BLOB_PATH = /^\/[^/]+\/[^/]+\/blob\/.+\.hl$/;

export function createBlobHighlighter(requestSpans, opts = {}) {
  const isBlobPage = opts.isBlobPage ?? (() => BLOB_PATH.test(location.pathname));
  const root = opts.root ?? document;

  let requested = null; // text of the in-flight or satisfied request
  let fileText = null;  // text the current lineSpans were computed from
  let lineText = null;  // fileText split into lines
  let lineSpans = null; // Map<lineNumber, [{start, end, cls}]> line-relative

  // Split absolute-offset spans into per-line, line-relative spans.
  // Multi-line captures (block comments) get one segment per line.
  function splitToLines(text, spans) {
    const starts = [0];
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) === 10) starts.push(i + 1);
    }
    const map = new Map();
    let line = 0;
    for (const s of spans) { // spans arrive sorted by start
      while (line + 1 < starts.length && starts[line + 1] <= s.start) line++;
      let segStart = s.start;
      let l = line;
      while (segStart < s.end) {
        const lineEnd = l + 1 < starts.length ? starts[l + 1] - 1 : text.length;
        const segEnd = Math.min(s.end, lineEnd);
        if (segEnd > segStart) {
          let arr = map.get(l + 1);
          if (!arr) map.set(l + 1, (arr = []));
          arr.push({ start: segStart - starts[l], end: segEnd - starts[l], cls: s.cls });
        }
        segStart = l + 1 < starts.length ? starts[l + 1] : s.end;
        l++;
      }
    }
    return map;
  }

  function patch() {
    if (!lineSpans) return;
    const stats = { total: 0, patched: 0, alreadyDone: 0, noSpans: 0, textMismatch: 0 };
    for (const el of root.querySelectorAll('div.react-file-line[data-line-number]')) {
      stats.total++;
      const n = Number(el.getAttribute('data-line-number'));
      const spans = lineSpans.get(n);
      if (!spans) { stats.noSpans++; continue; }
      // Recycled/re-rendered divs: our mark survives but content moved on.
      if (el.dataset.hlhub === String(n) && el.childElementCount > 0) { stats.alreadyDone++; continue; }
      const expected = lineText[n - 1];
      if (el.textContent !== expected) { stats.textMismatch++; continue; } // not the raw line
      applySpans(el, expected, spans);
      el.dataset.hlhub = String(n);
      stats.patched++;
    }
    if (stats.patched || stats.textMismatch || !patch.logged) {
      patch.logged = true;
      console.debug('[hlhub:blob] patch:', JSON.stringify(stats));
      if (stats.total === 0) {
        // Selector matched nothing — dump what the code area actually
        // looks like so the variant is identifiable from a bug report.
        const probe =
          root.querySelector('[data-testid="code-cell"]') ??
          root.querySelector('.react-code-line-contents') ??
          root.querySelector('#read-only-cursor-text-area')?.parentElement?.parentElement;
        console.debug(
          '[hlhub:blob] no line divs; nearest candidate:',
          probe ? probe.outerHTML.slice(0, 300) : '(no code-cell/react-code markers at all)'
        );
      }
    }
  }

  async function refresh() {
    const dbg = (...a) => console.debug('[hlhub:blob]', ...a);
    if (!isBlobPage()) {
      if (fileText !== null) dbg('left blob page, state cleared');
      requested = fileText = lineText = lineSpans = null;
      return;
    }
    const ta = root.getElementById
      ? root.getElementById('read-only-cursor-text-area')
      : root.querySelector('#read-only-cursor-text-area');
    if (!ta) {
      dbg('blob page but no cursor textarea yet', location.pathname);
      return; // React app not mounted yet; a later mutation retries
    }
    const text = ta.value;
    if (text === requested) {
      if (text === fileText) patch();
      return; // request in flight; patch happens when it lands
    }
    dbg(`requesting spans for ${text.length} chars`, location.pathname);
    requested = text;
    let spans;
    try {
      spans = await requestSpans(text);
    } catch {
      requested = null; // allow retry on the next mutation (already warned)
      return;
    }
    if (requested !== text) { dbg('stale response dropped'); return; }
    fileText = text;
    lineText = text.split('\n');
    lineSpans = splitToLines(text, spans);
    dbg(`got ${spans.length} spans → ${lineSpans.size} styled lines`);
    patch();
  }

  return { refresh };
}
