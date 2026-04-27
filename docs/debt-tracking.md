# Dette technique — tracking

Fichier de suivi de la dette technique ouverte qui n'est pas déjà capturée dans
les CLAUDE.md de section ou les briefs sandbox. À distinguer de la "dette
ouverte (à investiguer)" listée dans [`CLAUDE.md`](../CLAUDE.md#dette-technique-ouverte-à-investiguer)
qui concerne le contenu BDD / pipeline ingestion.

Ici : dette **outillage / build / config** uniquement.

---

## Dette TS strict mode pre-existante (détectée Phase 7b 27/04)

`npm run build` strict échoue avec 13 erreurs pré-existantes :

- `engine/__tests__/cross-reference-episode.test.ts` : TS18048/TS2493 sur `args[0]`
- `engine/__tests__/transcribe-audio.test.ts` : TS18048/TS2493 sur `args[0]`

Pre-Phase 7a et Phase 7b (confirmé via `git stash` — les erreurs persistent
sur master `1a80846` sans aucun fichier Phase 7b appliqué).

Vitest passe en transpile, donc tests OK (`npm test` → 670/670 verts), mais
build strict KO.

**Impact** :

- Aucun en dev (vitest fonctionne)
- Bloquant si déploiement nécessitant `npm run build` strict (CI build pipeline,
  `tsc --noEmit` de validation, génération `dist/` typée)

**À fixer** : avant tout déploiement prod ou intégration CI build strict.
Estimation : **~30 min** (typage défensif sur `args[0]` — soit assertion
non-null `args[0]!`, soit guard `if (!args[0]) throw ...`).

**Status** : OPEN. Détectée 27/04 pendant Phase 7b Étape 3.
