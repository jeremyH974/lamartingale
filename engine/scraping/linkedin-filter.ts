/**
 * LinkedIn extraction filter — utilisé par les 3 chemins qui peuplent
 * `guests.linkedin_url` :
 *   - engine/scraping/scrape-deep.ts (LM/GDIY, articles HTML)
 *   - engine/cross/match-guests.ts (denorm cross-tenant depuis episode_links)
 *   - engine/cross/populate-guests.ts (denorm per-tenant depuis episode_links)
 *
 * Logique unifiée :
 *   1. Pour chaque candidat URL, extraire le slug `/in/<slug>/`.
 *   2. Filtrer :
 *      - parasites : toujours exclure (ex: 'morganprudhomme' sur GDIY).
 *      - hosts : exclure SAUF si le `guestName` matche un nom de host
 *        (cas Stefani sur ep #297 — le host est aussi guest, on garde son
 *        propre LinkedIn).
 *   3. Sélection parmi les survivants :
 *      Priorité 1 — label match guestName (case + accents normalisés sur
 *                    prénom OU nom complet)
 *      Priorité 2 — slug match guestName (le slug contient prénom OU nom)
 *      Priorité 3 — ordre fourni (DOM order pour scrape-deep, el.id pour denorm)
 *      Sinon → null (préférable au mauvais LinkedIn).
 *
 * Pure — pas d'I/O, testable isolément.
 */

export interface LinkedinCandidate {
  url: string;
  label?: string | null;
}

export interface LinkedinExclusions {
  /** Slugs LinkedIn des hosts/co-hosts. Exclus SAUF si guest_name matche un nom de host. */
  hosts: string[];
  /** Slugs LinkedIn des parasites éditoriaux (CM, montage, crédits récurrents). Toujours exclus. */
  parasites: string[];
  /** Noms normalisés des hosts/co-hosts pour le test "host-as-guest" (ex: ['matthieu stefani']). */
  hostNames: string[];
}

export interface PickResult {
  url: string | null;
  /** Règle déclenchée pour la sélection (null si aucun candidat valide). */
  rule: 'label-match' | 'slug-match' | 'order-fallback' | 'host-as-guest' | 'none';
  /** Détails diagnostiques pour logging. */
  rejected: { url: string; reason: 'parasite' | 'host' }[];
}

/** Extrait le slug d'une URL LinkedIn `/in/<slug>/`. Lowercase. Null si pas une /in/ URL. */
export function extractLinkedinSlug(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]).toLowerCase() : null;
}

/** Normalise un nom : lowercase + sans accents + collapse spaces. */
export function normalizeName(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Le `guestName` correspond-il à un host config ?
 * Match si nom normalisé du guest contient OU est contenu dans un nom normalisé de host.
 * Ex: hostNames=['matthieu stefani'] et guestName='Matthieu Stefani' → true.
 *     hostNames=['laurent kretz'] et guestName='Kretz' → true (contient).
 */
export function isHostAsGuest(guestName: string | null | undefined, hostNames: string[]): boolean {
  const n = normalizeName(guestName);
  if (!n || n.length < 3) return false;
  for (const h of hostNames) {
    const hn = normalizeName(h);
    if (!hn) continue;
    if (n === hn) return true;
    // Match si n contient le nom complet du host OU vice-versa (1 sens minimum).
    // On évite les fragments trop courts (ex: "Le" qui matcherait tout).
    if (n.length >= 4 && hn.includes(n)) return true;
    if (hn.length >= 4 && n.includes(hn)) return true;
  }
  return false;
}

/**
 * Le label/slug d'un candidat matche-t-il le `guestName` ?
 * Match si une moitié du nom (prénom OU nom) est présente dans le texte cible.
 * Texte cible = label normalisé OU slug "déshyphené" normalisé.
 */
function nameMatchesText(guestName: string, target: string): boolean {
  const n = normalizeName(guestName);
  const t = normalizeName(target.replace(/[-_]+/g, ' '));
  if (!n || !t) return false;
  // Match exact complet
  if (t.includes(n)) return true;
  // Match sur token de nom >= 4 chars (évite "le", "la", "de" particules)
  const tokens = n.split(' ').filter(tok => tok.length >= 4);
  if (tokens.length === 0) return false;
  // Au moins un token nom doit être présent comme mot dans le texte
  // (boundary check pour éviter "luc" matchant "lucas")
  for (const tok of tokens) {
    const rx = new RegExp(`(?:^|[^a-z])${tok}(?:$|[^a-z])`);
    if (rx.test(t)) return true;
  }
  return false;
}

/**
 * Sélection principale.
 *
 * @param candidates  Candidats URL+label, ordonnés par préférence (DOM order pour
 *                    scrape-deep, el.id ASC pour denorm).
 * @param guestName   Nom de l'invité courant (pour host-as-guest + label match).
 * @param exclusions  hosts + parasites + hostNames (cf. LinkedinExclusions).
 */
export function pickGuestLinkedin(
  candidates: LinkedinCandidate[],
  guestName: string | null | undefined,
  exclusions: LinkedinExclusions,
): PickResult {
  const rejected: { url: string; reason: 'parasite' | 'host' }[] = [];
  const hostAsGuest = isHostAsGuest(guestName, exclusions.hostNames);

  // Étape 1 — filtrage exclusions
  const survivors: { cand: LinkedinCandidate; slug: string }[] = [];
  for (const c of candidates) {
    if (!c.url) continue;
    const slug = extractLinkedinSlug(c.url);
    if (!slug) continue;
    if (exclusions.parasites.includes(slug)) {
      rejected.push({ url: c.url, reason: 'parasite' });
      continue;
    }
    if (exclusions.hosts.includes(slug) && !hostAsGuest) {
      rejected.push({ url: c.url, reason: 'host' });
      continue;
    }
    survivors.push({ cand: c, slug });
  }

  if (survivors.length === 0) {
    return { url: null, rule: 'none', rejected };
  }

  // Cas spécial : host-as-guest + un host slug a survécu (ie. son LinkedIn est
  // dans la liste). Si guestName matche réellement, on PRIORISE ce candidat.
  if (hostAsGuest && guestName) {
    for (const s of survivors) {
      if (exclusions.hosts.includes(s.slug)) {
        return { url: s.cand.url, rule: 'host-as-guest', rejected };
      }
    }
  }

  // Étape 2 — Priorité 1 : label match guestName
  if (guestName) {
    for (const s of survivors) {
      if (s.cand.label && nameMatchesText(guestName, s.cand.label)) {
        return { url: s.cand.url, rule: 'label-match', rejected };
      }
    }
    // Étape 3 — Priorité 2 : slug match guestName (slug "déshyphené" contient nom)
    for (const s of survivors) {
      if (nameMatchesText(guestName, s.slug)) {
        return { url: s.cand.url, rule: 'slug-match', rejected };
      }
    }
  }

  // Étape 4 — Priorité 3 : premier survivant dans l'ordre fourni
  return { url: survivors[0].cand.url, rule: 'order-fallback', rejected };
}

/**
 * Construit un `LinkedinExclusions` complet pour un tenant donné.
 * Combine :
 *   - les slugs déduits du host + coHosts via `deriveSlugsFromName`
 *   - les `linkedinExclusions.hosts` explicites de la config (priorité, ex: 'stefani' court)
 *   - les `linkedinExclusions.parasites` explicites de la config
 *   - `hostNames` = noms du host + coHosts (pour test host-as-guest)
 */
export function buildExclusions(input: {
  hostName: string;
  coHosts?: string[];
  configHosts?: string[];
  configParasites?: string[];
}): LinkedinExclusions {
  const hostNames = [input.hostName, ...(input.coHosts || [])].filter(Boolean);
  const derivedHosts = hostNames.flatMap(deriveSlugsFromName);
  const hosts = Array.from(new Set([...(input.configHosts || []), ...derivedHosts]));
  const parasites = Array.from(new Set(input.configParasites || []));
  return {
    hosts,
    parasites,
    hostNames: hostNames.map(normalizeName),
  };
}

/**
 * Dérive des slugs LinkedIn candidats depuis un nom complet.
 * Ex: "Matthieu Stefani" → ['matthieustefani', 'matthieu-stefani', 'mstefani', 'matthieu.stefani'].
 * Heuristique fallback quand la config ne précise pas le slug officiel.
 */
export function deriveSlugsFromName(rawName: string): string[] {
  const norm = normalizeName(rawName);
  if (!norm) return [];
  const parts = norm.split(' ').filter(Boolean);
  if (parts.length === 0) return [];
  const out: string[] = [];
  const joined = parts.join('');
  const kebab = parts.join('-');
  const dotted = parts.join('.');
  out.push(joined);
  if (kebab !== joined) out.push(kebab);
  if (dotted !== joined && dotted !== kebab) out.push(dotted);
  if (parts.length >= 2) {
    // initial-prénom + nom (ex: "mstefani")
    const initialed = parts[0][0] + parts.slice(1).join('');
    if (!out.includes(initialed)) out.push(initialed);
  }
  return out;
}
