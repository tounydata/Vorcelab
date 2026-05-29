// Binds [data-panel] buttons to Vorcelab.navigate — replaces inline onclick duplication.
// Only handles pure navigation buttons. Complex/dynamic handlers stay as onclick in HTML.
// Load order: after vorcelab-global.js.

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => Vorcelab.navigate(btn.dataset.panel));
  });
});
