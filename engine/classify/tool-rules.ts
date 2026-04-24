/**
 * Tool-domain classification rules (D3 — étape 1)
 * ================================================
 *
 * Détermine si une URL pointe vers un **outil** (plateforme SaaS, broker,
 * crypto exchange, service productivité) plutôt qu'une simple ressource.
 *
 * Fusionne les 2 listes historiquement divergentes :
 *   - `engine/scraping/scrape-deep.ts`   — focus fintech (LM)
 *   - `engine/scraping/rss/extractors.ts` — focus SaaS / productivité
 *
 * L'union est utilisée par les deux call sites, ce qui remonte le signal
 * `link_type='tool'` pour les tenants non-fintech (GDIY/LP/PP/CCG) qui
 * citent souvent notion/airtable/figma/stripe sans être fintech.
 *
 * Pour étendre : ajouter un domaine dans `TOOL_DOMAIN_HOSTS` (match sur
 * hostname `.includes(substring)`), ou dans `TOOL_DOMAIN_REGEX` (match
 * sur l'URL complète — utile pour paths spécifiques `/app/…`).
 */

/** Substrings matchés contre hostname normalisé (sans `www.`, lowercase). */
export const TOOL_DOMAIN_HOSTS: string[] = [
  // --- Fintech / brokers / banques néo (ex-scrape-deep TOOL_DOMAINS) ---
  'trade-republic.com', 'boursorama.com', 'degiro.com',
  'saxoinvestor.fr', 'saxo.com',
  'fortuneo.fr', 'interactivebrokers', 'revolut.com', 'n26.com',
  'binance.com', 'coinbase.com', 'kraken.com', 'etoro.com', 'bitpanda.com',
  'yomoni.fr', 'nalo.fr', 'goodvest.fr', 'ramify.fr', 'cashbee.fr',
  'bourse-direct.fr', 'tradingview.com', 'morningstar.fr', 'quantalys.com',
  'ledger.com', 'metamask.io', 'linxea.com', 'meilleurtaux.com',
  'moneyvox.fr', 'amf-france.org', 'service-public.fr', 'impots.gouv.fr',

  // --- SaaS / productivité / dev / marketing (ex-rss/extractors TOOL_DOMAINS) ---
  'notion.so', 'airtable.com', 'figma.com', 'github.com',
  'stripe.com', 'typeform.com', 'mailchimp.com', 'hubspot.com',
];

/**
 * Retourne true si l'hostname correspond à un domaine outil connu.
 * @param host hostname normalisé sans `www.`, en lowercase — ex: "trade-republic.com"
 */
export function isToolDomain(host: string): boolean {
  if (!host) return false;
  const h = host.toLowerCase().replace(/^www\./, '');
  return TOOL_DOMAIN_HOSTS.some(d => h.includes(d));
}

/**
 * Variante sur URL complète — extrait hostname puis délègue à `isToolDomain`.
 * Safe : retourne false si URL non parsable.
 */
export function isToolUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return isToolDomain(u.hostname);
  } catch {
    return false;
  }
}
