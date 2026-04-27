# Brief Claude Code — Autonomie 2 jours sur mission Phase 1-3 (+ Phase 4 jalon)

> Démarrage : lundi 28/04/2026 matin
> Retour Jérémy : mercredi soir (relecture ~2h)
> Cadre : autonomie maximale avec disciplines strictes
> Budget Sonnet cap : $15 absolu, alerte à $10
> Master baseline : 2d0037c

## CONTEXTE

Tu reprends le projet Sillon (podcast-engine) après le merge weekend. Le brief complet de la mission est dans `docs/brief-primitives-2026-04-28.md` sur master. **Ta première action est de lire ce brief en entier.** Il contient toute la spec technique (5 primitives, 3 engagements, lensClassificationAgent, lens registry, 4 épisodes pilote, etc.).

Ce brief-ci ne réécrit PAS la spec. Il définit les règles d'autonomie pendant les 2 jours où Jérémy est absent.

## RÈGLES D'AUTONOMIE — LE CADRE

### Règle 1 — Périmètre autorisé en autonomie

Tu peux livrer en autonomie sans interrupting Jérémy :
- Phase 1 (5 primitives) — environ 1.5 jour
- Phase 2 (engagements architecturaux 1+2+3) — environ 0.5 jour
- Phase 3 (lensClassificationAgent V1) — environ 1 jour
- Phase 4 (jalon calibration 9 lens-épisode) — environ 0.5 jour

Au-delà de Phase 4, l'auto-continuation dépend du verdict (cf. règle 6).

### Règle 2 — Cap budget Sonnet strict

Budget cumulé sur les 2 jours : **$15 maximum**.

Tu logues le coût Sonnet de chaque appel dans un fichier `experiments/autonomy-session-2026-04-28/costs.log`. Format ligne :
```
[ISO-timestamp] [phase] [primitive_or_agent] [input_tokens] [output_tokens] [cost_usd] [cumulative_usd]
```

Seuils d'alerte automatique :
- À $5 cumulés : tu notes dans le doc session "alerte 33% budget"
- À $10 cumulés : tu **STOP**, tu fais un point intermédiaire (cf. règle 4 sur les STOPs autonomes), et tu attends 30 min avant de continuer (laisse à Jérémy une fenêtre potentielle de check)
- À $13 cumulés : tu **STOP définitif** jusqu'au retour Jérémy. Pas d'auto-resume au-delà.

Discipline tokens à appliquer dans tous les prompts Sonnet :
- Pas de "you are an expert..." inutile (direct au contrat)
- Pas de exemples few-shot longs si mock-validable
- Sortie JSON strict (parsable directement, pas de prose)
- Système prompt < 500 tokens si possible

### Règle 3 — Discipline anti-blocage (stratégie α stricte)

**Tu STOP dès qu'un blocage dépasse 30 min sans solution documentable.**

Définition d'un blocage :
- Une erreur que tu ne sais pas diagnostiquer après 30 min
- Un test rouge introduit que tu ne sais pas fixer après 30 min
- Un comportement Sonnet inattendu (hallucinations massives, refus, etc.) après 2 itérations de prompt
- Une migration DB qui échoue et dont tu ne maîtrises pas le rollback
- Toute situation où tu sens que continuer risque d'introduire de la dette technique non-réversible

Procédure de STOP sur blocage :
1. Tu rédiges un STOP intermédiaire (cf. règle 4)
2. Tu n'essaies PAS de workaround créatif au-delà des 30 min initiales
3. Tu attends Jérémy (qui peut prendre jusqu'à 2 jours)
4. Tu utilises ce temps pour documenter proprement l'état atteint, pas pour expérimenter

### Règle 4 — Format STOP intermédiaire (auto-continue ou attente)

Tous tes STOPs (planifiés ou sur blocage) suivent ce format :

```markdown
# STOP Phase X — [type : auto-continue | attente Jérémy]
[ISO-timestamp]

## Statut
- Phase actuelle : X
- Phases livrées avant : [liste]
- Tests : N/M verts (delta depuis baseline 335 : +X)
- Cost Sonnet cumulé : $X.XX / $15.00 budget
- Régression introduite : oui / non

## Ce qui a été livré
[Liste des artefacts concrets : fichiers créés, tables DB, agents, etc.]

## Ce qui reste à livrer dans cette phase
[Si auto-continue : ce qui sera fait avant le prochain STOP. Si STOP attente : ce qui ne peut pas être fait sans validation.]

## Décision et raison
[Si auto-continue : "tous critères verts, je continue Phase X+1". 
Si STOP attente : "blocage sur Y, j'ai tenté Z et W sans succès, j'attends Jérémy."]

## Verdict qualité auto-évalué (si applicable)
[Note 1-10 par livrable + rationale courte]

## Findings nouveaux
[Si quelque chose d'inattendu a émergé pendant cette phase]

## Pour Jérémy au retour
[Action attendue : "fermer ce STOP en validant", "décider sur point X", "rebriefer si Y"]
```

Ces STOPs sont écrits dans `experiments/autonomy-session-2026-04-28/stops/phase-X-stop.md` (ne pas commiter, sandbox gitignored).

### Règle 5 — STOPs intermédiaires planifiés vs auto-continue

| Position | Type STOP | Décision auto |
|---|---|---|
| Après Phase 1 (primitives) | Intermédiaire | Auto-continue Phase 2 si tests verts + budget OK |
| Après Phase 2 (engagements) | Intermédiaire | Auto-continue Phase 3 si tests verts + budget OK |
| Après Phase 3 (V1 lensClassificationAgent) | Intermédiaire | Auto-continue Phase 4 (jalon calibration) si Sonnet répond cohérent sur 1 test préliminaire |
| **Après Phase 4 (jalon calibration)** | **Décision conditionnelle** | **Cf. règle 6** |

Tous les STOPs intermédiaires sont écrits MAIS Claude Code continue automatiquement si critères verts. Jérémy les lira mercredi soir comme un journal.

### Règle 6 — Décision Phase 4 → Phase 5

À la fin de Phase 4 (jalon calibration 9 lens-épisode), tu calcules le verdict :

**Si ≥ 6/9 lens-épisode à 7+/10** :
- Tu **continues automatiquement Phase 5** (livrables Pack 2 reframed)
- Tu écris un STOP "Phase 4 PASS, auto-continue Phase 5"
- Cap : tu ne livres au plus qu'1 épisode complet en Phase 5 (1 sur 4) avant le retour Jérémy. Tu choisis GDIY #266 Plais comme épisode test (le plus représentatif).

**Si < 6/9 lens-épisode à 7+/10** :
- Tu **STOP définitif** et attends Jérémy
- Tu écris un STOP "Phase 4 FAIL, attente recalibrage stratégique"
- Tu utilises le temps d'attente pour documenter les patterns de fail observés (lesquelles lens, sur quels segments, hypothèses sur la cause)

### Règle 7 — Documentation lisible non-tech (niveau modéré)

**Pour chaque phase livrée**, tu produis 1 document dans `docs/session-2026-04-28/` :

- `docs/session-2026-04-28/phase-1-primitives.md` (rédigé après livraison Phase 1)
- `docs/session-2026-04-28/phase-2-engagements.md`
- `docs/session-2026-04-28/phase-3-lens-agent.md`
- `docs/session-2026-04-28/phase-4-calibration.md`
- (`docs/session-2026-04-28/phase-5-livrables.md` si Phase 5 atteinte)

Format de chaque doc (cible 1-2 pages) :

```markdown
# Phase X — Titre lisible
*Livré le 2026-04-XX, durée Y heures, coût Sonnet $Z*

## Ce qui a été construit (en 3 phrases pour non-tech)
[Description simple. Stefani ou Christofer pourrait lire et comprendre.
Pas de jargon. Pas d'acronymes non-expliqués.]

## Ce que ça permet de faire
[3-5 cas d'usage concrets en français normal]

## Comment c'est testé
[Ce qu'on a vérifié, en français normal. Pas "21 unit tests assert that..."
mais "On a vérifié 21 cas pour s'assurer que ça marche, dont X, Y, Z"]

## Limites actuelles connues
[Honnêteté. Ce que cette phase NE fait PAS encore.]

## Pour les développeurs (annexe technique)
- Fichiers créés : [liste]
- Tests ajoutés : [N nouveaux]
- Dépendances : [si nouvelles]
- Commits : [SHAs]
```

Ces docs sont commités au fur et à mesure (pas attendre la fin). Bon pour traçabilité Git si Jérémy lit dans n'importe quel ordre.

### Règle 8 — Discipline commits

Format commit messages :
- Préfixe : `feat:` / `fix:` / `chore:` / `docs:` / `refactor:`
- Scope : `(architecture)` / `(primitives)` / `(agents)` / `(pipelines)` / `(client-config)` / etc.
- Description : claire, en anglais, < 72 chars sur la première ligne
- Body : si nécessaire, expliquer le "why" (pas le "what" qui est dans le diff)

Tu push après chaque commit (pas de batch). Cela garantit que si tu plantes en cours, Jérémy retrouve l'état au dernier push.

### Règle 9 — Limites strictes (cf. brief original) + ajouts

Du brief original (`docs/brief-primitives-2026-04-28.md`) :
- Pas de modification de `cross_podcast_guests`
- Pas de modification de l'auth middleware
- Pas de touch aux frontends (`engine/api/` uniquement)
- Pas d'ajout de dépendance npm non validée (zod 4.3.6 déjà OK)
- Pas de migration SQL non-additive
- Cap budget Sonnet ~$30 sur ensemble pilote (réduit à $15 pour ces 2 jours)

Ajouts spécifiques à l'autonomie :
- Pas de force-push sur master (jamais)
- Pas de rebase d'historique pushé
- Pas de delete de branches même archive
- Pas de modification de fichiers `.env`, `.env.example`, `.env.local` (config sensible)
- Pas de touch sur `docs/PERSONAS_ORSO.md` (référence stratégique stable)
- Pas de touch sur `docs/brief-primitives-2026-04-28.md` (référence mission stable)

### Règle 10 — Si Jérémy revient plus tôt

Il est possible que Jérémy puisse jeter un œil rapide en cours de mission. Si tu vois un message de Jérémy arriver pendant que tu travailles :

1. Tu finis le commit en cours (ne le coupe pas en milieu)
2. Tu fais un STOP intermédiaire immédiat
3. Tu lis son message et réponds
4. Tu attends sa décision avant de continuer

Cela peut survenir 0, 1, 2, ou plusieurs fois pendant les 2 jours. Pas grave.

## ORDRE D'EXÉCUTION ATTENDU

### Lundi 28/04 matin

1. **Pré-flight checks** (5 min) :
   - Lire `docs/brief-primitives-2026-04-28.md` en entier
   - Lire `docs/episode-shortlist-2026-04-27.md` (4 épisodes pilote)
   - Lire `docs/PERSONAS_ORSO.md` (calibration mentale)
   - Lire `experiments/persona-validation/REPORT.md` (verdict pivot)
   - Vérifier 7 critères pré-démarrage du brief original
   - Si tous OK : créer la sandbox `experiments/autonomy-session-2026-04-28/` et démarrer

2. **Setup session** (5 min) :
   - Créer `experiments/autonomy-session-2026-04-28/costs.log` (vide)
   - Créer `experiments/autonomy-session-2026-04-28/stops/` (dossier)
   - Créer `docs/session-2026-04-28/` sur master (vide, sera rempli au fil des phases)

3. **Démarrage Phase 1** :
   - Suivre la spec du brief original Phase 1 (5 primitives)
   - Discipline qualité 7+/10 sur commodities, 7.5+/10 sur crossReferenceEpisode
   - Tests obligatoires pour chaque primitive
   - Commit + push après chaque primitive livrée

### Mardi 29/04

- Phase 1 finie en début de journée si pas le cas lundi
- Phase 2 (engagements 1+2+3 + fix wrapper migrate-entities)
- Phase 3 (lensClassificationAgent V1)

### Mercredi 30/04 matin

- Phase 4 (jalon calibration 9 lens-épisode)
- Décision auto Phase 5 (cf. règle 6)
- Si Phase 5 démarrée : 1 épisode max (GDIY #266 Plais)

### Mercredi 30/04 soir

- Jérémy revient
- STOP final cumulé (cf. format ci-dessous)
- Attente décisions Jérémy

## STOP FINAL ATTENDU AU RETOUR JÉRÉMY

Format dans `experiments/autonomy-session-2026-04-28/FINAL-STOP.md` :

```markdown
# STOP FINAL Session Autonomie 2 jours
*Période : lundi 28/04 matin → mercredi 30/04 [heure]*

## Résumé exécutif (5 phrases pour Jérémy à la lecture rapide)
[5 phrases : ce qui est livré, ce qui n'est pas livré, qualité globale, 
budget consommé, décisions stratégiques attendues.]

## Statut détaillé par phase

### Phase 1 — Primitives
- Statut : LIVRÉ / PARTIEL / BLOQUÉ
- Détails : [...]

### Phase 2 — Engagements architecturaux
- [idem]

### Phase 3 — lensClassificationAgent V1
- [idem]

### Phase 4 — Jalon calibration
- Verdict 9 lens-épisode : N/9 à 7+/10
- Décision prise : auto-continue Phase 5 / STOP attente

### Phase 5 — Livrables (si applicable)
- [idem]

## Métriques cumulées
- Tests : N verts / M total (delta depuis baseline 335 : +X)
- Cost Sonnet cumulé : $X.XX / $15.00
- Cost Whisper cumulé : $X.XX
- Cost total session : $X.XX
- Commits cumulés : N
- Lignes de code ajoutées : ~X
- Documents lisibles non-tech créés : N

## Findings stratégiques émergents
[Si quelque chose d'important a été découvert pendant la session qui 
mérite d'être discuté avec Jérémy.]

## Dette technique introduite
[Si applicable. Format : description, criticité, action recommandée.]

## Décisions attendues de Jérémy
1. [...]
2. [...]
3. [...]

## Recommandation pour la suite
[Si Phase 5 entamée : critique du livrable Plais et recommandation 
ajustement avant 3 autres épisodes. Si Phase 4 fail : analyse des 
patterns de fail et hypothèses recalibrage.]
```

## CHECKLIST DE DÉMARRAGE

Avant de commencer Phase 1, tu confirmes (mentalement, pas dans un message) :

- [ ] J'ai lu `docs/brief-primitives-2026-04-28.md` en entier
- [ ] J'ai lu `docs/episode-shortlist-2026-04-27.md`
- [ ] J'ai lu `docs/PERSONAS_ORSO.md`
- [ ] J'ai lu `experiments/persona-validation/REPORT.md`
- [ ] Master à 2d0037c, working tree clean, tests 335/335 verts
- [ ] DATABASE_URL, ANTHROPIC_API_KEY, OPENAI_API_KEY accessibles
- [ ] Sandbox `experiments/autonomy-session-2026-04-28/` créée
- [ ] `docs/session-2026-04-28/` créé sur master
- [ ] Je comprends que je STOP à $13 cumulés ou blocage > 30 min
- [ ] Je comprends que Phase 5 est conditionnelle au verdict Phase 4 ≥ 6/9

Si tout est validé : GO Phase 1.

## NOTE FINALE — POSTURE EN AUTONOMIE

Tu es seul pendant 2 jours. Cela ne signifie pas "fais ce que tu veux", cela signifie "applique les disciplines documentées sans avoir besoin que Jérémy te les rappelle".

En cas de doute :
- Discipline > vitesse
- Sécurité repo > productivité affichée
- Honnêteté du verdict > illusion de progrès
- Documentation au fil > rattrapage en fin de session
- STOP > workaround créatif

Tu n'es pas évalué sur la quantité de phases livrées, tu es évalué sur la qualité de l'état dans lequel Jérémy retrouve son repo mercredi soir.

GO.
