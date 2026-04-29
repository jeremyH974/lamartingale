# Dette technique — tracking

Fichier de suivi de la dette technique ouverte qui n'est pas déjà capturée dans
les CLAUDE.md de section ou les briefs sandbox. À distinguer de la "dette
ouverte (à investiguer)" listée dans [`CLAUDE.md`](../CLAUDE.md#dette-technique-ouverte-à-investiguer)
qui concerne le contenu BDD / pipeline ingestion.

Ici : dette **outillage / build / config** uniquement.

---

## finscale.cross_podcast_ref — diagnostic T2.3 (29/04 PM, deferred S4/Beta 1)

**Statut** : OPEN, deferred S4/Beta 1. Diagnostic clair, fix non-trivial.

### Contexte

L'audit du 29/04 matin (`docs/audit-2026-04-29.md` §Bugs détectés #2) avait remonté :

> **`finscale.cross_refs` peuplé à 2 %** (8/338 vs ~100 % ailleurs).
> Criticité : moyenne (graph cross-refs incomplet).

T2.3 a investigué et remonté que ce constat est un **faux positif** :

1. Les **8 finscale `cross_refs` JSONB peuplés** ne sont PAS des cross-références éditoriales. Ce sont des artefacts du parser RSS qui ont catché le footer `audiomeans.fr/politique-de-confidentialite` (présent dans la description RSS de chaque épisode) comme `episode_ref`. Les autres tenants (gdiy, lamartingale, etc.) ont la **MÊME pollution** sur leurs 3 premiers épisodes — visible via query DB.
2. Les **clés JSONB sont identiques** entre finscale et les autres : `{podcast, url, episode_ref}`.
3. Les **cross_refs JSONB ne sont PAS la source de vérité éditoriale.** C'est un legacy parser. La vraie source de vérité = table `episode_links.link_type='cross_podcast_ref'`.

### Vraie anomalie identifiée

`episode_links.link_type='cross_podcast_ref'` par tenant :

| tenant | cross_podcast_ref count |
|---|---|
| gdiy | 992 |
| lepanier | 845 |
| lamartingale | 788 |
| passionpatrimoine | 195 |
| combiencagagne | 104 |
| **finscale** | **4** ← anomalie réelle |

Finscale a 338 ép. donc devrait avoir ~200-300 cross_podcast_ref attendus (par extrapolation des autres tenants). Il en a 4. **Déficit de ~200-300 entrées**.

### Root cause hypothèses (à confirmer en S4/Beta 1)

1. **Pipeline classify-predefined non-couvrant** : `engine/ai/classify-predefined.ts` reclassifie les liens `episode_links` selon des patterns (URL contenant nom d'autre podcast MS, etc.). Possible que les patterns de détection cross-podcast manquent les variantes finscale (ex: `finscale.fr` n'est pas dans la liste cible si on cherche `gdiy.fr`).
2. **Scrape finscale incomplet** : possible que `scrape-deep` n'ait pas enrichi finscale avec autant de liens que les autres podcasts (article_content moins riche → moins de liens extraits).
3. **Pipeline classify pas tourné sur finscale** : tracker manque le run sur ce tenant.

### Plan fix S4/Beta 1

1. Lire `engine/ai/classify-predefined.ts` pour vérifier les patterns cross-podcast détectés.
2. Run `PODCAST_ID=finscale npx tsx engine/ai/classify-predefined.ts --dry` pour estimer combien de re-classifications seraient faites.
3. Si dry-run remonte 100+ matches → run avec `--write` (validation humaine d'abord).
4. Si dry-run remonte <20 matches → investigation plus profonde (ingest RSS finscale, scrape-deep).

**Effort estimé** : 1-2 h CC + 0 $ LLM (classify-predefined utilise Haiku batch, ~$0.10 sur finscale).

### Action 29/04 PM

- ❌ Pas de fix trivial appliqué (le "fix trivial 30 min" attendu T2.3 n'existe pas — l'investigation a redirigé vers une vraie anomalie hors scope T2.3).
- ✅ Diagnostic documenté ici.
- ✅ Faux positif "8/338 cross_refs JSONB" requalifié non-bug (legacy parser RSS).
- ⏳ **Audit à corriger** : dans `docs/audit-2026-04-29.md` §Bugs détectés #2, requalifier en "faux positif legacy parser RSS — voir `docs/debt-tracking.md` section finscale". À faire opportuniste ou lors d'une prochaine session de polish docs.

---

## Coverage embeddings 100 % — RESOLVED Phase Alpha T2.1 (29/04 PM)

**Statut** : ✅ RESOLVED. Couverture passée de 70 % → **100 %** (3 354 / 3 354 ép. sur 11 tenants).

### Contexte

L'audit du 29/04 matin (`docs/audit-2026-04-29.md`) avait remonté :

- **5 tenants à 0 % embeddings** : iftd 706, dva 98, onlacherien 82, allolamartingale 58, fleurons 6 (= 950 ép.) — non-cherchables sémantiquement.
- **6 tenants partiellement couverts** : 49 ép. supplémentaires sans embedding (lamartingale 35, finscale 6, gdiy 4, passionpatrimoine 3, combiencagagne 1).

Total dette : **999 ép. à embed**.

### Action 29/04 PM (Phase Alpha T2.1 + follow-up)

Pipeline existant `engine/ai/embeddings.ts` lancé en boucle sur 10 tenants (PODCAST_ID env var) :

- **T2.1 — 5 tenants à 0 %** : 950 ép. embedés en ~145 s, $0.0212.
- **Follow-up — 6 tenants partiels** : 49 ép. embedés en ~10 s, $0.0011.
- **TOTAL** : 999 ép., 170 570 tokens, **$0.0223** (vs estim 5 $, 224× sous budget).

### Vérifications post-run

- Couverture finale : 3 354 / 3 354 (100 %) sur 11 tenants — confirmée par query SQL.
- Isolation tenant : 0 fuite (`episodes_enrichment.tenant_id` = `episodes.tenant_id` partout).
- Dimensions vector : 3072 (text-embedding-3-large).
- Tests Vitest : 732/732 verts (inchangé).
- Build prod TS : 0 erreur (inchangé).

Pipeline `engine/ai/embeddings.ts` couvre désormais 100 % du corpus indexé. Toute nouvelle ingestion d'épisode devra passer par ce pipeline pour rester à 100 %.

---

## Dette typage strict des fichiers de tests (Phase 7b 27/04 + audit 29/04)

**Statut au 29/04 PM** : NON BLOQUANT BUILD PROD depuis l'exclusion
`__tests__/` du `tsconfig.json` (commit feat/phase-alpha — fix Vercel
Production redeploy fail). À fixer en Phase Beta 1 ou opportuniste.

### Contexte

`tsc` strict (= `npm run build`) échouait sur **14 erreurs** localisées
exclusivement dans des fichiers de tests :

- `engine/__tests__/cross-reference-episode.test.ts` (×2) — TS18048/TS2493 sur `args[0]` (depuis Phase 7b 27/04).
- `engine/__tests__/transcribe-audio.test.ts` (×11) — idem (depuis Phase 7b 27/04).
- `engine/__tests__/output-formatters.test.ts:131` (×1) — TS2345 `Buffer<ArrayBufferLike>` (Node 24, depuis 28/04).

Vitest a sa propre config (`vitest.config.ts` + transpile esbuild) et
reste 732/732 vert. Les erreurs n'ont jamais bloqué `npm test` ni le
runtime applicatif (engine/, cli/, api/, frontend/).

### Action 29/04 PM (Phase Alpha)

`tsconfig.json` clé `exclude` étendue avec :

```json
"**/__tests__/**", "**/*.test.ts", "**/*.spec.ts"
```

Conséquences :

- Build prod (`npm run build` → `tsc`) = **0 erreur** ✓
- Vercel Production redeploy débloqué.
- Vitest inchangé : 732/732 vert (sa config compile les tests indépendamment).
- Aucun fichier applicatif n'importe depuis `__tests__/` (vérifié : seuls 3 commentaires de documentation pointent vers les fichiers de test).

### À fixer plus tard

**Estimation cumulée : ~40 min** (typage défensif `args[0]!` / `Buffer.from(buf as any)`).

**Bénéfice** : permettre l'intégration d'un job CI `tsc --noEmit` sur tout le repo (tests inclus) qui détecterait les régressions de typage côté tests.

**Status** : OPEN, requalifié non-bloquant. À planifier Phase Beta 1 ou ticket opportuniste.

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
