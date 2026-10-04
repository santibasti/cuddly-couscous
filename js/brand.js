// Single source of truth for brand names and the official logo.
export const CLUB = 'Cattle Creek Country Club';
export const APP = 'Cattle Creek Range & Café Operations';
export const LOGIN_SUB = 'Driving Range, Café, Player Tabs, and Sales Control';
export const LOGO_SRC = 'assets/brand/cattle-creek-logo.png';

// Logo is rendered untouched; if the file is missing we fall back to a text wordmark.
export function logo(cls = '') {
  return `<span class="logo ${cls}"><img src="${LOGO_SRC}" alt="${CLUB} logo"><span class="logo-fallback">${CLUB}</span></span>`;
}

// Reveal the real logo only once it has loaded; otherwise the text wordmark stays visible.
export function syncLogos(root = document) {
  root.querySelectorAll('.logo img').forEach(img => {
    const ok = () => img.parentNode.classList.add('logo-ok');
    if (img.complete && img.naturalWidth > 0) ok(); else img.addEventListener('load', ok, { once: true });
  });
}
