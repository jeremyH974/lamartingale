/* Sillon — barre légale + bandeau cookies, partagée sur tous les frontends.
 * Phase Alpha T1.2 (29/04/2026). DRAFT — relecture avocat planifiée.
 *
 * Responsabilités :
 * - Injecte une barre fixe en bas de page avec liens /privacy + /legal + Cookies.
 * - Affiche un bandeau de consentement la première visite (localStorage).
 * - Ne pose aucun cookie, ne charge aucun script tiers.
 */
(function () {
  if (typeof document === 'undefined') return;
  if (document.body && document.body.dataset.legalBarInjected === '1') return;

  var STORAGE_KEY = 'sillon-cookies-consent-v1';

  var styles = [
    '.sillon-legal-bar{position:fixed;bottom:0;left:0;right:0;z-index:90;',
    'background:rgba(10,10,10,0.92);backdrop-filter:blur(8px);',
    'border-top:1px solid rgba(255,255,255,0.06);',
    'padding:8px 16px;font-size:11px;color:#7a7a7a;',
    'display:flex;justify-content:center;gap:18px;flex-wrap:wrap;',
    'font-family:Inter,system-ui,-apple-system,sans-serif;letter-spacing:0.02em}',
    '.sillon-legal-bar a,.sillon-legal-bar button{color:#b5b5b5;text-decoration:none;',
    'background:none;border:none;cursor:pointer;font:inherit;padding:0}',
    '.sillon-legal-bar a:hover,.sillon-legal-bar button:hover{color:#00F5A0}',
    '.sillon-legal-bar .sep{color:#3a3a3a}',
    '.sillon-cookie-banner{position:fixed;bottom:36px;right:16px;z-index:95;',
    'max-width:380px;background:#141414;border:1px solid #262626;border-radius:10px;',
    'padding:16px 18px;font-size:13px;color:#b5b5b5;line-height:1.5;',
    'box-shadow:0 12px 40px rgba(0,0,0,0.5);',
    'font-family:Inter,system-ui,-apple-system,sans-serif}',
    '.sillon-cookie-banner h4{font-size:14px;color:#f5f5f5;font-weight:700;',
    'margin:0 0 8px;letter-spacing:-0.01em}',
    '.sillon-cookie-banner p{margin:0 0 12px;color:#b5b5b5;font-size:12px}',
    '.sillon-cookie-banner a{color:#00F5A0;text-decoration:underline}',
    '.sillon-cookie-banner .actions{display:flex;gap:8px;justify-content:flex-end}',
    '.sillon-cookie-banner button{padding:7px 14px;border-radius:99px;',
    'border:1px solid #262626;background:transparent;color:#b5b5b5;',
    'font-size:12px;font-weight:600;cursor:pointer;font:inherit}',
    '.sillon-cookie-banner button.primary{background:#00F5A0;color:#0a0a0a;',
    'border-color:#00F5A0}',
    '.sillon-cookie-banner button:hover{border-color:#00F5A0;color:#00F5A0}',
    '.sillon-cookie-banner button.primary:hover{filter:brightness(1.08);color:#0a0a0a}',
    '@media(max-width:520px){.sillon-cookie-banner{left:12px;right:12px;max-width:none;bottom:48px}}'
  ].join('');

  var style = document.createElement('style');
  style.id = 'sillon-legal-bar-styles';
  style.textContent = styles;
  document.head.appendChild(style);

  var bar = document.createElement('div');
  bar.className = 'sillon-legal-bar';
  bar.setAttribute('role', 'contentinfo');
  bar.innerHTML = [
    '<a href="/privacy">Politique de confidentialité</a>',
    '<span class="sep">·</span>',
    '<a href="/legal">Mentions légales</a>',
    '<span class="sep">·</span>',
    '<button type="button" data-sillon-action="cookies">Cookies</button>'
  ].join('');
  document.body.appendChild(bar);
  document.body.dataset.legalBarInjected = '1';
  // marge basse pour éviter de masquer du contenu
  if (!document.body.style.paddingBottom) {
    document.body.style.paddingBottom = '48px';
  }

  function showBanner() {
    if (document.querySelector('.sillon-cookie-banner')) return;
    var banner = document.createElement('div');
    banner.className = 'sillon-cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Information cookies');
    banner.innerHTML = [
      '<h4>Cookies</h4>',
      '<p>Sillon utilise un unique cookie fonctionnel (<code>hub_session</code>) ',
      'nécessaire à l\'authentification de la preview pilote. Aucun cookie ',
      'publicitaire ni analytique. Détails dans la ',
      '<a href="/privacy">politique de confidentialité</a>.</p>',
      '<div class="actions">',
      '<button type="button" data-sillon-action="dismiss">J\'ai compris</button>',
      '</div>'
    ].join('');
    document.body.appendChild(banner);
  }

  function dismissBanner() {
    var banner = document.querySelector('.sillon-cookie-banner');
    if (banner) banner.parentNode.removeChild(banner);
    try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch (e) { /* ignore */ }
  }

  bar.addEventListener('click', function (ev) {
    var t = ev.target;
    if (t && t.getAttribute && t.getAttribute('data-sillon-action') === 'cookies') {
      ev.preventDefault();
      showBanner();
    }
  });

  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (t && t.getAttribute && t.getAttribute('data-sillon-action') === 'dismiss') {
      dismissBanner();
    }
  });

  // Première visite : afficher le bandeau (info seulement, pas un consent obligatoire
  // puisque seul un cookie strictement nécessaire est posé). Respect art. 82 LIL.
  try {
    if (!localStorage.getItem(STORAGE_KEY)) {
      // attendre 600 ms pour ne pas interférer avec le rendu initial
      setTimeout(showBanner, 600);
    }
  } catch (e) { /* localStorage indisponible — on n'affiche rien */ }
})();
