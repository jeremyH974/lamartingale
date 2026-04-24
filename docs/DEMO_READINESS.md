# Demo Readiness — Univers MS au 24 avril 2026

**Statut** : draft interne pré-RDV Orso + Matthieu. Non commité tant que pas de GO.

---

## Pitch (3 paragraphes)

**L'actif aujourd'hui.** Six podcasts de l'univers Matthieu Stefani tournent sur une
plateforme unique : La Martingale (313 eps), Génération Do It Yourself (959 eps),
Le Panier (506 eps), Finscale (332 eps), Passion Patrimoine (195 eps), Combien ça
gagne (104 eps) — **2 409 épisodes totaux, 7 sites live** incluant le hub
`ms-hub.vercel.app` qui agrège tout. Une seule DB Neon, six projets Vercel,
un seul codebase `engine/` mutualisé. Nouveau podcast = 3 commandes CLI.

**Le différenciant data.** Chaque site expose beaucoup plus qu'un catalogue RSS :
search hybride (BM25 + embeddings OpenAI text-embedding-3-large), graph D3
des références croisées inter-épisodes, profils invités consolidés, 1 586 quiz
LM nouvellement régénérés à la qualité Claude Haiku 4.5 (questions substantielles
sourcées dans l'article, plus le template générique). Côté cross-podcast :
**213 références d'épisodes inter-podcasts éditorialement utiles**
(filtrage automatique du bruit RSS : ~2 770 liens techniques exclus,
principalement footers Audiomeans et auto-promo Spotify / Apple) et
**59 invités ayant réellement traversé plusieurs podcasts de l'univers**
(filtré `total_podcasts ≥ 2` sur 1 162 rows `cross_podcast_guests` — les
1 088 autres n'apparaissent que sur un seul podcast et ne sont pas "cross").
Le moteur connaît l'univers comme un tout, pas comme six silos.

**La Phase E vient de shipper.** Auth passwordless (magic-link signé HMAC,
cookie stateless 30 j) avec scope `podcast_access` par email × tenant. Aujourd'hui
seul `jeremyhenry974@gmail.com` a accès root. L'infrastructure pour onboarder
Matthieu, l'équipe Orso, Cosa Vostra, Gokyo est en place et testée end-to-end
(214 tests verts dont 13 d'intégration auth). Il manque un DNS Resend sur domaine
pro pour que les emails magic-link soient délivrables hors `onboarding@resend.dev`,
et l'arbitrage scope root/scoped pour chaque personne. Les deux décisions
sont business, plus techniques.

---

## Ce qui marche (démontrable live)

| Capacité | Preuve en live | URL |
|---|---|---|
| 6 sites tenant production | Chaque site en charte propre, nav publique 5 items | `lamartingale-v2` / `gdiy-v2` / `lepanier-v2` / `finscale-v2` / `passionpatrimoine-v2` / `combiencagagne-v2` `.vercel.app` |
| Hub univers agrégé | 6 cards dynamiques, ordering `hub_order`, cold 2.15 s / warm 71 ms | `ms-hub.vercel.app` |
| Search hybride (vectoriel + BM25) | Test live : `quitter son job` → eps pertinents de 3 podcasts | `/api/search/hybrid?q=...` |
| RAG chat par épisode | Q/R sourcée dans l'article complet | page épisode → widget chat |
| Quiz qualité Haiku 4.5 | 1 586 questions LM, 5 q/ep, 4 options, sourcées article | `lamartingale-v2.vercel.app` → section Quiz, ou `/api/quiz/episode/313` |
| Graph D3 cross-références | 2 980 edges inter-eps, clustering auto | page Graphe |
| Profils invités consolidés | 1 208 invités, bios scrapées, liste des apparitions | `/api/guests/:name` |
| Dashboard créateur | KPIs, insights, répartition piliers, top liens | `/dashboard` (protégé Phase E à venir) |
| Auth magic-link | Email → lien one-shot → cookie 30 j HMAC | `/login` sur le hub |
| `podcast_access` scoping | Email × tenant, convention `'*'` = root univers | DB `podcast_access` |
| Onboarding nouveau podcast | `cli init` → `cli ingest` → `cli deploy` en 3 commandes | `docs/NEW_PODCAST.md` |
| Tests d'intégration | 214 tests verts (10 files, 5.14 s) | `npx vitest run` |

### Volumétrie consolidée

| Tenant | Eps | Guests | Articles deep | Chapters | Quiz |
|---|---:|---:|---:|---:|---:|
| gdiy | 959 | 423 | 468 | 511 | 979 (template) |
| lepanier | 506 | 127 | 0 | 138 | 683 (template) |
| finscale | 332 | 250 | 0 | 0 | 658 (template) |
| lamartingale | 313 | 223 | 296 | 296 | **1 586 (Haiku 4.5)** |
| passionpatrimoine | 195 | 121 | 0 | 0 | 285 (template) |
| combiencagagne | 104 | 64 | 0 | 0 | 129 (template) |
| **Total** | **2 409** | **1 208** | **764** | **945** | **4 320** |

Cross-podcast :
- **213 refs d'épisodes inter-podcasts éditorialement utiles** (endpoint
  `/api/universe.crossEpisodeRefs`). Brut en base : 2 980 (`episode_links`
  où `link_type = 'cross_podcast_ref'`), dont ~2 073 footers Audiomeans
  (politique-de-confidentialité injectée dans les RSS Audiomeans) et
  ~862 auto-promos Spotify / Apple show root — exclus automatiquement du
  rendu public pour préserver la crédibilité éditoriale.
- **59 invités réellement cross-podcast** (`cross_podcast_guests` filtré
  `total_podcasts ≥ 2`). Brut en base : 1 162 (1 088 rows n'apparaissent
  que sur un seul podcast, ne sont donc pas "cross"). Échantillons vérifiés :
  Eric Larchevêque (LM + GDIY + PP, 3 eps), Marc Tempelman (Finscale + LM),
  Delphine d'Amarzit (Finscale + LM), Hugues Le Bret (Finscale × 2 + GDIY).

---

## Ce qui est en cours (shippable court terme, pas aujourd'hui)

| Item | Statut | Blocker |
|---|---|---|
| DNS Resend domaine pro | Config Vercel prête, setup DNS user-side | 15 min setup + 24 h propagation |
| Seed `podcast_access` externe | Code prêt (Rail 4a), script insert trivial | Décision scope Matthieu (root / scoped) + emails Orso / CV / Gokyo |
| Quiz GDIY qualité Haiku (Rail 1-bis) | Script `regenerate-quality-quiz.ts` déjà `--all` ready | Coût extrapolé ~$7.50 sur 959 eps (dépasse seuil sandbox $5), GO explicite requis |
| Scraping éditorial profond (articles + chapitres) | Actif sur La Martingale et GDIY (296 + 468 articles, 296 + 511 chapitrages). En cours d'intégration sur Le Panier, Finscale, Passion Patrimoine, Combien ça gagne | Dépendance source publique par podcast — chaque site a sa structure HTML et ses sélecteurs à calibrer |
| Quiz qualité sur LP / Finscale / PP / CCG | Template générique en DB (1 755 questions au total) masqué côté front via `features.qualityQuizReady = false` | Dépend de Rail 1-ter (après Rail 1-bis GDIY) et d'une source de contenu scrappable (cf. ligne au-dessus) |
| Widget "Autres podcasts de l'univers" sur sous-sites | `hub_order` exposé via `/api/config`, non consommé | Décision UX + redeploy 6 sous-sites (Phase F) |

---

## Ce qui n'existe pas encore (roadmap ouverte, arbitrage post-RDV)

| Rail | Scope | Dépendance |
|---|---|---|
| **Rail 1-bis** | Regen quiz GDIY (959 eps) à qualité Haiku | GO coût + arbitrage priorité |
| **Phase F — Auditeur** | Login auditeur (≠ créateur), favoris, quiz personnalisé, reco cross-podcast | Décision produit : qui est l'auditeur cible ? audience LM ? univers MS ? |
| **D3 — Dashboard créateur externe** | Version audité-friendly du dashboard, scoped par `podcast_access` | Phase E + retours Orso sur ce qu'ils veulent voir |
| **Absorption dashboards existants** | Migrer KPIs externes (Spotify for Podcasters, Chartable, etc.) dans le dashboard unifié | Accès API Orso côté distributeurs |
| **Ads / monétisation insights** | Détection sponsors, reco placement, prix moyen marché | Hors scope actuel, idée à creuser avec Matthieu |
| **Hub search globale cross-podcast** | Search bar sur `ms-hub` qui interroge les 6 index en parallèle | Décision produit (dette ouverte — skipped Phase C faute d'usage confirmé) |
| **Slug recovery LM** | 16 eps avec `slug=""` en DB (dette P2 DETTE.md) | Validation humaine numéro ep ↔ URL par date de pub |

---

## Points d'arbitrage à poser en RDV

1. **Scope Matthieu** — `root` (univers complet, futurs podcasts auto-inclus) ou scoped `[lamartingale, gdiy]` (deux podcasts qu'il anime) ?
2. **Équipe Orso / Cosa Vostra / Gokyo** — email d'équipe générique partagé ou individus nominatifs ?
3. **Priorité post-démo** : (a) parité quiz GDIY, (b) Phase F auditeur, (c) D3 dashboard externe, (d) absorption dashboards, (e) autre chose qu'on n'a pas vu ?
4. **Adoption réelle** — qui ouvre le dashboard chaque semaine ? Quelle métrique fait agir Orso ? Quel insight change une décision prod ?
5. **Monétisation** — Matthieu voit-il la plateforme comme outil interne, produit SaaS vendable à d'autres réseaux podcast, ou vitrine démo pour des prospects Orso ?

---

## Pitch 30 secondes (à garder en tête en début de RDV)

> « On a ingéré les 6 podcasts de l'univers, 2 409 épisodes, dans une plateforme
> unique. Chaque site a sa charte, mais tout partage la même intelligence : search
> cross-podcast, graphe d'invités, quiz qualité LLM, dashboard créateur. Je peux
> onboarder n'importe qui sur n'importe lequel des podcasts en 2 minutes.
> Aujourd'hui je cherche à savoir ce qui vous servirait vraiment au quotidien —
> et dans quel ordre. »
