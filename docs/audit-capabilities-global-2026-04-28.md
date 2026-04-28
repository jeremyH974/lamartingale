# Audit global des capacités Sillon — 2026-04-28

> Document à 2 strates de lecture : **Strate 1 (Business)** en français accessible pour relais non-tech, **Strate 2 (Technique)** pour CC + dev futur. État à `feat/hub-v2-scenario-b @ e6807d2`. Investigation $0 LLM.

---

## 📑 Sommaire

**Strate 1 — Business (5 minutes de lecture)**
- A. Ce que Sillon fait aujourd'hui ([→](#a--ce-que-sillon-fait-aujourdhui))
- B. Ce que Sillon peut faire mais qu'on n'utilise pas ([→](#b--ce-que-sillon-peut-faire-mais-quon-nutilise-pas))
- C. Ce qu'on a commencé mais pas fini ([→](#c--ce-quon-a-commencé-mais-pas-fini))
- D. Tableau récap ([→](#d--tableau-récap-business))
- E. Recommandations Claude Code ([→](#e--recommandations-top-5))

**Strate 2 — Technique (référence)**
1. Inventaire pipelines & générateurs ([→](#1--inventaire-pipelines--générateurs))
2. Inventaire endpoints API ([→](#2--inventaire-endpoints-api))
3. Inventaire schémas DB ([→](#3--inventaire-schémas-db))
4. Inventaire livrables stockés ([→](#4--inventaire-livrables-stockés))
5. Capacités non-évidentes ([→](#5--capacités-non-évidentes))
6. Commandes CLI ([→](#6--commandes-cli))
7. Synthèse — pépites prioritaires ([→](#7--synthèse--pépites-prioritaires))

---

# STRATE 1 — Résumé business

> Sillon est une chaîne de production éditoriale qui ingère 11 podcasts (3 354 épisodes, 2 695 heures, 1 370 invités) et en extrait du contenu réutilisable : briefs invités, recherches sémantiques, références croisées, livrables Stefani-ready. Tout est multi-tenant (chaque podcast a son propre site + ses droits d'accès), tout passe par une base de données unique.

## A — Ce que Sillon fait aujourd'hui

**Capacités actives en production, déjà utilisées par les sites publics.**

1. **Sillon classe automatiquement chaque épisode dans une grille de thèmes**.
Concrètement : à partir du titre, du résumé et de l'invité, Sillon attribue un pilier (ex : "Investissement", "Entrepreneuriat", "Patrimoine") et des sous-thèmes. Aujourd'hui : 3 354 épisodes classés sur les 11 podcasts.

2. **Sillon trouve les épisodes similaires les uns aux autres**.
Concrètement : en cliquant sur un épisode du Panier, le visiteur voit "Vous pourriez aussi aimer cet épisode de La Martingale" — même thème, même angle. Aujourd'hui : 45 757 paires de similarité calculées sur 2 355 épisodes (70 % du corpus).

3. **Sillon génère un quiz par épisode**.
Concrètement : à la fin d'un épisode "Pokémon = aubaine ?", l'auditeur peut répondre à 5 questions pour vérifier ce qu'il a retenu. Aujourd'hui : 5 806 questions de quiz dans la base, déployées sur 6 sites publics.

4. **Sillon scrape les articles longs et les chapitres détaillés des épisodes**.
Concrètement : pour La Martingale, Sillon va chercher l'article complet du site (~5 000 caractères) + les chapitres horodatés (saut direct vers la minute 28:47). Aujourd'hui : 710 épisodes avec article riche, 3 354 épisodes avec chapitres détaillés.

5. **Sillon repère les invités partagés entre podcasts**.
Concrètement : Eric Larchevêque a parlé sur 3 podcasts différents — Sillon le sait, regroupe ses interventions, et permet de voir tout son parcours d'un coup d'œil. Aujourd'hui : 1 261 invités identifiés cross-podcast, 75 partagés sur 2 podcasts ou plus.

6. **Sillon génère un brief par invité (cross-podcast)**.
Concrètement : pour Larchevêque, Sillon synthétise les points-clés, les citations marquantes, et les questions encore ouvertes — utilisable comme base de prep d'interview. Aujourd'hui : 62 briefs générés sur 1 261 invités possibles. Coût : ~3 centimes par brief.

7. **Sillon repère quand un podcast cite un autre podcast de l'écosystème**.
Concrètement : si Le Panier mentionne "voyez l'épisode 174 de La Martingale", Sillon trace cette flèche et l'expose visuellement. Aujourd'hui : ~140 références croisées détectées.

8. **Sillon a un site agrégé pour l'écosystème complet**.
C'est le hub `ms-hub.vercel.app` (alias `ms-hub-v2-preview.vercel.app` pour la version pilote). Aujourd'hui : 11 podcasts, 1 page d'accueil unifiée, briefs invités cliquables.

## B — Ce que Sillon peut faire mais qu'on n'utilise pas

**Pépites cachées : capacités fonctionnelles, données déjà générées, jamais montrées à l'utilisateur.**

1. **Recherche sémantique cross-podcast** — ✨ pépite forte.
Le visiteur tape "investissement immobilier alternatif", Sillon retrouve les 5 meilleurs passages dans les 3 354 épisodes, peu importe le podcast. Le moteur tourne. Le hub n'a qu'une démo passive (3 questions pré-cuites) au lieu d'une vraie barre de recherche. **Pour vous, Matthieu** : devient un Google interne de votre écosystème, vendable comme outil de prep.

2. **Réponse conversationnelle multi-podcast** — ✨ pépite très forte.
Le visiteur pose une question en langage naturel, Sillon synthétise une réponse en citant les sources exactes (épisode + minute). Aujourd'hui : exposé en lecture seule (3 réponses pré-générées) dans le hub. Le vrai moteur conversationnel tourne déjà sur l'API.

3. **Quiz interactif par épisode** — pépite moyenne.
5 806 questions stockées, 0 affichées dans le hub. Sites individuels les utilisent ; le hub agrégateur non. Faible coût d'activation : ajouter une carte "Quiz du jour" tirée au hasard de l'écosystème.

4. **Liens classifiés (outils, entreprises, références)** — pépite à explorer.
35 775 liens extraits des descriptions RSS et articles, classés en 7 catégories (outil mentionné, entreprise citée, référence à un autre épisode, etc.). Permet par exemple : "tous les outils SaaS recommandés sur GDIY en 2025". Aucun endpoint frontend ne l'expose.

5. **Profils invités enrichis avec LinkedIn et bio** — pépite moyenne.
1 370 invités avec nom, entreprise, biographie, LinkedIn, score d'autorité. Exposé partiellement sur les sites individuels, jamais agrégé dans le hub.

6. **Pack 5 livrables par épisode** — pépite très forte mais artisanale.
Pour chaque épisode pilote (Boissenot, Doolaeghe, Plais, Veyrat) Sillon a généré : 5 moments-clés horodatés, 8-12 citations attribuées, 3-5 références cross-corpus regroupées par angle, une newsletter Stefani-ready, un brief annexé. Qualité validée : 12/12 livrables ≥ 7,5/10. Aujourd'hui : 4 épisodes / 3 354 = 0,12 % de couverture, fichiers en local non exposés.

7. **Timeline sponsors cross-podcast** — pépite à explorer.
Sillon trace les sponsors mentionnés dans les épisodes (qui sponsorise quel podcast, quand). Endpoint disponible, jamais affiché.

## C — Ce qu'on a commencé mais pas fini

**Capacités existantes à 30-60 %, demandent un effort d'achèvement.**

1. **Pipeline orchestré "5 livrables auto par épisode"** — 30 %.
La fonction officielle `runPack()` qui devait orchestrer la génération des 5 livrables est un squelette qui renvoie une erreur. Aujourd'hui c'est un script artisanal qui tourne épisode par épisode (slugs codés en dur). Pour passer à 100 % il faut : implémenter le squelette, brancher sur l'ingestion RSS, mettre en cache les sorties.

2. **Stockage en base des 5 livrables** — 50 %.
La table `editorial_events` est créée et indexée mais vide. Le pipeline écrit en fichiers `.md` au lieu d'écrire en base. Pour passer à 100 % il faut connecter la persistance aux scripts existants.

3. **Lens thématiques (angles d'analyse)** — 70 %.
5 angles éditoriaux pré-calibrés (deeptech, alternative-investments, DTC, insurtech, base) qui scorent automatiquement chaque segment d'un épisode. Calibrés Phase 4. Utilisés uniquement sur 4 épisodes pilote. Pour étendre : appliquer sur le corpus complet (coût ~$1 800 pour 3 354 épisodes).

4. **Couverture embeddings asymétrique** — 70 %.
2 355 épisodes ont une représentation mathématique (recherche sémantique active) sur 3 354. Manque 999 épisodes (essentiellement les 3 derniers tenants ajoutés : IFTTD, DVA, On Lâche Rien). Coût d'achèvement : ~$5.

5. **Tags & sous-thèmes par épisode** — 5 %.
Champ prévu, 178 épisodes / 3 354 remplis (5,3 %). Soit la pipeline auto-tags n'a jamais été lancée à grande échelle, soit son output n'est plus utilisé.

6. **Système de pages "entités"** — 0 %.
Table `entities` créée pour modéliser personnes / organisations de manière polyvalente (utile presse / cinéma / sport futur). Vide aujourd'hui.

## D — Tableau récap business

| Capacité | Statut | Couverture | Valeur potentielle |
|---|---|---|---|
| Classement automatique en thèmes | ✅ Actif | 11 podcasts / 3 354 épisodes | Navigation site |
| Épisodes similaires | ✅ Actif | 2 355 ép. / 45 757 paires | Engagement auditeur |
| Quiz par épisode | ✅ Actif (sites indiv.) | 5 806 questions | Engagement / pédagogie |
| Articles longs + chapitres | ✅ Actif (LM) | 710 articles, 3 354 chapitres | Mémoire éditoriale |
| Invités partagés cross-podcast | ✅ Actif | 1 261 invités, 75 partagés | Pitch écosystème |
| Brief invité cross-podcast | ✅ Actif | 62 briefs / 1 261 (5 %) | Prep interview, vente Stefani |
| Refs croisées entre podcasts | ✅ Actif | ~140 paires détectées | Différenciant écosystème |
| Hub agrégateur 11 podcasts | ✅ Actif | 1 site, 5 endpoints utilisés | Vitrine pilote |
| Recherche sémantique cross-corpus | 🔓 Caché | 2 355 ép. embedés | Outil prep, vente |
| Réponse conversationnelle 11 podcasts | 🔓 Caché (showcase passif) | Moteur prêt | Démo pilote, anti-Beepers |
| Liens classifiés (outils/entreprises) | 🔓 Caché | 35 775 liens | Pitch sponsor, navigation |
| Profils invités enrichis | 🔓 Caché (hub) | 1 370 invités | Page invité unifiée |
| Pack 5 livrables par épisode | 🔓 Caché + 🛠️ Artisanal | 4 ép. / 3 354 (0,12 %) | Pitch pilote, vente client |
| Timeline sponsors | 🔓 Caché | Endpoint prêt | Pitch sponsor |
| Pipeline auto 5 livrables (orchestré) | 🛠️ Squelette | 0 % | Industrialisation |
| Stockage en base des livrables | 🛠️ Table vide | 0 % | Industrialisation |
| Application lens corpus complet | 🛠️ 4 ép. | 0,12 % | Différenciant fort |
| Embeddings 100 % corpus | 🛠️ 70 % | 999 ép. manquants | Recherche complète |
| Tags / sous-thèmes par épisode | 🛠️ Pipeline dormant | 5 % | Filtrage fin |
| Système entités polyvalent | 🛠️ Schema vide | 0 % | Évolution presse/cinéma |

## E — Recommandations top 5

> Reco CC : 5 pépites à activer en priorité pour maximiser perception Stefani + ROI client. Effort estimé en heures CC, valeur estimée subjective.

| # | Action | Effort | Valeur Stefani | Valeur client futur |
|---|---|---|---|---|
| **R1** | **Activer barre de recherche sémantique réelle dans le hub** (pas juste 3 démos pré-cuites). API `/api/cross/search` déjà en prod, manque seulement input + résultats UI. | 3-4 h | 🔥 Très forte (montre profondeur 11 pods, anti-Beepers) | 🔥 Vendable comme moteur de recherche écosystème |
| **R2** | **Activer chat conversationnel cross-podcast** — barre de saisie + streaming réponse. API `/api/cross/chat` déjà en prod (utilisé pour générer les 3 démos passives M2). | 4-6 h | 🔥 Très forte (différenciant ChatGPT-like sur écosystème propre) | 🔥 Pivot pitch tous clients podcast |
| **R3** | **Exposer 1 pack pilote complet** (Boissenot LM #174 par exemple) sous forme page lisible navigable depuis le hub avec auth. 5 livrables visibles : moments-clés, citations, refs, newsletter, brief annexé. | 6-8 h | 🔥 Très forte (preuve technique tangible 5×, pas hypothétique) | 🔥 Démo de vente cœur de pitch |
| **R4** | **Compléter embeddings 999 épisodes manquants** (IFTTD, DVA, OnLâcheRien). Active recherche sémantique sur 100 % corpus. | 1-2 h CC + 10 min de calcul | 🟡 Moyen (cohérence "11 podcasts indexés" devient vraie) | 🟢 Préliminaire à toute fonctionnalité IA |
| **R5** | **Page invité agrégée pour les 75 invités multi-podcast**, plus que les 7 actuellement avec brief. Génération en bulk via script existant. | 2 h CC + 30 min génération + ~$2 LLM | 🟡 Moyen (densité visible "Sillon connaît votre écosystème") | 🟢 Démo vendable autres clients |

**Hors top 5 mais à mentionner** :
- Industrialisation pack 5 livrables (R3 généralisé) demande implémenter `runPack()` orchestré + persistance DB. Effort 2-3 jours CC + ~$1 800 LLM corpus complet. Reco : pas avant signature pilote.
- Tags & sous-thèmes : relancer pipeline `auto-taxonomy` sur tous tenants. Effort 1 h + ~$30 LLM. Faible visibilité, faible valeur pitch.
- Activation lens corpus complet : 0,12 % → 100 %. Coût ~$1 800 + 50-100 h GPU. Reco : V2 post-pilote.

---

# STRATE 2 — Référence technique détaillée

## 1 — Inventaire pipelines & générateurs

### 1.1 Pipelines actifs en production

#### Ingestion & enrichissement déterministe (sans LLM)

| Pipeline | Fichier | Input | Output | Couverture | Coût |
|---|---|---|---|---|---|
| `ingest-rss` | `engine/scraping/ingest-rss.ts` | URL RSS | DB `episodes` + `podcast_metadata` | 11 tenants, 3 354 ép. | $0 |
| `backfill-parsed` | `engine/scraping/rss/backfill-parsed.ts` | `episodes.rss_description` | DB JSONB (`rss_links`, `cross_refs`, `sponsors`...) | 3 354 ép. | $0 |
| `scrape-deep` | `engine/scraping/scrape-deep.ts` | URL articles | `article_content`, `chapters`, `episode_links` | LM + Finscale (710 articles) | $0 |
| `populate-guests` | `engine/cross/populate-guests.ts` | episodes + articles + links | DB `guests` + `guest_episodes` | 1 370 guests | $0 |
| `match-guests` | `engine/cross/match-guests.ts` | `guests` table | `cross_podcast_guests` (canonicalisé) | 1 261 cross-guests | $0 |

#### Enrichissement IA

| Pipeline | Fichier | LLM | Output | Couverture | Coût/exéc |
|---|---|---|---|---|---|
| `embeddings` | `engine/ai/embeddings.ts` | OpenAI text-embedding-3-large (3072 dim) | `episodes_enrichment.embedding` | 2 355 ép. (70 %) | ~$0.002/ép. |
| `similarity` | `engine/ai/similarity.ts` | (pgvector cosine, pas LLM) | `episode_similarities` | 45 757 paires | $0 |
| `classify-predefined` | `engine/ai/classify-predefined.ts` | Haiku batch 50 | `episodes.pillar` | 2 tenants (`mode='predefined'`) | ~$1/tenant |
| `auto-taxonomy` | `engine/ai/auto-taxonomy.ts` | Haiku × 2 (propose + classifie) | `taxonomy` + `episodes.pillar` | 4-6 tenants | ~$0.30/tenant |
| `generate-quiz` | `engine/ai/generate-quiz.ts` | (déterministe, pas LLM) | `quiz_questions` | 5 806 questions | $0 |
| `persistGuestBrief` | `engine/agents/wrappers/persistGuestBrief.ts` | Sonnet | `cross_podcast_guests.brief_md` + `key_positions`, `quotes`, `original_questions` | 62/1 261 guests | ~$0.03/brief |

### 1.2 Pipelines expérimentaux / pilote pack

#### Primitives Phase 1-2 (production-ready, isolation testée)

| Pipeline | Fichier | Input | Output | Couverture | Coût |
|---|---|---|---|---|---|
| `transcribeAudio` | `engine/primitives/transcribeAudio.ts` | audio_url RSS | Transcript segments | 4 ép. pilote | ~$0.27/ép. (Whisper) |
| `extractKeyMoments` | `engine/primitives/extractKeyMoments.ts` | transcript | L1 (5 moments + timestamps + saliency) | 4 ép. pilote | ~$0.15 (Sonnet) |
| `extractQuotes` | `engine/primitives/extractQuotes.ts` | transcript | L2 (8-12 citations + plateformes) | 4 ép. pilote | ~$0.18 (Sonnet) |
| `crossReferenceEpisode` | `engine/primitives/crossReferenceEpisode.ts` | transcript + catalog | L3 cross-refs scorés | 4 ép. pilote | ~$0.40-0.60 (Sonnet) |

#### Agents Phase 3-6 (calibrés, beta)

| Pipeline | Fichier | LLM | Output | État | Coût |
|---|---|---|---|---|---|
| `lensClassificationAgent` | `engine/agents/lensClassificationAgent.ts` | Sonnet (1 appel/segment ~4min) | `editorial_events` (vide) | Calibré V4, 4 ép. pilote | ~$2.50/ép. |
| `qualityValidator` | `engine/agents/qualityValidator.ts` | Haiku batch | Score 0-10 + flag rewrite | Production | ~$0.04/livrable |
| `opusRewrite` | `engine/agents/opusRewrite.ts` | Opus 4.7 | Rewrite L4/L5 si score <7.5 | Failsafe Phase 6 | ~$0.60/ép. (~20% des cas) |
| `loadStyleCorpus` | `engine/agents/loadStyleCorpus.ts` | (lecture FS) | 6 newsletters Stefani indexées | Production | $0 |
| `lensSectionGate` | `engine/agents/lensSectionGate.ts` | (heuristique) | Saute lens si <N matches | Production | $0 |

#### Orchestrateur officiel — NON IMPLÉMENTÉ

```ts
// engine/pipelines/runPack.ts ligne 142
throw new Error('runPack: not implemented yet — agents needed first');
```

→ Toute la production des 5 livrables passe par `experiments/autonomy-session-2026-04-28/phase6-runner.ts` (1 244 lignes), avec slugs hardcodés (`boissenot` / `nooz` / `veyrat`).

### 1.3 Pipelines dormants

- `audit-timestamps` (`scripts/audit-timestamps.js`) — script de validation 35 timestamps des packs pilote. Tourne à la demande après chaque modif L2.
- Auto-tags individuels (champ `tags` 178/2 355 = 5 %) — pipeline n'a pas été identifié dans l'audit, probablement legacy ou disable.

---

## 2 — Inventaire endpoints API

**56 endpoints sur 11 catégories**. Le frontend `frontend/hub.html` n'en consomme que 5.

### 2.1 Catégories & comptes

| Catégorie | # endpoints | Consommés hub.html |
|---|---|---|
| Auth | 4 | 2 |
| Universe | 1 | 1 |
| Cross-corpus (RAG, search, guests, sponsors, timeline) | 13 | 2 |
| Episodes | 7 | 0 |
| Guests / Experts | 5 | 0 |
| Search | 3 | 0 |
| Chat | 2 | 0 |
| Analytics / Stats | 7 | 0 |
| Quiz | 4 | 0 |
| Media | 2 | 0 |
| Config / Taxonomy / Tags | 5 | 0 |
| Admin (cache, briefs) | 3 | 0 |
| **Total** | **56** | **5** |

### 2.2 Endpoints utilisés par le hub v2 (`frontend/hub.html`)

| Endpoint | Usage |
|---|---|
| `GET /api/auth/me` | Session courante (loggué ou anonyme) |
| `POST /api/auth/logout` | Déconnexion |
| `GET /api/universe` | Hero + cards podcasts + cross-refs (auth required) |
| `GET /api/cross/guests/shared` | Section "Invités partagés" (M3) |
| `GET /api/cross/guests/:slug/brief` | Brief inline Larchevêque (M1.2) + brief par invité M5.2 (à venir) |

### 2.3 Endpoints cachés à fort potentiel

| Endpoint | Cache TTL | Usage potentiel hub v2 |
|---|---|---|
| `GET /api/cross/search?q=...` | 1 h | Barre de recherche sémantique réelle (R1) |
| `POST /api/cross/chat` | 24 h | Chat conversationnel cross-podcast (R2) |
| `GET /api/cross/timeline?limit=N` | 10 min | Timeline événements cross-tenant |
| `GET /api/cross/sponsors` | 10 min | Liste sponsors mentionnés |
| `GET /api/cross/references` | 10 min | Refs croisées détaillées (déjà M4 partiel) |
| `GET /api/cross/analytics` | 30 min | KPIs agrégés |
| `GET /api/quiz?pillar=&difficulty=` | aucun | Quiz aléatoire dans le hub |
| `GET /api/search/hybrid?q=&depth=chapter` | 1 h | Recherche fine au niveau chapitre |
| `GET /api/links/stats` | 10 min | Top outils/entreprises mentionnés |

### 2.4 Endpoints obscurs / à clean-up

- `POST /api/knowledge/query` — POC à supprimer (signalé "à supprimer" dans le code)
- `POST /api/cache/warm` — pré-chauffe cache, utile QA mais pas hub
- `GET /api/clustering` — sortie JSON brute, pas wrappée

---

## 3 — Inventaire schémas DB

### 3.1 Tables principales (content-bearing)

| Table | Colonnes content | Volume | Notes |
|---|---|---|---|
| `episodes` | title, abstract, article_content, article_html, chapters (jsonb), key_takeaways, cross_refs, external_references, related_episodes, rss_description, rss_content_encoded, rss_guest_intro, rss_topic, rss_discover, rss_references, rss_chapters_ts, rss_links, sponsors, cross_promo, editorial_type | 3 354 | God-table — toutes les colonnes éditoriales |
| `episodes_enrichment` | embedding (vector 3072), tags (text[]), sub_themes (text[]), search_text | 2 355 (70 %) | Tags 5 %, sub-themes 2,6 % |
| `episodes_media` | thumbnail_350, thumbnail_full, audio_player_url | n/a | Assets dédiés |
| `episode_links` | url, label, link_type (resource/linkedin/social/episode_ref/company/tool/cross_podcast_ref) | 35 775 | Classifié, indexé |
| `episode_similarities` | episode_id, similar_id, score | 45 757 | pgvector cosine, top 20/ép. |
| `chapters` (jsonb dans `episodes`) | start_seconds, end_seconds, title, summary | 3 354 ép. (100 %) | Stocké directement dans la colonne JSONB |
| `quiz_questions` | question, options (jsonb), correct_answer, explanation, difficulty, pillar | 5 806 | Multi-tenant |
| `guests` | name, company, bio, specialty (text[]), linkedin_url, authority_score, episodes_count | 1 370 | Local par tenant |
| `guest_episodes` | guest_id, episode_id (join) | 1 249 | Polymorphe |
| `cross_podcast_guests` | canonical_name, display_name, bio (385/1 261 enrichis), tenant_appearances (jsonb), linkedin_url, instagram_url, website_url, **brief_md (62/1 261)**, key_positions (jsonb), quotes (jsonb), original_questions (jsonb) | 1 261 | Pépite — brief_md exposé seulement Larchevêque actuellement |
| `taxonomy` | pillar, name, color, icon, episode_count, sub_themes (text[]) | n/a | 11 tenants |
| `learning_paths` | path_id, name, description, difficulty, prerequisites, outcomes, episodes_ordered (jsonb) | 0 | Schema prêt, jamais peuplé |
| `podcast_metadata` | title, subtitle, description, author, owner_name, categories (jsonb), keywords, social_links, raw_channel_xml | 11 | 1 ligne par tenant |
| `entities` | entity_type (person/organization), canonical_slug, display_name, metadata (jsonb) | 0 | Vide — extensible cinéma/presse |
| `editorial_events` | source_id, source_type, type (lens_classification/key_moment/quote/cross_reference), content_text, position (jsonb), metadata (jsonb), lens_tags (text[]) | 0 | Vide — pipeline 5 livrables n'écrit pas en DB |

### 3.2 Couverture par tenant (épisodes)

| Tenant | Eps DB | Eps avec embedding | Eps avec article >500c |
|---|---|---|---|
| gdiy | 963 | 959 (99 %) | partiel |
| iftd | 706 | 0 (manquant) | 0 |
| lepanier | 506 | 506 (100 %) | partiel |
| finscale | 338 | 332 (98 %) | non identifié |
| lamartingale | 294 | 259 (88 %) | 710 globaux concentrés ici |
| passionpatrimoine | 198 | 195 (98 %) | partiel |
| combiencagagne | 105 | 104 (99 %) | partiel |
| demainvousappartient | 98 | 0 (manquant) | 0 |
| onlacherien | 82 | 0 (manquant) | 0 |
| allolamartingale | 58 | 0 (manquant) | 0 |
| fleurons | 6 | 0 (manquant) | 0 |
| **TOTAL** | **3 354** | **2 355 (70 %)** | 710 |

### 3.3 Pépites cachées identifiées

1. **`cross_podcast_guests.brief_md`** — 62 briefs prêts, exposés via 1 endpoint mais 1 seul (Larchevêque) cliquable depuis hub
2. **`episodes_enrichment.search_text`** — 2 355 textes prêts pour recherche, jamais query-able publiquement (RAG interne uniquement)
3. **`episode_links.link_type`** — 35 775 liens classifiés en 7 types, pas exposés
4. **`episodes.cross_refs` jsonb** — refs détaillées par épisode, exposées partiellement via `/api/cross/references`
5. **`learning_paths`** — schema complet, table vide
6. **`entities`** — schema polyvalent, table vide

---

## 4 — Inventaire livrables stockés

### 4.1 Tableau complet par tenant

| Tenant | Episodes | Briefs invités | 5-livrables (packs) | Quiz | Embeddings | Cross-refs | Articles riches |
|---|---|---|---|---|---|---|---|
| lamartingale | 294 | (62 cross global) | 1 (Boissenot #174) | 1 315 | 259 | partiel | 710 globaux |
| gdiy | 963 | (idem) | 1 (Plais #266) | 2 736 | 959 | partiel | partiel |
| lepanier | 506 | (idem) | 1 (Doolaeghe #128) | 683 | 506 | partiel | partiel |
| finscale | 338 | (idem) | 1 (Veyrat #107) | 658 | 332 | partiel | partiel |
| passionpatrimoine | 198 | (idem) | 0 | 285 | 195 | partiel | partiel |
| combiencagagne | 105 | (idem) | 0 | 129 | 104 | partiel | partiel |
| iftd | 706 | (idem) | 0 | 0 | 0 | 0 | 0 |
| demainvousappartient | 98 | (idem) | 0 | 0 | 0 | 0 | 0 |
| onlacherien | 82 | (idem) | 0 | 0 | 0 | 0 | 0 |
| allolamartingale | 58 | (idem) | 0 | 0 | 0 | 0 | 0 |
| fleurons | 6 | (idem) | 0 | 0 | 0 | 0 | 0 |
| **TOTAL** | **3 354** | **62/1 261 cross** | **4 (0,12 %)** | **5 806** | **2 355 (70 %)** | **45 757 paires** | **710** |

### 4.2 Les 4 packs pilote

Stockage : `experiments/autonomy-session-2026-04-28/pack-pilote-stefani-orso-v3-final/{slug}/` (gitignore, local-only).

| Slug | Eps | Format | Taille |
|---|---|---|---|
| `boissenot-pokemon` | LM #174 | 5 fichiers .xlsx + .docx | ~50 KB |
| `nooz-optics` | LP #128 | 5 fichiers .xlsx + .docx | ~45 KB |
| `plais-platform-sh` | GDIY #266 | 5 fichiers .xlsx + .docx | ~70 KB |
| `veyrat-stoik` | Finscale #107 | 5 fichiers .xlsx + .docx | ~55 KB |

---

## 5 — Capacités non-évidentes

### 5.1 Système de prompts LLM

- **Pas de templates externalisés** : prompts inline dans chaque module (`engine/primitives/*.ts`, `engine/agents/*.ts`).
- Versionnés via git uniquement.
- Few-shot corpus : `data/style-corpus/stefani/` (6 newsletters Stefani indexées via `loadStyleCorpus()`).
- Configuration tone Stefani-Orso : `clients/stefani-orso.config.ts` (forbidden_patterns, prefer_vocabulary, host_blacklist_phrases).

### 5.2 Système lens (angles d'analyse)

- **Curated, non-dynamic** — 5 lens hardcodés dans `clients/stefani-orso.config.ts` :
  - `ovni-vc-deeptech` (scaleup B2B)
  - `alternative-investments` (collectibles, crypto, niches)
  - `dtc-acquisition-tactical` (e-commerce DTC)
  - `b2b-insurance-tech` (insurtech B2B)
  - `editorial-base` (fallback large)
- Scoring : Sonnet délègue + `concept-match-v1` déterministe en backup.
- Threshold per-lens (b2b-insurance 0,5 ; éditorial-base 0,6 ; autres 0,3).

### 5.3 Cache (engine/cache.ts)

- **Dual-tier** : Memory LRU (500 entrées) + Vercel KV en prod
- Tenant-namespacé : clés `cache:${tenantId}:${key}`
- TTL configurable par appel `getCached(key, ttl, fn)`
- Invalidation : `clearCache(prefix?)` + endpoint `POST /api/cache/clear` (admin)

### 5.4 Auth (engine/auth/)

- **Magic-link** par email Resend
- Cookie HMAC-signed (signSession)
- RBAC : `viewer` (liste de tenant_ids autorisés) ou `root` (tenant_id = `*`)
- Middleware : `requireHubAuth` / `requireRoot` / `optionalHubAuth`

### 5.5 Multi-tenant isolation

- `getConfig()` résolve `PODCAST_ID` env var
- Tous les queries SQL filtrent `WHERE tenant_id = tenant()`
- Cache préfixé tenant
- Vercel : 1 projet par tenant (config dans `vercel-configs/vercel-{id}.json`)

### 5.6 Rate limiting / monitoring

- Rate limit : config par-tenant `cfg.scraping.rateLimit` (default 2 000 ms) — uniquement pour le scraping, pas l'API publique
- Monitoring : `console.log` inline + `/api/cache/stats` + `engine/ai/dashboard.ts`
- Pas d'instrumentation OpenTelemetry, pas d'alerting, pas de tracing

### 5.7 Webhooks / intégrations externes

- Resend (email magic-link entrant uniquement)
- Vercel CLI (deploy)
- **Pas** de n8n, **pas** de Zapier, **pas** de webhooks sortants

### 5.8 Export / publishing

- Formats output : `markdown` (legacy), `docx` (officegen), `xlsx` (exceljs), `pdf` (`NotImplementedError`)
- Channels : `localZipChannel`, `driveChannel` (squelette `NotImplementedError`)
- Dispatcher générique : `engine/output/formats/dispatcher.ts`
- Pipeline `produceClientPack` : injectable, testable, prêt pour V2

### 5.9 Configuration multi-tenant

- 11 instances dans `instances/{id}.config.ts` + 1 hub spécial dans `engine/config/hub.config.ts`
- Registry centralisé dans `engine/config/index.ts`
- Frontend `v2.html` config-driven via `/api/config`

---

## 6 — Commandes CLI

### 6.1 CLI factory (cli/index.ts)

| Commande | Args | Cas d'usage | Idempotence |
|---|---|---|---|
| `init` | `--name`, `--rss`, `--color`, `--id?`, `--font?`, `--host?` | Créer nouveau podcast | Non (refuse si config existe) |
| `ingest` | `--podcast <id>`, `--force?` | Pipeline 10 étapes RSS→quiz→embeddings | Oui (upsert) |
| `deploy` | `--podcast <id>` ou `--all --exclude?` | Push Vercel + cache-clear | Oui |
| `refresh` | `--podcast <id>` | Nouveaux épisodes uniquement | Oui |
| `status` | — | Stats DB tous tenants | Oui |
| `cache-clear` | `--podcast <id>`, `--prefix?` | Invalide MEM + Vercel KV | Oui |

### 6.2 npm scripts

| Script | Commande | État |
|---|---|---|
| `dev` | `npx tsx engine/api.ts` | Actif |
| `cli` | `npx tsx cli/index.ts` | Actif |
| `scrape:rss` | `engine/scraping/scrape-rss.ts` | Actif |
| `scrape:deep` | `engine/scraping/scrape-deep.ts` | Actif (LM/finscale) |
| `embeddings` | `engine/ai/embeddings.ts` | Actif |
| `similarity` | `engine/ai/similarity.ts` | Actif |
| `dashboard` | `engine/ai/dashboard.ts` | Actif |
| `deploy:lm`, `deploy:gdiy`, ... `deploy:hub` | `cli/index.ts deploy --podcast <id>` | Actif |
| `test` | `vitest run` | Actif (715/715) |

### 6.3 Scripts ad-hoc utiles

- `scripts/run-guest-brief.ts` — génère 1 brief invité (`--guest-id <id> --write`)
- `scripts/bulk-guest-briefs.ts` — bulk briefs (à valider qualité)
- `scripts/audit-timestamps.js` — audit 35 timestamps Phase 6 packs
- `experiments/.../phase6-runner.ts` — pipeline pack pilote (slugs hardcodés)

---

## 7 — Synthèse — pépites prioritaires

### 7.1 Catégorisation

**A. Capacités utilisées activement (visible produit)** : 8 capacités — voir Strate 1A.

**B. Capacités générées mais non exposées (pépites cachées)** : 7 capacités — voir Strate 1B. **Estimation effort total pour exposer toutes les pépites au hub : ~25-35 h CC + ~$5 LLM**.

**C. Capacités implémentées mais pas généralisées (dormantes)** : 6 capacités — voir Strate 1C. **Effort total full-coverage : 3-4 jours CC + ~$1 850 LLM**.

**D. Cassé / non-implémenté** :
- `runPack()` orchestrateur (squelette throw)
- `pdfFormatter` (NotImplementedError, V2)
- `driveChannel` (NotImplementedError, V2)

### 7.2 Top 5 reco CC pour Scénario B

(Voir Strate 1E pour détails business — résumé technique ici.)

| # | Action | Endpoint impliqué | Effort | Coût LLM |
|---|---|---|---|---|
| **R1** | UI recherche sémantique réelle dans hub | `GET /api/cross/search?q=` | 3-4 h | $0 |
| **R2** | UI chat conversationnel cross-podcast | `POST /api/cross/chat` | 4-6 h | $0 (existant) |
| **R3** | Page lisible 1 pack pilote (Boissenot LM #174) | nouveau (parser md → HTML) | 6-8 h | $0 |
| **R4** | Embeddings 999 épisodes manquants (IFTTD/DVA/OLR/AlloLM/Fleurons) | `engine/ai/embeddings.ts` | 1-2 h | ~$5 |
| **R5** | 75 briefs invités cross-pod (vs 62 actuels) | `scripts/run-guest-brief.ts` × 13 | 2 h | ~$0.40 |

**Total top 5 : ~16-22 h CC + ~$5,40 LLM** (sous cap $10 Scénario B).

### 7.3 Risques signalés

- **Vol IP par concurrents (ex Beepers)** : R1 + R2 exposent publiquement le moteur de recherche/chat. R3 expose un pack pilote complet. Atténuation possible : auth-gate les pages "preview pour pilote" ou ne montrer que des extraits.
- **Sur-vente quantitative** : carte 4 hub mentionnerait "5 livrables / épisode" mais réalité 0,12 % couverture. Honnêteté requise dans la copy ("démontré sur 4 épisodes pilote").
- **Dette engine/universe.ts modifiée Scénario B** : ajout `totals.briefedGuests` est un toucher god-node, à monitorer.

### 7.4 Documentation à créer post-arbitrage

1. `docs/PIPELINE_5_LIVRABLES.md` — référence pipeline (état, commande, limites, idempotence, coût)
2. `docs/ROADMAP_V2.md` — ajouter axe `pipeline-livrables` (statut artisanal vs industrialisation)
3. Mise à jour `MEMORY.md` projet — fixer métrique 0,12 % couverture pour cohérence future

---

## 📌 État branche & coût audit

- Branche `feat/hub-v2-scenario-b` : figée à `e6807d2`. Working tree clean (sauf entries pause M5 + investigation 5 livrables non-commit dans `docs/scenario-b-decisions.md`).
- Coût LLM Scénario B : **3,05 ¢ / $10**. Audit = $0.
- Wall : ~50 min (3 agents parallèles + synthèse).

→ **Awaiting Claude.ai arbitrage scope M5 + email pitch + démo pilote.**
