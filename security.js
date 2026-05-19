// ── XSS helpers ──────────────────────────────────────────────────────────────
function escapeHTML(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function safeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const t = url.trim();
  return /^javascript:/i.test(t) ? '' : t;
}
