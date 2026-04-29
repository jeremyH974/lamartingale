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

---

## Dette TS strict mode +1 erreur (détectée audit 29/04)

Baseline mise à jour de 13 → **14 erreurs** depuis le 27/04.

Nouvelle erreur :

- `engine/__tests__/output-formatters.test.ts:131` : TS2345 — `Buffer<ArrayBufferLike>` incompatible avec `Buffer` (typage Node 24 / `Symbol.toStringTag` divergent).

**Impact** : aucun en dev (`npm test` reste vert). Bloquant CI `tsc` strict.

**À fixer** : ~10 min (cast explicite ou helper `Buffer.from(buf as any)`).

**Status** : OPEN. Détectée audit Phase Alpha 29/04. Baseline gelée à 14 erreurs jusqu'à fin Phase Alpha.

---

## Google Fonts self-hosting (détectée Phase Alpha T1.2 — 29/04)

Tous les frontends (`v2.html`, `hub.html`, `episode.html`, `v2-dashboard.html`, `guest-brief.html`, `login.html`, `login-soon.html`, `privacy.html`, `legal.html`) chargent **Inter** et/ou **Poppins** depuis `fonts.googleapis.com` + `fonts.gstatic.com`.

**Risque RGPD** : ce chargement transmet l'adresse IP du visiteur à Google LLC, qui agit comme responsable de traitement indépendant. La <em>Landgericht München I</em> a jugé le 20 janvier 2022 (affaire 3 O 17493/20) que ce transfert nécessite une base juridique distincte (consentement explicite ou intérêt légitime documenté avec balance test). À défaut, dommages-intérêts symboliques accordés au plaignant.

**Statut actuel** : signalé dans [`/privacy`](../frontend/privacy.html) §3 comme dette identifiée. Aucun consentement explicite collecté à ce stade — la base "intérêt légitime + bandeau d'information" est plaidée temporairement.

**Migration prévue** : Phase Beta 1.

**Plan technique** :

1. Télécharger les variantes Inter (300/400/500/600/700/800/900) et Poppins (300/400/500/600/700/800) en WOFF2.
2. Stocker dans `frontend/fonts/` (servies via `@vercel/static`).
3. Remplacer le `<link rel="stylesheet" href="...googleapis...">` par un `<style>@font-face { ... }</style>` inline ou un fichier `frontend/fonts.css`.
4. Retirer `<link rel="preconnect" href="https://fonts.googleapis.com">` et `<link rel="preconnect" href="https://fonts.gstatic.com">` des 9 frontends.
5. Mettre à jour `privacy.html` §3 pour retirer la mention Google Fonts.
6. Vérifier dans les DevTools Network : aucune requête vers `*.googleapis.com` ni `*.gstatic.com`.

**Effort estimé** : 2-3 h.

**Status** : OPEN. À planifier dans Phase Beta 1 avant exposition publique élargie.
