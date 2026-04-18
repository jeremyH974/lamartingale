# Feedback qualité de données — La Martingale / Orso Media

_Rapport automatique du pipeline data — 2026-04-18_

Auteur : projet indépendant La Martingale (Jeremy), à l'attention de Matthieu Stefani.

Ce rapport liste les incohérences détectées en croisant trois sources :
- **Site** lamartingale.io (articles par épisode)
- **RSS Audiomeans** (principal + Allô La Martingale)
- **Base de données** internes (313 épisodes, range #1-#313)

Pas urgent mais utile pour la propreté de l'archive et pour faciliter tout projet data tiers.

---

> ⚠️ **Disclaimer sur la section 2 (articles manquants)**
>
> Parmi les 23 épisodes listés en section 2, **22 relèvent d'un problème interne à notre BDD**, pas d'une anomalie côté Orso / lamartingale.io :
>
> - Ces 22 lignes (range approximatif #126 à #279) ont un `slug` vide et des titres non-canoniques (ex. "5 regles or investissement", "Negocier augmentation", "Crise SCPI"). Ce sont vraisemblablement des résumés générés par LLM lors d'un ancien import, pas les titres de publication réels.
> - Leurs articles **existent sans doute sur lamartingale.io** sous leur vrai slug, mais notre BDD ne pointe pas dessus.
>
> Un seul cas est effectivement manquant côté site : **#224 "Crowdfunding et immobilier fractionné"** (Yann Balthazard) — présent dans le flux RSS Audiomeans mais aucune page `/tous/...` trouvable sur le site.
>
> Les autres sections (3, 5, 6, 7) concernent bien les données publiques (site + RSS) et constituent le vrai feedback.

---

## 1. Trous dans la numérotation des épisodes

Aucun trou. La numérotation est continue sur [#1..#313].

## 2. Épisodes sans article sur le site

23 épisode(s) n'ont pas de page article trouvable sur lamartingale.io (ou article vide).

| # | Titre | Slug BDD |
|---|---|---|
| #279 | Investir dans la terre |  |
| #241 | Meilleure carte bancaire |  |
| #232 | Crise SCPI |  |
| #231 | Negocier prix immobilier |  |
| #230 | Renover sans sacrifier rentabilite |  |
| #229 | Logements etudiants |  |
| #228 | Argent de poche |  |
| #227 | Art moderne contemporain |  |
| #225 | Small caps gros gains |  |
| #224 | Crowdfunding et immobilier fractionné : la fin de la récré ? | — |
| #221 | Immobilier 2024 opportunites |  |
| #219 | Investir rap francais |  |
| #218 | Investir en crise |  |
| #216 | Acheter revendre voiture |  |
| #213 | Actifs alternatifs 2024 |  |
| #209 | Guide Airbnb |  |
| #208 | Bitcoin ATH ETF 2024 |  |
| #206 | SARL famille vs SCI |  |
| #198 | ETF obligataires |  |
| #192 | Couts dependance parents |  |
| #178 | Negocier augmentation |  |
| #173 | 5 regles or investissement |  |
| #126 | Nouvelle crypto |  |

> Impact : ces épisodes sont dans le podcast (flux RSS) mais invisibles en SEO et dans tout moteur de recherche qui indexerait le site. Un visiteur qui cherche "Investir dans la terre" ne retrouve pas l'épisode.

## 3. Épisodes absents du flux RSS Audiomeans

4 épisode(s) sont sur le site mais non matchables dans le RSS principal :

| # | Titre |
|---|---|
| #307 | La décennie qui va tout changer |
| #295 | Comment gagner de l'argent grâce au luxe de seconde main ? |
| #291 | Private Equity : les 3 critères pour identifier les meilleurs gérants |
| #174 | L'essor des cartes Pokémon: une aubaine pour investir ? |

> Impact : les apps de podcast (Spotify, Apple, etc.) qui consomment le RSS ne voient pas ces épisodes sous leur numéro. Probable désynchronisation entre le titre du RSS et le titre du site.

## 4. Épisodes sans chapitrage (H2) dans l'article


## 5. Doublons d'URL (plusieurs épisodes pointent sur la même page)

2 slug(s) partagé(s) par plusieurs numéros d'épisode :

| Slug | Épisodes | # concernés |
|---|---|---|
| `` | 22 | #126, #173, #178, #192, #198, #206, #208, #209, #213, #216, #218, #219, #221, #225, #227, #228, #229, #230, #231, #232, #241, #279 |
| `investir-comme-chez-goldman-sachs` | 2 | #262, #264 |

> Impact : deux épisodes distincts du flux RSS pointent sur **le même article**. Probable ré-émission renumérotée (#264 = re-diffusion de #262 par exemple), ou erreur de slug dans le CMS. Un visiteur qui clique sur #264 dans son app podcast arrive sur l'article de #262.

## 6. RSS items orphelins (numéro présent dans RSS mais pas en archive)

Pas d'orphelin numéroté.

RSS items **non numérotés** : 171 (probablement des bandes-annonces, bonus, ou Allô La Martingale hors numérotation principale).

## 7. Bios invités — fragment à consolider

La table `guests` recense 28 personnes formellement, dont 26 avec un LinkedIn identifié.
En revanche, la colonne `episodes.guest` contient **261 noms uniques** (chaque épisode a un invité).

> Écart de ~233 noms : beaucoup d'invités ne sont pas consolidés dans la table `guests`. Pour un projet data, il serait utile d'uniformiser : même si un invité n'apparaît qu'une fois, sa bio + LinkedIn + entreprise ont leur place dans un annuaire central.

---

## Résumé chiffré

| Dimension | Métrique |
|---|---|
| Épisodes en archive | 313 (range #1-#313) |
| Trous de numérotation | 0 (—) |
| Articles manquants | 23 |
| Non-match RSS | 4 |
| Sans chapitrage H2 | 0 |
| Slugs dupliqués | 2 |
| RSS orphelins | 0 |
| Liens LinkedIn uniques extraits | 259 |
