/**
 * Episode-ref classification rules (Option D — Rail 1)
 * =====================================================
 *
 * Détermine si une URL doit être classée `episode_ref` (= lien vers un
 * épisode du podcast courant, à distinguer de liens externes / utilitaires).
 *
 * Règle composée (trois conditions cumulées) :
 *   R1. Host match      : hostname(url) === tenantWebsiteHost (sans `www.`)
 *   R2. Pas la racine   : path != '' && path != '/'
 *   R3. Pas utilitaire  : path ne matche aucun pattern utilitaire universel
 *                         (contact, about, legal, privacy, newsletter, press,
 *                          careers, 404/search, tag|category|author)
 *
 * Rationale : évite les faux positifs "URL sur le domaine du podcast" sans
 * introduire de mapping per-tenant (ex: GDIY = /podcast/..., LM = /episode/...,
 * CCG = orsomedia.io/...). Passe à l'échelle : ajouter un nouveau tenant
 * Orso/MS ne requiert AUCUNE config. Un path utilitaire manquant = 1 ligne
 * à ajouter dans UTILITY_PATH_PATTERNS.
 *
 * Enabler dette D3 (classifieur commun scrape-deep ↔ rss/extractors).
 */

/**
 * Paths utilitaires universels (case-insensitive, `^path$` ou prefix selon commentaire).
 *
 * Extension : remonter un path manquant → ajouter ici, pas dans la config
 * per-tenant. La liste reste finie et auditable.
 */
const UTILITY_PATH_PATTERNS: RegExp[] = [
  // Contact / about / legal
  /^\/contacts?\/?$/i,
  /^\/(?:about|a-propos|qui-sommes-nous|qui-suis-je)\/?$/i,
  /^\/(?:legal|mentions-legales|cgu|cgv|terms)\/?$/i,
  /^\/(?:privacy|politique-[a-z-]+|confidentialite)\/?$/i,
  // Engagement utilisateur
  /^\/(?:newsletter|subscribe|abonnement)\/?$/i,
  /^\/(?:press|presse|media-kit)\/?$/i,
  /^\/(?:careers|jobs|recrutement)\/?$/i,
  // Meta / utilitaire site
  /^\/404\/?$/i,
  /^\/search\/?$/i,
  // Listings taxonomiques (prefix match : /tag/foo, /category/bar, /author/john)
  /^\/(?:tag|tags|category|categories|author|authors)(?:\/|$)/i,
  // Listings épisodes/podcasts (sans slug derrière : /episodes/, /podcast, etc.)
  // — page index de l'archive, pas une fiche épisode. Extension R3 Rail 2.
  /^\/(?:episodes?|podcasts?)\/?$/i,
];

/**
 * Extrait {host, path} normalisés d'une URL. Retourne null si parsing échoue.
 * Host : lowercase, sans `www.`. Path : tel quel, sans query/hash.
 */
function parseUrl(url: string): { host: string; path: string } | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    return { host, path: u.pathname };
  } catch {
    return null;
  }
}

/**
 * True si le path est racine vide ou `/`.
 */
export function isRootPath(path: string): boolean {
  return path === '' || path === '/';
}

/**
 * True si le path matche un pattern utilitaire universel.
 */
export function isUtilityPath(path: string): boolean {
  for (const rx of UTILITY_PATH_PATTERNS) if (rx.test(path)) return true;
  return false;
}

/**
 * True ssi l'URL doit être classée `episode_ref` selon les 3 règles
 * (host match, non-racine, non-utilitaire).
 *
 * Renvoie false si :
 *   - `url` invalide / non parseable
 *   - `websiteHost` vide / undefined
 *   - hostname ≠ websiteHost
 *   - path racine (R2)
 *   - path utilitaire (R3)
 */
export function isEpisodeRefCandidate(url: string, websiteHost: string | undefined | null): boolean {
  if (!websiteHost) return false;
  const parsed = parseUrl(url);
  if (!parsed) return false;
  if (parsed.host !== websiteHost.toLowerCase()) return false;
  if (isRootPath(parsed.path)) return false;
  if (isUtilityPath(parsed.path)) return false;
  return true;
}

/**
 * Diagnostic helper : retourne la raison de REJECT pour instrumentation
 * dry-run (compter combien de URLs sont filtrées par R2 vs R3).
 *
 * Renvoie :
 *   'match'       — l'URL est un episode_ref candidate
 *   'host'        — host ≠ websiteHost (ou URL invalide ou host absent)
 *   'root'        — R2 : path racine
 *   'utility'     — R3 : path utilitaire
 */
export type EpisodeRefDecision = 'match' | 'host' | 'root' | 'utility';

export function classifyEpisodeRef(url: string, websiteHost: string | undefined | null): EpisodeRefDecision {
  if (!websiteHost) return 'host';
  const parsed = parseUrl(url);
  if (!parsed) return 'host';
  if (parsed.host !== websiteHost.toLowerCase()) return 'host';
  if (isRootPath(parsed.path)) return 'root';
  if (isUtilityPath(parsed.path)) return 'utility';
  return 'match';
}
