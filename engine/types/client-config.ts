// ClientConfig — squelette déclaratif d'un client Sillon.
//
// Règle anti-overgeneralization :
// - Chaque section ci-dessous est imposée par le pilote Stefani (cas présent)
//   ET utile à un client podcast futur (cas roadmap : Bababam, Nouvelles
//   Écoutes, Binge Q3 2026 + verticales 2027).
// - Pas de champ multi-langue, streaming, webhooks, API publique : pas dans
//   ROADMAP_INTERNE.md à 12 mois.

import type { Lens } from './lens';

export interface ClientConfig {
  client_id: string;
  display_name: string;

  // Tenants podcast couverts par ce client. Cas présent : Stefani opère
  // 6 tenants. Cas futur : un client #2 podcast peut couvrir 1..N tenants.
  tenants: string[];

  tone_profile: ClientToneProfile;

  // Lentilles d'analyse activables selon contexte. Engagement 2 du brief
  // primitives 2026-04-28 : passage du shape ad-hoc {label, activates_when}
  // au shape Lens générique (id, type, scoring_strategy_id, parameters)
  // partagé entre clients podcast et futurs clients verticales.
  // Cf. engine/types/lens.ts.
  lenses: Lens[];

  // Sujets à ne jamais évoquer/inférer dans les outputs. Cas présent :
  // alvo-egery côté Stefani. Cas futur : chaque client a ses sujets sensibles.
  sensitive_topics: ClientSensitiveTopic[];

  // Packs livrables actifs pour ce client. Cas présent : pack-1, pack-2 pilote.
  // Cas futur : pack-3+ dans roadmap (Audio Overview, Sillon Daily P2).
  active_packs: string[];

  notification_email: string;

  pilot?: ClientPilot;
}

export interface ClientToneProfile {
  description: string;
  // Patterns à bannir explicitement à la rédaction.
  forbidden_patterns: string[];
  // Extraits de référence (vide au pilote, rempli post-discovery).
  style_examples: string[];
  /**
   * Phrases-fétiches du host à NE PAS attribuer à l'invité dans
   * extractQuotes. Mitigation pilote du gap diarization Whisper
   * (Phase 5 V1 finding F-P5-2). Optional.
   *
   * Une quote dont le `text` contient (case-insensitive substring)
   * une de ces chaînes sera REJETÉE même si elle passe le verbatim
   * guard, parce que l'attribution est probablement erronée.
   *
   * À enrichir au fil du pilote si nouvelles phrases-fétiches
   * découvertes. Solution complète post-pilote : intégrer Whisper
   * diarization (AssemblyAI / Deepgram / Whisper plugin) — cf.
   * docs/DETTE.md.
   */
  host_blacklist_phrases?: string[];

  /**
   * Vocabulaire à privilégier dans les rédactions Sillon. Phase 5 V3
   * finding : Sonnet utilise des formulations scolaires/médiocres par
   * défaut quand on lui dit juste "ton direct". Lui donner des termes
   * positifs concrets l'oriente plus efficacement que des interdictions
   * seules.
   */
  prefer_vocabulary?: string[];

  /**
   * Contraintes de style explicites (longueur phrases, transitions,
   * fin de paragraphe, opinions tranchées vs neutralité).
   */
  style_constraints?: {
    sentence_length?: string;
    tone?: string;
    transitions?: string;
    ending?: string;
  };

  /**
   * Description courte du persona-cible et de son lecteur. Injectée
   * dans les prompts éditoriaux L3/L4/L5 pour que Sonnet calibre son
   * registre.
   */
  persona_guidance?: string;

  /**
   * Corpus de style pour few-shot injection (Phase 5 V4 refonte).
   * Newsletters réelles du host servant d'exemples dans les prompts
   * L3/L4/L5, plus phrases-fétiches blacklist + signature expressions
   * + référence écosystème éditorial.
   *
   * Cf. docs/brief-phase5-v4-refonte-2026-04-30.md (Change 1).
   */
  style_corpus?: ClientStyleCorpus;
}

export interface ClientStyleCorpusNewsletter {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  url?: string;
  pattern_tags: string[];
  excerpts: string[];
  reco_format_example?: string;
}

export interface ClientStyleCorpusEcosystemReference {
  canonical_phrase: string;
  alternatives: string[];
  must_appear_in: Array<'newsletter' | 'brief-annexe' | 'cross-refs'>;
  appearance_style: string;
}

export interface ClientStyleCorpus {
  newsletters: ClientStyleCorpusNewsletter[];
  /** Phrases du host à NE JAMAIS attribuer à un invité (extension de host_blacklist_phrases). */
  host_blacklist_phrases: string[];
  /** Vocabulaire emblématique pour reconnaissance (pas pour imitation forcée). */
  signature_expressions: string[];
  ecosystem_reference: ClientStyleCorpusEcosystemReference;
}

export interface ClientSensitiveTopic {
  topic: string;
  description: string;
}

export interface ClientPilot {
  is_pilot: boolean;
  pilot_episodes_target: number;
  pilot_start_date: string;  // YYYY-MM-DD
  pilot_send_target: string; // YYYY-MM-DD
}
