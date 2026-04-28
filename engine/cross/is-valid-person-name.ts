/**
 * Phase B3 (2026-04-28) — filtre extracté du scope local de match-guests.ts
 * et élargi pour couvrir les 30 cas de pollution identifiés en Phase B1.
 *
 * Module PUR (zero IO/DB). Importé par match-guests.ts à l'INSERT et
 * éventuellement par populate-guests.ts si besoin de filtrer en amont.
 *
 * Heuristique conservatrice : on reject TOUT ce qui ressemble à un titre
 * d'épisode ou un fragment éditorial. Quitte à perdre quelques vrais noms
 * exotiques en bordure (ex. "Madonna" mononyme reject) — ils peuvent être
 * réintroduits via cas spécial après signal Stefani.
 *
 * Sources patterns :
 * - 30 IDs supprimés en B2 (.audit-hub/deleted-cross-guests-B2.json)
 * - blocklist héritée de match-guests.ts:60 (rediff, extrait, etc.)
 * - patterns B1 grep (.audit-hub/B1-grep-pollution.ts)
 */

const BAD_NAMES = /^(rediff|extrait|excerpt|bonus|zoom|episode|hors[- ]?serie|interview|special|partenariat|replay|bande[- ]?annonce|teaser|hs)\b/i;

// Verbes interrogatifs / d'action en première position d'un titre d'épisode.
// Pattern flexible : `\b<verbe>\b` n'importe où dans la string.
const EDITORIAL_VERBS = /\b(comment|pourquoi|reprendre|reussir|réussir|construire|explorer|decouvrir|découvrir|devenir|trouver|investir|gagner|monter|lancer|creer|créer|developper|développer)\b/i;

export function isValidPersonName(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  const trimmed = String(raw).trim();
  if (!trimmed) return false;

  // Patterns historiques (match-guests.ts pré-B3)
  if (trimmed.startsWith('[') || trimmed.startsWith('#')) return false;
  if (/^\d+$/.test(trimmed)) return false;
  // ≥ 2 tokens (split sur space ou tiret) — exclut les "Madonna" mononymes
  const tokenCount = trimmed.split(/[\s\-]+/).filter(Boolean).length;
  if (tokenCount < 2) return false;
  // Premier caractère doit être une majuscule (pas particule seule)
  if (!/^[A-ZÀ-Ý]/.test(trimmed)) return false;
  if (BAD_NAMES.test(trimmed)) return false;

  // Patterns nouveaux Phase B3 (couvre les 30 cas B2)
  if (trimmed.length > 50) return false; // titres d'épisodes longs
  if (trimmed.includes(':')) return false; // "alltricks : d'un garage…"
  if (trimmed.includes('/')) return false; // "christian jorge vestiaire collective 2/2"
  if (trimmed.includes('|')) return false; // séparateur visuel rare mais bannir
  // Multiples sections "x - y - z" (≥ 2 séparateurs " - ")
  if ((trimmed.match(/\s-\s/g) || []).length >= 2) return false;
  if (EDITORIAL_VERBS.test(trimmed)) return false; // "reprendre une entreprise…"
  // Apostrophe typographique U+2019 ('). Présente dans les RSS title-extracts
  // mais quasi-jamais dans les vrais noms en DB (qui utilisent U+0027 ASCII
  // ou pas d'apostrophe). Reject global — ré-introduction possible post-pilote
  // si signal Stefani sur perte de noms valides type "D'Esposito" en U+2019.
  if (trimmed.includes('’')) return false;
  // Apostrophe terminale (couvre U+0027 ASCII, U+2018 left, U+2019 right, backtick)
  if (/['‘’`]\s*$/.test(trimmed)) return false;
  // Caractères éditoriaux ("« le risque", "» fin de citation")
  if (/[«»]/.test(trimmed)) return false;

  return true;
}
