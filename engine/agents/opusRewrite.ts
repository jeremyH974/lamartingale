/**
 * opusRewrite — Phase 5 V5 : rewrite éditorial premium via Opus 4.7.
 *
 * Déclenché par la pipeline qualityValidator quand le validateur Sonnet
 * retourne score < passThreshold (7.5). Cap dur : 2 appels Opus par
 * livrable, sinon bascule fail-safe Option B-dégradée (côté caller).
 *
 * Le prompt Opus injecte :
 * - 6 newsletters host (corpus few-shot, sans front-matter grâce à
 *   stripFrontMatter — fix F-V4-1)
 * - patterns Stefani consolidés
 * - contraintes non-négociables (blacklist host, écosystème, chiffres)
 * - données épisode (transcript points, lens, cross-refs)
 * - livrable courant + diagnostic validateur
 *
 * Structure canonique du prompt : voir
 * engine/agents/prompts/opus-rewrite-prompt-template.md.
 */

import type { LLMFn } from '@engine/primitives/types';
import type { ClientStyleCorpus } from '@engine/types/client-config';
import type {
  LivrableType,
  QualityValidationResult,
} from '@engine/agents/qualityValidator';
import type { LoadedNewsletter } from '@engine/agents/loadStyleCorpus';

export interface OpusEpisodeContext {
  episodeTitle: string;
  guestName: string;
  hostName: string;
  podcastDisplayName: string;
  /** Synthèse moments saillants du transcript (pré-extraite par L1). */
  transcriptKeyPoints: string;
  /** Résumé lens activés (par lensClassificationAgent). */
  activeLensSummary: string;
  /** Cross-refs sélectionnées (sortie L3). */
  selectedCrossRefs: string;
  /** Phrase canonique écosystème (config client). */
  ecosystemCanonicalPhrase: string;
  /** Phrase alternative éco (config client). */
  ecosystemAlternative: string;
  /** Blacklist phrases-fétiches host. */
  hostBlacklistPhrases: string[];
}

export interface OpusRewriteOptions {
  livrable: string;
  livrableType: LivrableType;
  validation: QualityValidationResult;
  iterationCount: number;
  episodeContext: OpusEpisodeContext;
  newsletters: LoadedNewsletter[];
  /** Cap longueur cible (ex: '450-700 mots'). */
  targetLength: string;
  /** Contraintes spécifiques au livrable (1-3 lignes). */
  specificConstraints: string;
  llmFn: LLMFn;
  maxTokens?: number;
  temperature?: number;
}

export function buildOpusRewritePrompt(opts: OpusRewriteOptions): string {
  const ec = opts.episodeContext;
  const newsletters = opts.newsletters
    .map((n, i) => `## EXEMPLE ${i + 1} — ${n.title} (${n.date})\n\n${n.body}`)
    .join('\n\n---\n\n');

  const blacklistList = ec.hostBlacklistPhrases.length > 0
    ? ec.hostBlacklistPhrases.map((p) => `- "${p}"`).join('\n')
    : '(aucune)';

  const issuesBlock = opts.validation.issues
    .map(
      (i) =>
        `- [${i.severity}/${i.category}] ${i.description}${i.excerpt ? ` — extrait : "${i.excerpt}"` : ''}`,
    )
    .join('\n');

  const rewriteSuggestionsBlock = opts.validation.rewriteSuggestions
    ? `# SUGGESTIONS CIBLÉES DU VALIDATEUR\n\n${opts.validation.rewriteSuggestions}\n`
    : '';

  // Phase 6 micro-fix 1 (F-V5-2) — naming explicite des cross-refs en newsletter.
  // Sonnet généralisait avec "d'autres fondateurs", on force le format nommé.
  const crossRefNamingBlock = opts.livrableType === 'newsletter'
    ? `

f) CONTRAINTE NAMING CROSS-REFS (impérative) :
Quand tu intègres les cross-références du catalogue ${ec.ecosystemCanonicalPhrase} dans la newsletter,
tu DOIS nommer chaque cross-ref par son invité + sa boîte dans le flux du
texte. Format type : "Pierre-Eric Leibovici (Daphni)", "Frédéric Mazzella
(BlaBlaCar)", "Firmin Zocchetto (PayFit)".

Tu NE DOIS PAS généraliser avec des formules comme "d'autres fondateurs",
"des invités précédents", ou "le catalogue Orso a creusé". Si la cross-ref
mérite d'être citée, elle est nommée. Sinon elle ne figure pas.

Exception : tu peux mentionner "${ec.ecosystemCanonicalPhrase}"${ec.ecosystemAlternative ? ` ou "${ec.ecosystemAlternative}"` : ''} comme référence générale en plus du naming explicite des cross-refs.`
    : '';

  return `Tu vas réécrire un livrable éditorial pour le podcast "${ec.podcastDisplayName}" hosté par ${ec.hostName}.

# CONTEXTE STRATÉGIQUE

${ec.podcastDisplayName} est un podcast français. ${ec.hostName} écrit chaque semaine une newsletter qui présente l'épisode du moment et le situe dans l'écosystème ${ec.ecosystemCanonicalPhrase}.

Le livrable à produire est un livrable du projet "Sillon" qui automatise la production éditoriale cross-corpus pour les podcasts du même éditeur. Il doit être indistinguable d'un livrable écrit par ${ec.hostName} lui-même.

L'épisode à traiter : ${ec.episodeTitle}, avec ${ec.guestName}.

# 6 NEWSLETTERS RÉELLES ${ec.hostName.toUpperCase()} POUR T'IMPRÉGNER DU TON

${newsletters}

# PATTERNS À INTÉRIORISER

Observe les exemples ci-dessus :

1. **Phrases courtes** : 3-7 mots fréquentes. Mots isolés ("Génie." / "Boom." / "Touché.") en ligne propre.
2. **Ouverture** : anecdote personnelle concrète OU constat brutal en 1 ligne. JAMAIS "Dans l'épisode X, Y aborde Z".
3. **Tension personnelle avouée** : "j'ai essayé", "je cale", "j'avais jamais pensé". Pas de posture surplombante.
4. **Diagnostic systémique** plutôt que résumé : prétexte épisode pour analyser une mécanique plus large.
5. **Rythme par paragraphes courts** séparés. Chaque idée respire.
6. **Conclusion qui transcende** : ne ferme pas, ouvre vers une réflexion plus large. Pas de question rhétorique creuse.
7. **Tutoiement implicite** : "vous" mais avec proximité ("croyez-moi", "vous allez voir").
8. **Vocabulaire** : familier-précis. Anglicismes assumés ("DCA", "single source of truth", "defocus").

# CONTRAINTES NON-NÉGOCIABLES

a) NE JAMAIS attribuer ces phrases-fétiches du host à un invité (l'invité est ${ec.guestName}, pas ${ec.hostName}) :
${blacklistList}

b) NE PAS générer de front-matter type "> Date :" "> URL :" "> Auteur :" "> Pattern tags :" en haut du livrable. C'est METADATA INTERNE, pas du contenu pour le lecteur.

c) Mentionner naturellement "${ec.ecosystemCanonicalPhrase}"${ec.ecosystemAlternative ? ` ou "${ec.ecosystemAlternative}"` : ''} puisque les cross-refs viennent du catalogue.

d) Pas de questions rhétoriques creuses en conclusion ("Quelles sont vos réflexions ?", "Et vous, qu'en pensez-vous ?").

e) Les chiffres mentionnés doivent venir du transcript (ci-dessous), pas d'inventions.${crossRefNamingBlock}

# DONNÉES ÉPISODE

## Transcript — points clés

${ec.transcriptKeyPoints}

## Lens éditoriaux activés sur cet épisode

${ec.activeLensSummary}

## Cross-références sélectionnées (du catalogue)

${ec.selectedCrossRefs}

# LIVRABLE ACTUEL À RÉÉCRIRE

Voici le livrable produit par Sonnet 4.6 avec score validateur ${opts.validation.score.toFixed(1)}/10. Sonnet n'a pas réussi à imiter ${ec.hostName} malgré ${opts.iterationCount} itération(s).

\`\`\`
${opts.livrable}
\`\`\`

# DIAGNOSTIC DU LIVRABLE ACTUEL

Issues identifiées par le validateur :

${issuesBlock}

${rewriteSuggestionsBlock}
# TA MISSION

Réécris ce livrable dans le ton et le style ${ec.hostName} (vu dans les 6 exemples).

Type de livrable : ${opts.livrableType}
Longueur cible : ${opts.targetLength}
Contraintes spécifiques : ${opts.specificConstraints}

Commence directement par le contenu (titre + corps si newsletter, structure native si cross-refs ou brief annexe). Pas de préambule, pas de métadonnées, pas de "voici le livrable réécrit :".`;
}

export async function rewriteWithOpus(opts: OpusRewriteOptions): Promise<string> {
  const prompt = buildOpusRewritePrompt(opts);
  const raw = await opts.llmFn(prompt, {
    temperature: opts.temperature ?? 0.7,
    maxTokens: opts.maxTokens ?? 2400,
  });
  return typeof raw === 'string' ? raw : String(raw);
}
