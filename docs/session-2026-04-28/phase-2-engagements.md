# Phase 2 — Les 3 engagements architecturaux

*Livré le 2026-04-28, durée ~1h30, coût Sonnet $0 (Phase 2 ne consomme
pas de LLM — c'est de la DDL et des helpers de typage)*

## Ce qui a été construit (en 3 phrases pour non-tech)

Trois pierres angulaires sur lesquelles tout le reste va reposer : une
nouvelle table `editorial_events` qui peut stocker n'importe quel type
d'événement éditorial qu'on produit (moments-clés, citations,
cross-références, classifications par lens), un mécanisme de "lens"
configurable par client (le pilote Stefani-Orso a 5 lens : Ovni VC,
investissements alternatifs, DTC, insurtech B2B, et une lens fallback
générique), et un champ `beneficiary_type` qui pose les fondations pour
servir trois publics différents (créateur, audience, sponsor) sans coder
les trois modes maintenant. Le pilote n'utilise que `creator`, mais le
champ existe pour qu'on puisse étendre plus tard sans tout réécrire.

## Ce que ça permet de faire

1. **Stocker tous les événements éditoriaux dans une seule table**.
   Plus besoin de créer une table par type — ajouter un nouveau type
   d'événement (ex: "audience_match" pour la mesure d'attribution
   sponsor) ne nécessitera pas de migration.

2. **Configurer les lens éditoriales par client**. Aujourd'hui le
   pilote Stefani-Orso a 5 lens, chacune avec sa liste de concepts
   thématiques. Pour ajouter un sixième client demain, on rédige
   sa config avec ses propres lens — aucune ligne de code engine à
   modifier.

3. **Calculer un score déterministe sur chaque lens** (`concept-match-v1`)
   qui sert de baseline et de filet de secours quand Sonnet est
   indisponible. Ce n'est pas le scoring principal en V1 (c'est
   Sonnet qui scorera en Phase 3), mais cela permet de comparer
   l'IA à un baseline reproductible.

4. **Distinguer qui est le bénéficiaire d'un livrable Sillon**. Pour
   Stefani aujourd'hui, c'est `creator` (le podcasteur). Demain, ce
   sera potentiellement `audience` (auditeurs) pour la re-circulation
   de catalogue, ou `sponsor` (annonceurs) pour les pitch decks.

## Comment c'est testé

- 55 nouveaux tests unitaires automatisés couvrent la table, les
  helpers DB, le scoring registry, la stratégie de scoring, et la
  validation de pack.
- **Test de régression sur le bug du wrapper de migration** : un
  test "witness" prouve que l'ancien parseur SQL droppait le premier
  statement (`CREATE TABLE`) à cause d'un filtre mal placé. Le bug
  était silencieux depuis la création du wrapper. Le nouveau parseur
  est testé sur le contenu réel d'une migration.
- **Smoke E2E manuel** sur la chaîne complète : la primitive
  `persistEditorialEvents` insère 3 events via Postgres, on les
  relit, on filtre par lens_tag (l'index GIN fonctionne), on
  nettoie les 3 events. 0 résidu en BDD à la fin.
- La migration a été appliquée sur la DB Neon partagée et
  re-exécutée pour vérifier l'idempotence.
- Aucune régression : 469/469 → 479/479 (avec 144 nouveaux tests
  cumulés depuis baseline 335).

## Limites actuelles connues

1. La fonction `registerPilotScoringStrategies()` n'est pas encore
   appelée automatiquement quelque part. Elle sera invoquée au
   démarrage du `lensClassificationAgent` en Phase 3, ou par le
   pipeline `runPack`. Pour l'instant, elle existe et est idempotente
   — il faudra l'appeler explicitement.

2. L'algorithme `concept-match-v1` est volontairement simple
   (matching littéral après normalisation accents/casse). Un
   concept "scaleup tech B2B" ne matchera pas "scale-up tech B2B"
   (tiret). C'est intentionnel pour V1 — le scoring fin sera fait
   par Sonnet en Phase 3.

3. Les 4 autres clients podcast Orso (LM, GDIY, LP, Finscale, PP,
   CCG en sont déjà couverts par Stefani-Orso) n'ont pas encore
   leur propre config client — ils passent tous par
   `stefani-orso.config.ts`. C'est volontaire pour le pilote.

4. Le wrapper `migrate-entities.ts` a été corrigé, mais les autres
   wrappers `migrate-*.ts` (rss, tenant, etc.) n'ont pas été
   audités. Ils héritent probablement du même bug. Note ajoutée dans
   `docs/DETTE.md` : à auditer le jour où une re-application est
   nécessaire.

## Pour les développeurs (annexe technique)

- **Nouveaux fichiers** :
  - `engine/db/run-sql-file.ts` (parseur SQL + runner)
  - `engine/db/migrations/2026-04-28-create-editorial-events.sql`
  - `engine/db/migrate-editorial-events.ts`
  - `engine/db/editorial-events.ts` (helpers Postgres)
  - `engine/types/lens.ts`
  - `engine/lens/scoring-registry.ts`
  - `engine/lens/concept-match-v1.ts`
  - `engine/lens/index.ts`
  - 6 fichiers de tests dans `engine/__tests__/`

- **Fichiers modifiés** :
  - `engine/db/migrate-entities.ts` (refactoré pour utiliser runSqlFile)
  - `engine/types/client-config.ts` (ClientLens → Lens)
  - `clients/stefani-orso.config.ts` (1 lens → 5 lens)
  - `engine/pipelines/runPack.ts` (beneficiary_type field +
    validatePackDefinition)
  - `engine/__tests__/runpack-skeleton.test.ts` (mise à jour fixtures
    + 10 tests sur validatePackDefinition)
  - `engine/__tests__/client-config.test.ts` (2 tests additionnels)
  - `docs/DETTE.md` (section Phase 2 architecturale fermée)

- **Tests ajoutés** : 55 nouveaux (479/479 verts).

- **Migration DB appliquée** : la table `editorial_events` existe en
  prod Neon. 3 indexes créés (source, type, GIN sur lens_tags).
  0 row au moment de ce livrable.

- **Commits** : `01bef01` (Engagement 1) · `f81e59a` (Engagement 2) ·
  `4cfa2fe` (Engagement 3).

- **Anti-régression** : aucun test précédemment vert n'a tourné
  rouge. Aucune signature publique de fonction existante n'a changé
  (les seuls renames concernent des types — `ClientLens` → `Lens` —
  dont aucun consommateur runtime n'utilisait les champs supprimés).
