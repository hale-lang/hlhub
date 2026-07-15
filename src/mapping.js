// Map tree-sitter capture names to GitHub Primer syntax classes (pl-*).
// Using GitHub's own classes means highlighting automatically follows the
// viewer's GitHub theme (light/dark/colorblind variants) with zero CSS of ours.
//
// Primer classes for reference:
//   pl-c   comment            pl-k   keyword
//   pl-s   string             pl-c1  constant / number
//   pl-en  entity name (functions, decorators)
//   pl-smi member / self / types
//   pl-ent entity name tag    pl-v   variable
//
// null = deliberately unstyled (matches GitHub's restraint for punctuation,
// plain variables, and most operators).
const TABLE = {
  comment: 'pl-c',
  keyword: 'pl-k',
  operator: null,
  'operator.special': 'pl-k', // the `<-` bus send reads best as a keyword
  string: 'pl-s',
  'string.special': 'pl-s',
  'string.special.symbol': 'pl-ent', // bus subjects stand out like tags
  number: 'pl-c1',
  constant: 'pl-c1',
  boolean: 'pl-c1',
  function: 'pl-en',
  attribute: 'pl-en',
  type: 'pl-smi',
  variable: null,
  'variable.builtin': 'pl-smi',
  punctuation: null,
};

// Longest-dotted-prefix lookup: `keyword.exception` falls back to `keyword`,
// `function.method.call` to `function`, etc.
export function classForCapture(name) {
  let key = name;
  while (key) {
    if (key in TABLE) return TABLE[key];
    const dot = key.lastIndexOf('.');
    key = dot === -1 ? '' : key.slice(0, dot);
  }
  return null;
}
