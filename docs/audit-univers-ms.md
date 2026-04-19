# Audit Univers MS — 19 avril 2026

Objectif : vérifier que chaque site de l'univers Matthieu Stefani exploite pleinement les données disponibles. Référence = **La Martingale** (seule instance où tout a été câblé de bout en bout).

Sites audités : **lamartingale · gdiy · lepanier · finscale · passionpatrimoine · combiencagagne · hub**
Méthode : requêtes SQL directes sur la BDD Neon partagée + `curl` sur chaque prod Vercel + inspection du HTML.
Script source : [`scripts/audit-univers-ms.ts`](../scripts/audit-univers-ms.ts).

---

## A. Contenu et enrichissement par tenant

Légende : ✅ complet · ⚠ partiel · ❌ manquant · — non applicable.

| Métrique                           | LM (référence)  | GDIY          | Le Panier     | Finscale      | Passion Patr. | Combien ça g. | Action requise |
|------------------------------------|-----------------|---------------|---------------|---------------|---------------|---------------|----------------|
| **Episodes total**                 | 313             | 959           | 506           | 332           | 195           | 104           | —              |
| — dont `full` (exposés via API)    | 309             | 537           | 505           | 332           | 156           | 65            | —              |
| — dont `bonus` / `trailer`         | 0 / 0           | 421 / 1       | 1 / 0         | 0 / 0         | 38 / 1        | 39 / 0        | —              |
| **Articles complets** (>200c)      | **296 (95%)**   | 468 (49%)     | ❌ 0          | ❌ 0          | ❌ 0          | ❌ 0          | **deep-scrape** 4 podcasts sans site ; envisager transcription pour GDIY (reste 491) |
| **Chapitres** (JSON curated)       | 296 (95%)       | 466 (49%)     | ❌ 0          | ❌ 0          | ❌ 0          | ❌ 0          | dérivés de `rss_chapters_ts` possible |
| Chapitres RSS (`rss_chapters_ts`)  | 2               | 364           | 138           | 0             | 0             | 0             | backfill ingest-rss pour GDIY/Le Panier |
| **Embeddings** (pgvector)          | 313 (100%)      | 959 (100%)    | 506 (100%)    | 332 (100%)    | 195 (100%)    | 104 (100%)    | ✅ tous classifiés |
| **Similarities** (paires)          | 6 260           | 19 180        | 10 120        | 6 640         | 3 900         | 2 080         | ✅             |
| **Tags IA** (`enrichment.tags`)    | 216 (69%)       | ❌ 0          | ❌ 0          | ❌ 0          | ❌ 0          | ❌ 0          | **lancer auto-taxonomy/tags** sur tous (sauf LM) |
| **Sub-themes**                     | 70 (22%)        | ❌ 0          | ❌ 0          | ❌ 0          | ❌ 0          | ❌ 0          | idem               |
| **Pillar classifié** (≠UNCLASSIFIED)| 313 (100%, 11) | 959 (100%, 19)| ❌ 0 (506 UNCL)| ✅ 331 (11)  | ❌ 0 (195 UNCL)| ❌ 0 (104 UNCL)| `classify-predefined --prune` sur **lepanier / passionpatrimoine / combiencagagne** |
| **Taxonomy table** (pillar meta)   | ✅ 10           | ✅ 19         | ❌ 0          | ❌ 0          | ❌ 0          | ❌ 0          | seed taxonomy à partir du config pour 4 podcasts |
| **Learning paths**                 | ✅ 6            | ❌ 0          | ❌ 0          | ❌ 0          | ❌ 0          | ❌ 0          | LM uniquement — potentiel à ouvrir ailleurs |
| **Quiz total**                     | 621             | 979           | ❌ 0          | ❌ 0          | ❌ 0          | ❌ 0          | générer quiz pour 4 podcasts |
| — dont avec `explanation`          | 238 (38%)       | 8 (<1%)       | —             | —             | —             | —             | régénérer les quiz GDIY pour ajouter explications |
| **Guests total**                   | 223             | 423           | 127           | 250           | 121           | 3             | CCG : n'a matché que 3 invités sur 104 eps → revoir extracteur |
| — LinkedIn                         | 222 (99%)       | 129 (30%)     | 108 (85%)     | 102 (41%)     | 113 (93%)     | 2 (67%)       | enrichir GDIY/Finscale via scrape-bios ou Clay |
| — bio                              | 23 (10%)        | 371 (88%)     | ❌ 0          | ❌ 0          | ❌ 0          | ❌ 0          | scrape-bios pour 4 podcasts ; LM à reprendre (peu enrichi) |
| — company                          | 27 (12%)        | ❌ 0          | ❌ 0          | ❌ 0          | ❌ 0          | ❌ 0          | extraction via guest_company episodes ou Clay |
| — authority_score                  | 28 (13%)        | ❌ 0          | ❌ 0          | ❌ 0          | ❌ 0          | ❌ 0          | recalcul script tous tenants |
| **episode_links total**            | 19 886          | 4 005         | 5 772         | 1 262         | 600           | 250           | —              |
| — linkedin                         | 1 748           | 499           | 917           | 131           | 162           | 20            | —              |
| — resource                         | 5 772           | 999           | 1 649         | 814           | 6             | 70            | PP à investiguer (6 ressources pour 195 eps) |
| — tool                             | 263             | 5             | 2             | 5             | 2             | 0             | extraction `tool` sous-exploitée partout sauf LM |
| — episode_ref                      | 5 908           | 765           | 787           | 0             | 1             | 65            | Finscale : RSS n'exprime pas de cross-ref |
| — company                          | 6 195           | 1 737         | 2 417         | 312           | 429           | 95            | —              |
| — cross_podcast_ref                | 0               | 0             | 0             | 0             | 0             | 0             | linker via CLI `match-guests` ou scrape dédié |
| **Thumbnails** (episodes_media)    | ✅ 287 (92%)    | ❌ 0          | ❌ 0          | ❌ 0          | ❌ 0          | ❌ 0          | tous les autres passent par `episode_image_url` RSS (suffisant ? à clarifier) |

### Champs RSS parsés (M4)

| Champ RSS                     | LM         | GDIY       | Le Panier | Finscale | Passion Patr. | CCG   |
|-------------------------------|------------|------------|-----------|----------|---------------|-------|
| `rss_topic`                   | 246 (79%)  | 1          | 62 (12%)  | ❌ 0     | 1             | ❌ 0  |
| `rss_discover`                | 59 (19%)   | 18         | 19 (4%)   | ❌ 0     | 1             | 1     |
| `rss_references`              | 193 (62%)  | ❌ 0       | ❌ 0      | ❌ 0     | ❌ 0          | ❌ 0  |
| `rss_promo`                   | 90 (29%)   | 8          | ❌ 0      | ❌ 0     | ❌ 0          | ❌ 0  |
| `rss_chapters_ts`             | 2          | 364 (38%)  | 138 (27%) | ❌ 0     | ❌ 0          | ❌ 0  |
| `youtube_url`                 | 49 (16%)   | 4          | ❌ 0      | 31 (9%)  | ❌ 0          | 1     |
| `sponsors`                    | 161 (52%)  | 49         | 26 (5%)   | 4        | 13 (7%)       | 1     |
| `cross_refs`                  | 309        | 959 (100%) | 506       | 7        | 195           | 104   |
| `guid` / `audio_url`          | 309 / 309  | 959 / 959  | 506 / 506 | 332/332  | 195 / 195     | 104/104|

**Constat** : les extracteurs `rss_topic/references/promo` de LM ne tournent pas sur les autres podcasts. La regex est spécifique au format Orso (description structurée "On parle de..."/"Retrouvez..."). Le format Cosa Vostra (GDIY/Le Panier) et Gokyo (Finscale) diffère.

### Podcast metadata (channel RSS)

| Champ             | LM  | GDIY | Le Panier | Finscale | PP  | CCG |
|-------------------|-----|------|-----------|----------|-----|-----|
| title / image     | ✅  | ✅   | ✅        | ✅       | ✅  | ✅  |
| owner_email       | ✅  | ✅   | ✅        | ✅       | ✅  | ✅  |
| social_links      | 4   | 13   | ❌ 0      | 1        | ❌ 0| ❌ 0|
| contact_emails    | ❌  | 3    | 1         | 1        | 1   | 1   |
| categories        | 1   | 3    | 2         | 3        | 3   | 3   |
| subtitle          | ❌  | ❌   | ❌        | ✅       | ✅  | ❌  |

---

## B. Endpoints API en production

`/api/config` et `/api/stats` répondent 200 sur tous les sites. Branding correct (couleur, nom, tagline) partout. Détail par endpoint critique :

| Endpoint                      | LM | GDIY | LePanier | Finscale | PP | CCG | Hub | Remarque |
|-------------------------------|----|------|----------|----------|----|-----|-----|----------|
| `/api/config`                 | ✅ | ✅   | ✅       | ✅       | ✅ | ✅  | ✅  | branding ok partout |
| `/api/stats`                  | ✅ | ✅   | ✅       | ✅       | ✅ | ✅  | —   | — |
| `/api/episodes?limit=3`       | ✅ | ✅   | ✅       | ✅       | ✅ | ✅  | —   | — |
| `/api/episodes/:num/full`     | ✅ riche | ✅ article+chap | ⚠ shell | ⚠ shell | ⚠ shell | ⚠ shell | — | tous renvoient 200, mais seuls LM/GDIY ont article_content |
| `/api/search/hybrid`          | ✅ + snippets | ✅ sans snippet | ✅ sans snippet | ✅ sans snippet | ✅ sans snippet | ✅ sans snippet | — | snippets absents partout sauf LM (dépend de `article_content`) |
| `/api/chat` (RAG)             | ✅ | ✅   | ✅       | ✅       | ✅ | ✅  | —   | GPT-4/Claude répond, 5 sources chacun ; sans article, réponses moins denses |
| `/api/guests/:name`           | ✅ | ✅   | ⚠        | ⚠        | ⚠  | ❌  | —   | CCG n'a que 3 guests |
| `/api/analytics/dashboard`    | 7 insights | 7 | 4 | 3 | 4 | 3 | —   | insights dégradés sans article/pillar/quiz |
| `/api/cross/stats`            | — | —    | —        | —        | —  | —   | ✅ 6 podcasts | 1908 eps / 1302 guests uniques |
| `/api/cross/guests/shared`    | — | —    | —        | —        | —  | —   | ✅ 59 | mais pollué par "[REDIFF]", "Jean" → bug match-guests |
| `/api/cross/search?q=X`       | — | —    | —        | —        | —  | —   | ✅  | cite plusieurs podcasts |
| `/api/cross/chat`             | — | —    | —        | —        | —  | —   | ✅  | cite lepanier+lamartingale+gdiy dans la réponse |

### Frontend

| Route                          | LM | GDIY | LePanier | Finscale | PP | CCG | Hub |
|--------------------------------|----|------|----------|----------|----|-----|-----|
| `/` (v2.html)                  | ✅ | ✅   | ✅       | ✅       | ✅ | ✅  | ✅  |
| `/episode/:id`                 | ✅ | ✅   | ✅       | ✅       | ✅ | ✅  | —   |
| `/v2-dashboard.html`           | ✅ | ✅   | ✅       | ✅       | ✅ | ✅  | —   |
| `/dashboard` (alias)           | 404| 404  | 404      | 404      | 404| 404 | 404 | rewrite manquant dans vercel-configs/*.json |

---

## C. Actions prioritaires — classées par ratio impact/effort

### P0 — Data fixes (haut impact, effort limité, 1 commande chacun)

1. **Classifier les pillars** sur Le Panier, Passion Patrimoine, Combien ça gagne (506+195+104 = 805 eps en `UNCLASSIFIED`)
   ```bash
   for t in lepanier passionpatrimoine combiencagagne; do
     PODCAST_ID=$t npx tsx engine/ai/classify-predefined.ts --prune
   done
   ```
   Débloque : `/api/stats.episodes_by_pillar`, filtres frontend, dashboard charts.

2. **Seeder la table `taxonomy`** pour les 4 podcasts sans entrée (lepanier, finscale, passionpatrimoine, combiencagagne). Les pillars sont définis dans `instances/*.config.ts` — il suffit de répliquer dans la table (name/icon/color/episodeCount).
   Impact : `/api/analytics/dashboard.total_pillars`, page homepage carte piliers.

3. **Régénérer les quiz** pour les 4 podcasts vides (Le Panier / Finscale / PP / CCG). Sans article_content, se baser sur `rss_description` (longueur ok partout). Même budget que GDIY (≈8 par épisode).

4. **Ajouter route `/dashboard`** dans les 7 fichiers `vercel-configs/vercel-*.json` :
   ```json
   { "source": "/dashboard", "destination": "/frontend/v2-dashboard.html" }
   ```

### P1 — Enrichissement guests (moyen effort)

5. **Enrichir bios + companies** pour Le Panier / Finscale / PP / CCG : aucun des 501 guests de ces 4 podcasts n'a de bio. Option A : LinkedIn scraping (108+102+113+2 profils urls déjà en BDD). Option B : extraction depuis `rss_description` (structure "Aujourd'hui je reçois X, fondateur de Y").

6. **CCG extraction guests défaillante** : 3 guests pour 104 episodes (0.03). L'extracteur prend des patterns comme "Combien ça gagne un journaliste ?" comme nom de guest. Corriger la regex d'extraction pour ce format.

7. **Recalculer authority_score** pour tous sauf LM (0 partout). Base : nb épisodes + longueur bio + présence LinkedIn + fréquence cross-podcast.

### P2 — Deep scraping (gros effort, seulement LM a un site)

8. **GDIY article backfill** : 491 eps sans article (`article_content` vide). Un site gdiy.fr existe-t-il ? Sinon, envisager transcription audio (Whisper) → permettrait snippets search + chat plus dense + chapitres auto. Coût non négligeable (≈$1/h × 1278h ≈ $1.2k).

9. **Le Panier / Finscale / PP / CCG** : pas de site article à scraper. À trancher :
   - Soit exploiter à fond `rss_description` comme source de vérité (toujours ≈300-500c utile) ; parser mieux via LLM plutôt que regex.
   - Soit transcription Whisper ciblée sur les épisodes long-format (>45 min).

### P3 — Hub et consistance

10. **Fixer `match-guests`** : "[REDIFF]", "Jean" remontent comme guests partagés dans `/api/cross/guests/shared`. Filtre blacklist ou require `total_podcasts ≥ 2 AND canonical_name matches /^[A-Z][a-z]+ [A-Z]/`.

11. **`cross_podcast_ref` = 0 partout** : aucun tenant n'a de liens classés comme référence à un autre podcast de l'univers. Potentiel cross-discovery non exploité. Reclassifier les `episode_ref` dont le domaine pointe vers un autre podcast MS.

12. **Tags / sub-themes** sur GDIY/Le Panier/Finscale/PP/CCG (0 partout, vs LM 216/70). Tourner `engine/ai/auto-taxonomy.ts` pour générer sous-thématiques — alimente `/api/analytics/dashboard.top_subthemes` et les filtres.

### P4 — RSS exhaustive backfill

13. **Extracteurs RSS** (`rss_topic`, `rss_discover`, `rss_references`, `rss_promo`) sont spécifiques au format Orso. Écrire des variantes **Cosa Vostra** (GDIY/Le Panier) et **Gokyo** (Finscale). Gain : 2400+ épisodes d'un coup, sans transcription.

14. **Backfill `rss_chapters_ts` ingest-rss.ts** : GDIY a 364 épisodes avec chapitres timestampés dans le RSS (Podcasting 2.0 `<podcast:chapters>` ou iTunes `<psc:chapter>`), Le Panier 138. Il suffit de dériver `chapters` depuis `rss_chapters_ts` quand `chapters` est vide — pas de scraping.

---

## D. Quick wins — commandes immédiatement exécutables

```bash
# 1. Classifier les 805 épisodes UNCLASSIFIED
for t in lepanier passionpatrimoine combiencagagne; do
  PODCAST_ID=$t npx tsx engine/ai/classify-predefined.ts --prune
done

# 2. Tags + sub-themes pour GDIY+4 autres
for t in gdiy lepanier finscale passionpatrimoine combiencagagne; do
  PODCAST_ID=$t npx tsx engine/ai/auto-taxonomy.ts
done

# 3. Dériver chapters depuis rss_chapters_ts (364+138 eps)
# -> écrire engine/scripts/chapters-from-rss.ts (30 lignes)

# 4. Vider le cache après chaque re-classification
curl -X POST "https://<site>.vercel.app/api/cache/clear" -H "x-admin-token: $ADMIN_TOKEN"
```

---

## E. État synthétique (0–10 par site)

Score : présence de (article · chapitres · pillar · taxonomy · guests-enriched · quiz · learning-paths · tags · thumbnails · RSS-parse-complet) / 10.

| Site              | Score | Commentaire                                          |
|-------------------|-------|------------------------------------------------------|
| **La Martingale** | **10/10** | référence complète                             |
| **GDIY**          | **6.5/10**| article partiel, pillar+taxonomy ok, bios ok, 0 tag, 0 learning path, chapters RSS à dériver |
| **Le Panier**     | **3/10**  | pillar/taxonomy absents, 0 quiz, 0 bio, 0 article  |
| **Finscale**      | **3.5/10**| pillar ok, taxonomy absente, 0 quiz, 0 bio, 0 article |
| **Passion Patr.** | **2/10**  | tout en UNCLASSIFIED, extractions RSS nulles         |
| **Combien ça g.** | **1.5/10**| 3 guests matchés pour 104 eps, tout vide             |
| **Hub**           | **7/10**  | cross-stats ok, cross-chat ok, match-guests pollué   |

**Plan suggéré** : exécuter P0 (1 après-midi) porterait Le Panier/Finscale/PP/CCG à 5/10 immédiatement sans scraping ni transcription.
