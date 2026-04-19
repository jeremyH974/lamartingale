# Rapport d'anomalies — LM + GDIY

**Audit technique réalisé en analysant systématiquement les deux catalogues (2026-04-19).**
**Audience : Matthieu Stefani — pitch Sillon.**

En extrayant et en croisant les contenus de [lamartingale.io](https://lamartingale.io) et [gdiy.fr](https://www.gdiy.fr) pour alimenter la plateforme, on a remonté **260+ anomalies** réparties sur les deux sites (1272 épisodes scannés). Ce rapport les inventorie.

Ce qui suit n'est pas une critique — c'est ce qu'on voit quand on traite du contenu éditorial à l'échelle. Chaque anomalie est un trou d'attribution, un manque de SEO ou un signal perdu pour la recherche IA.

---

## Résumé exécutif

| Métrique | La Martingale | GDIY |
|---|---|---|
| Épisodes (tous types) | 313 | 959 |
| Épisodes *full* | 309 | 537 |
| Bonus / trailers | 4 | 422 |
| Articles web complets (>500c) | **292 / 309 (94%)** | **468 / 537 (87%)** |
| Liens extraits et classifiés | 19 886 | 4 005 |
| Fiches invité LinkedIn | **221 / 223** | **499 liens détectés, 0 fiche persistée** |
| Anomalies totales | **25** | **235** |

---

## La Martingale — 25 anomalies

### A1. 17 épisodes avec slug vide (BDD ↔ site désynchronisés)

La colonne `slug` est vide pour 17 épisodes, donc la plateforme ne sait pas reconstruire l'URL vers `lamartingale.io/{slug}/`. Conséquence : pas d'article web, pas de chapitrage, pas de liens sortants.

Tous tombent dans une plage **#126 → #232**, donc ce sont des épisodes RSS qui n'ont **jamais eu** de page web publiée sous un slug canonique, ou dont le slug a été renommé après publication.

Exemples :
- #232 — *Crise des SCPI : a-t-on touché le fond ?*
- #231 — *Négociation immobilière : tous les arguments pour la réussir*
- #227 — *Orlinski, Combas, JR, Murakami : investir dans l'art contemporain…*
- #208 — *Halving, ATH & ETF BTC : on fait le point sur les cryptos en 2024*
- #178 — *Les 3 étapes pour négocier une augmentation*
- #126 — *Investir dans le futur Bitcoin*

Liste complète disponible dans `scripts/audit-anomalies.ts`.

**Impact** : SEO perdu (pages qui pourraient ranker), et pour la plateforme ces épisodes n'ont ni article, ni chapitrage, ni liens cités — **17/309 = 5.5% du catalogue est "aveugle"**.

**Action** : re-crawler le listing lamartingale.io pour retrouver les vrais slugs (certains articles existent probablement sous un titre différent), sinon publier les pages manquantes.

### A2. 4 épisodes sans match RSS ↔ site

Désynchronisation entre le titre du flux RSS et celui du site, qui empêche l'appariement automatique :

- **#307**, **#295**, **#291**, **#174**

Feedback déjà préparé pour Orso Media (`docs/feedback-orso-media.md`).

### A3. 4 épisodes sans image RSS ni durée

Quatre épisodes n'ont ni `episode_image_url`, ni `duration_seconds` dans le flux RSS — probablement bonus/trailers mal balisés. Visuel manquant sur la page épisode, durée non affichée.

### A4. Dette de données : `guest_bio` vs `guests.bio`

Les biographies sont stockées deux fois : dans la colonne `episodes.guest_bio` (88 remplis) et dans `guests.bio` (table normalisée). Probable duplication datant d'une ancienne migration — à arbitrer et nettoyer.

---

## GDIY — 235 anomalies

### G1. 68 épisodes *full* sans `article_url`

La colonne `article_url` n'est pas peuplée pour 68 épisodes récents et d'archive, donc pas de scrape web possible. Le contenu RSS sert de fallback (description longue, timeline, liens).

Exemples récents :
- #534 — *Sixte de Vauplane — Animaj*
- #533 — *Gaëlle Lebrat Personnaz — Manucurist*
- #532 — *Dominique Schelcher — Coopérative U*
- #531 — *[HORS-SÉRIE] Performance Intégrale*
- #523 — *Virginie Morgon — Ardabelle Capital*
- #506 — *Matthieu Ricard — Moine bouddhiste*
- #498 — *Mathieu Lehanneur — Paris 2024*

Toutes les pages `gdiy.fr/podcast/{slug}/` correspondantes **existent pourtant** — le problème est côté flux RSS (champ `<link>` manquant ou pointant ailleurs).

**Action Orso Media** : s'assurer que chaque item RSS expose `<link>https://www.gdiy.fr/podcast/{slug}/</link>`.

### G2. 95 épisodes sans info invité exploitable

Pour 95 épisodes (17,7% du catalogue *full*), ni le champ `guest` explicite du RSS ni le parsing du titre (`"#N - <nom> - <boîte> - <titre>"`) ne ressort un invité. Souvent des hors-séries, VO/VF, ou titres atypiques.

**Impact** : ces épisodes ne remontent pas dans la recherche par invité, pas dans le graph d'invités partagés LM ↔ GDIY.

### G3. Table `guests` vide pour GDIY (0 lignes)

La dénormalisation vers la table `guests` **n'a jamais tourné** pour GDIY. Conséquences :
- Pas de page invité (`/api/guests/:name`) côté GDIY
- Pas d'enrichissement biographique
- 499 LinkedIns détectés dans les liens RSS mais aucun rattaché à une fiche invité

**Action** : lancer le pipeline de dénormalisation `scripts/denormalize-linkedin.ts` (adapté pour GDIY).

### G4. 71 épisodes sans chapitrage extrait

71 épisodes (13%) n'ont pas de tableau `chapters` peuplé — soit l'article web n'a pas de `<h2>/<h3>` structurants, soit la TIMELINE RSS n'a pas été parsée correctement.

**Impact** : pas de snippet de chapitre dans la recherche hybride, pas de sommaire sur la page épisode.

### G5. 1 épisode avec structure HTML incohérente

- **#293 — Théau Peronnin — Alice & Bob** : la page `gdiy.fr/podcast/theau-peronnin-alice-bob/` existe mais ne matche pas les sélecteurs habituels (`.single__content.rich-text`). Probablement ancienne template WordPress ou contenu importé différemment. Stub extrait (<200c).

### G6. Biais éditorial côté liens "tool"

GDIY n'a que **5 liens** classifiés comme `tool` (Trade Republic, Boursorama, Revolut...) contre **263 côté LM**. Cohérent avec l'angle éditorial (storytelling entrepreneurs vs finance personnelle), mais à noter si objectif d'attribution d'outils.

---

## Anomalies transverses plateforme

### T1. Bug `scrape-deep` — tenant_id manquant (corrigé)

Le scraper insérait les `episode_links` sans `tenant_id`, brisant l'isolation multi-tenant sur les queries de type liens. Détecté pendant cet audit — fix + backfill dans le même commit.

### T2. Scrape-deep GDIY : 468/469 réussis

Passage `--force` complet sur les 469 épisodes GDIY avec `article_url` : 468 articles extraits, **1 stub** (G5), **0 404**, **0 erreur parse**. Moyenne 2918 caractères/article, 4 chapitres/article, 9980 liens extraits.

---

## Ce que Sillon apporte concrètement

Ce rapport est **un sous-produit** de l'ingestion — pas un audit séparé. Chaque fois que le contenu change (nouvel épisode, article modifié, lien cassé), le rapport se met à jour.

Ce que ça permet de faire :
1. **Hygiène éditoriale** continue (trous SEO, pages orphelines, images manquantes).
2. **Attribution précise** (liens outils/entreprises/épisodes comptés et datés).
3. **Recommandations de backlog** à Orso Media fondées sur du data, pas du ressenti.

Sur **1272 épisodes** on a remonté **260+ anomalies** concrètes — et on sait toutes les corriger.

---

*Rapport généré automatiquement via `npx tsx scripts/audit-anomalies.ts`. Rafraîchi à chaque run de `npm run refresh`.*
