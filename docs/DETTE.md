# Dette technique — Podcast Engine

État au **24 avril 2026**, après audit live univers MS (`docs/audit-univers-live.md`) + Phase B quick wins.

Classement par priorité décroissante. **P0 = bloquant / P1 = forte valeur / P2 = améliorations / P3 = moyen terme**.

---

## État transitoire à tracer (post-B, pré-F)

### Nav publique réduite à 5 items, routes Assistant/Quiz toujours actives
- **Commit** : `refactor(nav): reduce public nav from 10 to 5 items`
- **État** : `frontend/v2.html` nav = Accueil / Épisodes / Parcours / Experts / Recherche. Les 5 items retirés (Assistant, Quiz, Graphe, Pour vous, Dashboard) ne sont plus dans la nav publique.
- **Mais** : les sections HTML correspondantes (`#v-chat`, `#v-quiz`, `#v-graph`, `#v-reco`) et leurs routes JS `go('chat')` / `go('quiz')` / `go('graph')` / `go('reco')` restent fonctionnelles. Accessibles par lien direct ou bouton interne.
- **Résolu par Phase F** : Assistant et Quiz seront transformés en widgets inline sur la page épisode, "Pour vous" deviendra post-login. Graphe et Dashboard resteront URL-only (outils créateur/admin).
- **Pas un bug** : état intentionnel pour que la nav publique soit cohérente avant la refonte UX complète.

### Hub figé sur LM×GDIY (2/6 podcasts)
- **État** : `frontend/hub.html` hardcode 2 cards + ternaires `'lamartingale' ? 'LM' : 'GDIY'` lignes 369/444/522. Les 4 autres tenants (LP, Finscale, PP, CCG) déployés mais absents du hub.
- **Résolu par Phase C** : nouveau `/api/universe` + réécriture `hub.html` pour N tenants. Design doc dans `docs/design-api-universe.md`.

### Search multi-tenant hub retirée en Phase C
- **Décision** : le hub V2 (Phase C) n'aura pas de search bar globale. Les créateurs (audience hub) ont rarement besoin de recherche cross-podcasts ; l'user qui arrive sur un card → va sur le site tenant → utilise la recherche par tenant existante.
- **Pas de fan-out côté client** (6 fetches parallèles) pour un usage marginal.
- **À reconsidérer** : après Phase E (auth + usage réel des créateurs), si un vrai besoin remonte côté Orso/MS, créer `/api/search/universe` dédié.

---

## Bruit cross_podcast_ref — patterns à filtrer en lecture hub

Les URLs suivantes sont classées `cross_podcast_ref` par `engine/scraping/rss/extractors.ts` mais n'ont pas de valeur éditoriale pour le hub `/api/universe` :

- **`audiomeans.fr/politique-de-confidentialite`** — footer RSS injecté automatiquement par Audiomeans dans tous les flux de ses clients (pas une référence cross-podcast éditoriale).
  Volumes observés post-sync v3 : **LP 505, GDIY 537, PP 156, CCG 65** (LM exempt car non-Audiomeans).

- **Spotify show root** (`open.spotify.com/show/<id>` sans épisode spécifique) et **Apple Podcasts show root** (`apple.com/*/podcast/<slug>/id<id>` sans `?i=<episode>`) : auto-promo du podcast courant (lien vers la page show), pas une ref cross.
  Volume observé Spotify show LP : **339 rows**.

### Filtre SQL à appliquer dans `/api/universe` (Phase C)

```sql
WHERE link_type = 'cross_podcast_ref'
  AND url NOT LIKE '%audiomeans.fr/politique%'
  AND url !~ '(spotify\.com/show/[^/]+|apple\.com/.*/podcast/[^/]+/id[0-9]+)$'
```

Ce filtre est la spec canonique pour les lectures hub. Pas de blackbox : tout lien classé `cross_podcast_ref` doit être testable contre ces 2 patterns avant affichage côté hub.

### Signal hub-utile [3b] par tenant (post-sync 24/04/26)

Métrique produit mesurée après `scripts/sync-rss-links-to-episode-links.ts --write` + filtre Phase C complet :

| Tenant | cross total | audiomeans | sans audiomeans | hub-utile [3b] |
|---|---|---|---|---|
| lamartingale | 840 | 309 | 531 | **2** |
| gdiy | 992 | 959 | 33 | **24** |
| lepanier | 845 | 506 | 339 | **16** |
| finscale | 4 | 0 | 4 | **3** |
| combiencagagne | 104 | 104 | 0 | **0** |
| passionpatrimoine | 195 | 195 | 0 | **0** |
| **Total** | **2 980** | **2 073** | **907** | **45** |

**Lecture** : sur 2 980 rows classées `cross_podcast_ref` globalement, seules **45 (1.5%)** sont éditorialement utiles pour le hub cross-podcast. Les 2 935 autres sont du bruit (Audiomeans footer 2 073 + Spotify/Apple show root ~862). Implication Phase C : le hub ne peut pas se contenter de `WHERE link_type='cross_podcast_ref'` — le filtre SQL documenté ci-dessus est impératif.

Le ratio LM (2 refs sur 840) vs GDIY (24 sur 992) vs LP (16 sur 845) suggère que les vraies refs éditoriales (mention d'un autre épisode du même univers dans le RSS description) sont rares et concentrées sur les 3 plus gros podcasts. À re-examiner en Phase D+ si Orso souhaite enrichir explicitement les refs cross dans les RSS descriptions.

### Divergence classifieurs `scrape-deep.ts` vs `rss/extractors.ts`

- **`scrape-deep.ts`** : per-tenant `WEBSITE_HOST`, détection fine `tool`/`company`/`episode_ref` avec contexte site.
- **`rss/extractors.ts`** : regex hardcodé `/lamartingale\.io\/(?:episode|podcast)/` → bug sur les 5 autres tenants (détection `episode_ref` ratée pour lepanier.io, gdiy.fr, passionpatrimoine.com, combiencagagne.io, finscale).

Conséquence : sync v3 introduit une **blacklist downgrade** (`episode_ref`, `tool`, `social`) dans le `ON CONFLICT DO UPDATE ... WHERE` pour ne jamais écraser un type fin (scrape-deep) par un type générique (extractors RSS). Label peut quand même être mis à jour — seul le type est protégé.

**À résoudre en Phase D+** : refactor `rss/extractors.ts` pour prendre `WEBSITE_HOST` en paramètre depuis la config podcast, puis relancer le sync avec blacklist désactivée pour valider la convergence.

### Audio / other drop — surveillance volumes

`sync-rss-links-to-episode-links.ts` drop :
- `link_type = 'audio'` (doublon avec `episodes.audio_url`)
- `link_type = 'other'` (non classifié = bruit résiduel)
- types inconnus (fallback défensif)

Volume dry-run v3 : **0 row** sur les 6 tenants. Si ce compteur monte >100 sur un tenant, suspecter un nouveau pattern URL non géré par `classifyUrl()` → investiguer.

### Flags qualité `tool` — scrape-deep non appliqué (post-sync 24/04/26)

Le `link_type = 'tool'` est une classification fine qui nécessite scrape-deep.ts (analyse contexte article). Tenants avec `hasArticles: false` ne reçoivent **pas** cette analyse → comptage `tool` très bas, révélateur de la dette P0#1.

| Tenant | tool count | hasArticles | Commentaire |
|---|---|---|---|
| lamartingale | 228 | true | ✓ scrape-deep actif |
| finscale | 337 | true | ✓ scrape-deep actif (meilleur score, thématique outils financiers) |
| gdiy | 28 | true | ⚠ bas — à investiguer (scrape-deep peut-être incomplet sur GDIY) |
| lepanier | 7 | false | ⚠ scrape-deep skipped |
| passionpatrimoine | 2 | false | ⚠ scrape-deep skipped |
| combiencagagne | 1 | false | ⚠ scrape-deep skipped |

Dette P0#1 "Deep scrape Orso — 0 articles sur 4 podcasts" (lepanier/passionpatrimoine/combiencagagne/finscale) a maintenant un **impact quantifié côté produit** : la classification fine `tool` n'émerge pas sans scrape-deep, privant le hub d'un signal outil/produit clé.

Finscale est une exception intéressante : `hasArticles: true` (scrape-deep actif) + thématique fintech → 337 tool (plus que LM). Montre que quand scrape-deep tourne, les résultats sont au rendez-vous.

À prioriser en Phase D+ : résoudre P0#1 pour LP/PP/CCG ; investiguer GDIY (hasArticles:true mais tool seulement 28).

### Règle ops : scripts qui modifient la BDD = syntaxe explicite obligatoire

**Principe** : tout script `scripts/*.ts` ou `engine/*.ts` qui fait INSERT/UPDATE/DELETE sur Postgres **doit imposer une syntaxe de scope explicite**. Appel nu = **exit 2** avec usage printé. Pas de mode implicite "tout ce qui reste" ou "défaut = tous les tenants".

Modes canoniques à supporter (copier `scripts/sync-rss-links-to-episode-links.ts` comme référence) :

```bash
--tenant <id>                              # un seul tenant
--tenants id1,id2,id3                      # liste explicite
--all [--exclude id1,id2]                  # tous, exclusions explicites
--write                                    # opt-in explicite pour muter
```

Validations obligatoires :
- **flags mutuellement exclusifs** : `--tenant`, `--tenants`, `--all` → exit 2 si 2+ combinés
- **`--exclude` sans `--all`** → exit 2 (pas de sens seul)
- **aucun flag scope** → exit 2 avec message listant les 3 modes
- **dry-run = défaut**, `--write` doit être opt-in explicite

Motivation : fuite V1 (deploy parasite 14× en 4j via `.vercel/project.json` implicite) + risque systémique sync-rss-links (v1 buggé skip-if-exists) montrent que les "modes implicites" transforment une petite erreur de commande en migration destructive. Cette règle ferme cette classe de bug.

Applicable aux futurs scripts : migrations schema (`engine/db/migrate-*.ts`), backfills (`scripts/denormalize-*.ts`, `scripts/fix-*.ts`), sync JSONB→tables, batches LLM coûteux.

---

## P0 — Bloquant ou à fort ROI immédiat

### 1. Deep scrape Orso — 0 articles sur 4 podcasts
- **Tenants concernés** : `lepanier`, `finscale`, `passionpatrimoine`, `combiencagagne`
- **État** : `hasArticles: false` dans leurs configs → aucun `article_content`, `article_html`, ni extraction liens classifiés via `scrape-deep`
- **Impact** : embeddings appauvris (~4x moins de signal vs LM), pas de `/api/links/stats`, `links` très limités, pas de biographie invités canoniques.
- **Action** : investiguer sources (site `lepanier.io`, `passionpatrimoine.com`, `orsomedia.io/podcast/combien-ca-gagne`, Finscale site absent). Définir sélecteurs par instance, passer `hasArticles: true`, relancer `cli ingest --podcast <id>` étape scrape-deep.

### 2. Quiz LM/GDIY encore en template (hors top 5 démo)
- **État** : `quiz_questions` LM=621, GDIY=979 générées via `generate-quiz.ts` (format template Q1 pilier / Q2 invité). Seuls ~5 épisodes démo ont eu un quiz LLM de qualité via `regenerate-quality-quiz.ts`.
- **Impact** : UX quiz médiocre sur 95% des épisodes LM/GDIY.
- **Action** : batch `regenerate-quality-quiz.ts` pour tous les eps LM + GDIY (~1300 eps × 5 questions = 6500 appels Haiku, coût ≈ $5). Étendre à LP/PP/CCG/Finscale.

### 3. CCG guests LinkedIn
- **État** : CCG a 64 guests (post P0), 19 LinkedIn renseignés (30%). Versus LM ~95%.
- **Impact** : profils invités CCG pauvres, sourcing des LinkedIn absent.
- **Action** : script `scripts/denormalize-linkedin.ts` PODCAST_ID=combiencagagne + backfill manuel pour les 45 restants (recherche LinkedIn par nom + domaine d'activité).

---

## P1 — Forte valeur, à planifier

### 4. Finscale 332/567 épisodes ingérés
- **État** : RSS feed Audiomeans expose 332 eps, mais 567 annoncés sur le site.
- **Hypothèses** : limite pagination Audiomeans, dedup sur `episode_number IS NULL`, feed secondaire non référencé.
- **Action** : curl `https://feeds.audiomeans.fr/feed/55e0559e-ee0f-44ea-9e0f-acb0a18ec478.xml?items=9999` pour confirmer la limite. Chercher feed secondaire. Investiguer `finscale.com/archive` pour complétion manuelle.

### 5. cross_podcast_ref = 0
- **État** : `episode_similarities` a 0 paires cross-tenant par design. `cross_podcast_guests` donne 59 guests cross-podcast, mais aucune référence explicite d'un épisode d'un podcast citant un épisode d'un autre.
- **Impact** : graph cross-univers incomplet, potentiel de navigation horizontale inexploité.
- **Action** : nouveau pipeline `cross-references.ts` qui cherche dans `episodes.rss_description` + `article_content` les mentions d'épisodes d'autres tenants (heuristique : nom de podcast + numéro/titre). Populate table `cross_podcast_refs (from_tenant, from_episode, to_tenant, to_episode, context)`.

### 6. Passion Patrimoine sous-volume
- **État** : 195/214 annoncés. Desync mineure (~9%).
- **Action** : idem Finscale — vérifier feed, items manquants via site.

---

## P2 — Améliorations qualité/UX

### 7. KV store pas encore créé
- **État** : `engine/cache.ts` utilise LRU mémoire (fallback), Vercel KV jamais branché.
- **Impact** : cache perdu à chaque cold start Vercel (~1s latence première requête post-idle).
- **Action** : créer KV sur Vercel, injecter `KV_REST_API_URL` + `KV_REST_API_TOKEN` dans env vars des 7 projets. Code déjà prêt, active automatiquement.

### 8. Classifications incomplètes (batch LLM fail)
- **État** : post-P0, certains eps restent `UNCLASSIFIED` :
  - CCG 6/65 (10%), PP 46/142 (33%), LP 35/376 (9%), Finscale 1 ep
- **Action** : rerun `classify-predefined --prune` avec prompt amélioré, ou classifier manuellement par episode_number pour petits volumes.

### 9. Divergence LM `episodes.guest_bio` (88) vs `guests.bio`
- **État** : bio denormalisée sur 88 eps LM, bio canonique sur ~288 guests. Probable duplication obsolète.
- **Action** : audit `SELECT count(DISTINCT e.id) FROM episodes e JOIN guests g ON ... WHERE e.guest_bio != g.bio` — confirmer, puis `UPDATE episodes SET guest_bio = NULL` et lire depuis `guests` en JOIN.

### 10. 17 LM eps sans slug · 68 GDIY eps sans article_url · 4 LM sans match RSS
- **État** : inchangé depuis M4.
- **Action** : re-crawler listing canonique `lamartingale.io?current_page=N` pour retrouver les slugs. `scripts/fix-empty-slugs-v2-lm.ts` existe mais partiel.

### 11. Filtres SQL noise hardcodés
- **État** : `engine/api.ts` + `engine/ai/dashboard.ts` blacklisent les noms MS en dur.
- **Action** : externaliser en `cfg.analytics.noiseFilters[]` dans la config podcast.

---

## P3 — Moyen terme / nice-to-have

### 12. Le Gratin (C3) pas encore ajouté
- **État** : podcast non onboardé. Pitch à faire.
- **Action** : `cli init --name "Le Gratin" --id legratin --rss "..."` + `ingest`. ~15 min vu le workflow CLI.

### 13. Migration Next.js
- **État** : 4 frontends HTML statiques (v2.html, episode.html, hub.html, v2-dashboard.html) + API Vercel serverless.
- **Motivations possibles** : SSR pour SEO, App Router pour routing dynamique cleaner, auth NextAuth pour profils persistants.
- **Risques** : perte de l'architecture single-file config-driven très simple, build plus lourd, re-écriture vanilla JS → React.
- **Action** : décision architecture à prendre avant de se lancer. Pas urgent — l'actuel fonctionne et est maintenu.

### 14. Hub sans /dashboard
- **État** : hub.html agrège déjà cross-podcast, pas de frontend dashboard dédié au hub.
- **Action** : créer `frontend/hub-dashboard.html` avec KPIs univers (total eps, heures, guests cross, top pillars par tenant) + rewrite `/dashboard` dans `vercel-hub.json`.

### 15. Rename repo GitHub + custom domain
- **État** : repo = `jeremyH974/lamartingale`, ms-hub sur `.vercel.app`.
- **Action** : rename → `podcast-factory` + custom domain `univers-ms.io` (ou similaire) + certificats.

### 16. Auth + profil persistant cross-tenant
- **État** : aucun état utilisateur (quiz progress, favoris, historique). Tout est anonyme.
- **Action** : NextAuth + Postgres `users` + jointure cross-tenant `user_quiz_progress`. Pré-requis pour Le Gratin roadmap long-terme.

### 17. API `/api/demo/summary` instance-spécifique
- **État** : endpoint LM-only dans `engine/api.ts` pour la démo Stefani.
- **Action** : soit supprimer (démo passée), soit généraliser (`/api/demo/summary?n=N` pour toutes instances).

### 18. Similarité cross-tenant
- **État** : 0 paires dans `episode_similarities` cross-tenant (par design multi-tenant).
- **Décision à prendre** : est-ce pertinent d'avoir "épisodes similaires" qui traversent les podcasts ? Risque de bruit, mais valeur découverte cross-univers. Orthogonal à cross_podcast_refs (#5).

### 19. CLI Factory `deploy --all` absent
- **État** : `cli/index.ts` n'a que `deploy --podcast <id>` (requiredOption). Pas de `--all` pour déployer les 7 tenants en une commande.
- **Impact** : pour re-déployer après un changement global (ex: fix dans `engine/api.ts`), il faut enchaîner 7 `npm run deploy:<tenant>` séquentiels.
- **Action** : ajouter `program.command('deploy').option('--all')` + boucle async sur `listPodcasts()` (`cli/index.ts`). Priorité P3 (confort dev, pas bloquant). Si ajouté, aussi exposer `"deploy:all"` dans `package.json` scripts.
