# Phase 4 — Le jalon calibration (verdict FAIL, STOP attente)

*Livré le 2026-04-28, durée ~30min, coût Sonnet réel $0.042
(3 épisodes × ~5-8 segments classifiés)*

## Ce qui a été construit (en 3 phrases pour non-tech)

J'ai lancé le pipeline complet (lensClassificationAgent V1 sur les
3 épisodes pilote retenus pour le jalon : GDIY #266 Plais, La Martingale
#174 Pokémon, Finscale #107 Stoïk) et noté la qualité de chacune des
9 combinaisons (3 lens × 3 épisodes) sur une échelle 1-10. Le verdict
brut : **4 cellules sur 9 atteignent 7+/10**. Le brief autonomie demande
6 sur 9 minimum pour auto-continuer Phase 5 — **on est sous le seuil**,
donc je STOP et j'attends ta décision.

## Ce que ça a révélé

### Le bon : 4/9 cellules réussissent

- GDIY #266 Plais × Ovni-VC : la lens cible matche (Platform.sh =
  scaleup B2B européenne 140 M€), avec 3 segments classifiés.
- GDIY #266 Plais × alternative-investments : silence correct (pas
  de faux positif, c'est ce qu'on veut).
- GDIY #266 Plais × editorial-base : 1 match faible mais pertinent
  ("raisons du départ aux États-Unis").
- LM #174 Pokémon × alternative-investments : la lens cible matche
  (cartes Pokémon = marché illiquide asymétrique), 1 segment classifié,
  rationale propre.

### Le mauvais : 2 problèmes structurels

**Problème 1 — Sonnet recopie l'exemple JSON du prompt**.
Mon prompt système contient un exemple JSON pour montrer le format de
réponse attendu, et cet exemple cite spécifiquement la lens
"ovni-vc-deeptech" avec un rationale fixe ("scaleup B2B européenne
Series B+ profil Ovni Capital"). Sur LM #174 (Pokémon), Sonnet a
**recopié textuellement ce rationale** alors qu'il s'agissait de cartes
Pokémon — faux positif structurel. C'est un biais classique des LLMs
quand un exemple in-context cite trop précisément un cas réel.

**Problème 2 — L'épisode Finscale #107 n'a aucune donnée éditoriale en
BDD** : pas d'abstract, pas de chapters, pas de takeaways, pas
d'article_content. Donc 3 cellules de la matrice (toutes celles sur
Finscale) sont non-évaluables. C'est cohérent avec la dette P0#1 du
projet (deep scrape Orso pas complet sur Finscale).

### Le neutre : la cellule LM Pokémon × editorial-base

Aucun match sur la lens fallback editorial-base, ce qui est un peu
silencieux. Probablement le proxy transcript (chapters + abstract +
takeaways) ne capte pas assez de "parcours entrepreneurial" pour
matcher. À voir avec un vrai transcript Whisper.

## Décisions stratégiques attendues de toi

J'ai listé 4 questions dans `experiments/autonomy-session-2026-04-28/stops/phase-4-stop.md` :

1. **Fix prompt-leak Sonnet** : retirer l'exemple spécifique
   (option A), le rendre générique (option B), multiplier les
   exemples (option C), ajouter une consigne anti-copie (option D),
   ou cumul A+D (ma reco).

2. **Substitution Finscale** : remplacer Finscale #107 par Le Panier
   #128 Nooz (le 4e épisode pilote, gardé initialement pour Phase 6)
   ou faire un Whisper réel sur Finscale #107 (~30 min audio).

3. **Re-run du jalon après fixes** : OK pour relancer ~$0.05-0.10 ?
   Décision GO/NO-GO Phase 5 conditionnelle au re-run.

4. **Fallback si re-run aussi sous 6/9** : bascule scope discussion
   ou itération supplémentaire ?

## Discipline pendant l'attente

Selon brief autonomie règle 3 : **je n'expérimente pas de workaround
créatif**. Je ne touche plus au lensClassificationAgent ni au prompt
sans GO explicite de toi. Ce que je fais d'ici mercredi soir :
- Documenter plus en détail les 2 findings.
- Préparer le STOP final cumulé (4 phases).
- Mettre à jour la mémoire auto avec un résumé.

Si tu reviens en cours de session avec un GO sur les 4 questions
ci-dessus, je peux relancer un jalon V2 sous 30 min.

## Ce qui reste solide

Malgré le verdict FAIL, le travail des phases 1-3 reste solide et
réutilisable :
- Les 5 primitives (Phase 1) compilent et passent 89 tests.
- La table `editorial_events` est créée et propre (0 row, smoke E2E
  PASS).
- Le scoring registry (Phase 2) marche avec 5 lens enregistrées.
- L'agent lensClassificationAgent V1 (Phase 3) fonctionne **lorsqu'il
  a des données et qu'on retire l'exemple-leak**. Le re-run après fix
  prompt devrait suffire à débloquer.

Cumul Sonnet : **$0.06 / $15 budget** — large marge restante.

## Pour les développeurs (annexe technique)

- **Script de calibration** :
  `experiments/autonomy-session-2026-04-28/phase4-calibration.ts`
  (sandbox gitignored).
- **Résultats bruts** : `phase4-results.json` (sandbox gitignored).
- **Vérification table propre** : `editorial_events` count = 0
  (persistFn in-memory pendant tout le run).
- **Aucun commit code** : Phase 4 n'a écrit qu'un script de
  calibration en sandbox + ce doc + le STOP. Le code engine est
  inchangé depuis Phase 3.
