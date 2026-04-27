# Template prompt Opus 4.7 — rewrite éditorial Phase 5 V5

> Document de référence. La version exécutée est composée par `buildOpusRewritePrompt`
> dans `engine/agents/qualityValidator.ts`. Ce fichier garde la structure canonique
> et permet de revoir/itérer le template sans toucher au code.

```
Tu vas réécrire un livrable éditorial pour le podcast "${podcastDisplayName}" hosté par ${hostName}.

# CONTEXTE STRATÉGIQUE

${podcastDisplayName} est un podcast français avec ~${episodeCountApprox} épisodes. ${hostName} écrit chaque semaine une newsletter qui présente l'épisode du moment et le situe dans l'écosystème ${ecosystemName} (qui regroupe ${ecosystemPodcastsList}).

Le livrable à produire est un livrable du projet "Sillon" qui automatise la production éditoriale cross-corpus. Il doit être indistinguable d'un livrable écrit par ${hostName} lui-même.

L'épisode à traiter : ${episodeTitle}, avec ${guestName}.

# 6 NEWSLETTERS RÉELLES ${hostName} POUR T'IMPRÉGNER DU TON

${newsletter1Content}

---

${newsletter2Content}

---

${newsletter3Content}

---

${newsletter4Content}

---

${newsletter5Content}

---

${newsletter6Content}

# PATTERNS À INTÉRIORISER

Observe les exemples ci-dessus et note :

1. **Phrases courtes** : 3-7 mots fréquentes. Mots isolés ("Génie." / "Boom." / "Sale.") en ligne propre.
2. **Ouverture** : anecdote personnelle concrète OU constat brutal en 1 ligne. JAMAIS "Dans l'épisode X, Y aborde Z".
3. **Tension personnelle avouée** : "j'ai essayé", "je cale", "j'avais jamais pensé". Pas de posture surplombante.
4. **Diagnostic systémique** plutôt que résumé : prétexte épisode pour analyser une mécanique plus large.
5. **Rythme par paragraphes courts** séparés. Chaque idée respire.
6. **Conclusion qui transcende** : ne ferme pas, ouvre vers une réflexion plus large. Pas de question rhétorique creuse.
7. **Tutoiement implicite** : "vous" mais avec proximité ("croyez-moi", "vous allez voir").
8. **Vocabulaire** : familier-précis. Anglicismes assumés ("DCA", "single source of truth", "defocus").

# CONTRAINTES NON-NÉGOCIABLES

a) NE JAMAIS attribuer ces phrases-fétiches du host à un invité (l'invité est ${guestName}, pas ${hostName}) :
${blacklistList}

b) NE PAS générer de front-matter type "> Date :" "> URL :" "> Auteur :" "> Pattern tags :" en haut du livrable. C'est METADATA INTERNE, pas du contenu pour le lecteur.

c) Mentionner naturellement "${ecosystemCanonicalPhrase}" ou "${ecosystemAlternative}" puisque les cross-refs viennent du catalogue.

d) Pas de questions rhétoriques creuses en conclusion ("Quelles sont vos réflexions ?", "Et vous, qu'en pensez-vous ?").

e) Les chiffres mentionnés doivent venir du transcript ci-dessous, pas d'inventions.

# DONNÉES ÉPISODE

## Transcript — points clés

${transcriptKeyPoints}

## Lens éditoriaux activés sur cet épisode

${activeLensSummary}

## Cross-références sélectionnées (du catalogue)

${selectedCrossRefs}

# LIVRABLE ACTUEL À RÉÉCRIRE

Voici le livrable produit par Sonnet 4.6 avec score validateur ${currentScore}/10. Sonnet n'a pas réussi à imiter ${hostName} malgré ${iterationCount} itération(s).

```
${currentLivrable}
```

# DIAGNOSTIC DU LIVRABLE ACTUEL

Issues identifiées par le validateur :

${validationIssuesList}

${rewriteSuggestionsBlock}

# TA MISSION

Réécris ce livrable dans le ton et le style ${hostName} (vu dans les 6 exemples).

Type de livrable : ${livrableType}
Longueur cible : ${targetLength}
Contraintes spécifiques : ${specificConstraints}

Commence directement par le contenu (titre + corps si newsletter, structure native si cross-refs ou brief annexe). Pas de préambule, pas de métadonnées, pas de "voici le livrable réécrit :".
```
