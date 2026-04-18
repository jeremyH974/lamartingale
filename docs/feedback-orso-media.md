# Feedback qualité de données — La Martingale / Orso Media

_Rapport automatique du pipeline data — 2026-04-18_

Auteur : projet indépendant La Martingale (Jeremy), à l'attention de Matthieu Stefani.

Ce rapport liste les incohérences détectées en croisant trois sources :
- **Site** lamartingale.io (articles par épisode)
- **RSS Audiomeans** (principal + Allô La Martingale)
- **Base de données** internes (313 épisodes, range #1-#313)

Pas urgent mais utile pour la propreté de l'archive et pour faciliter tout projet data tiers.

## 1. Trous dans la numérotation des épisodes

Aucun trou. La numérotation est continue sur [#1..#313].

## 2. Épisodes sans article sur le site

17 épisode(s) n'ont pas de page article trouvable sur lamartingale.io (ou article vide).

| # | Titre | Slug BDD |
|---|---|---|
| #232 | Crise des SCPI : a-t-on touché le fond ? | — |
| #231 | Négociation immobilière : tous les arguments pour la réussir ! | — |
| #230 | Travaux immobilier : comment rénover sans se ruiner ? | — |
| #229 | 3 millions d’étudiants à loger : c’est la rentrée des opportunités ! | — |
| #228 | Comment gérer l’argent de poche des enfants et ados ? | — |
| #227 | Orlinski, Combas, JR, Murakami : investir dans l’art contemporain quand on n’est pas millionnaire | — |
| #225 | Au-delà des géants : pourquoi s’intéresser aux small caps ? | — |
| #224 | Crowdfunding et immobilier fractionné : la fin de la récré ? | — |
| #219 | Booba, JuL, Gazo : comment investir dans leurs droits musicaux ? | — |
| #218 | Les crises se multiplient : vive les crises ? | — |
| #213 | Voitures de collection, montres, art, vin : le point sur le marché des actifs alternatifs en 2024 | — |
| #209 | Le guide ultime Airbnb : les 15 meilleurs conseils d'un insider | — |
| #208 | Halving, ATH & ETF BTC : on fait le point sur les cryptos en 2024 ! | — |
| #192 | Anticiper le coût de la dépendance de vos parents | — |
| #178 | Les 3 étapes pour négocier une augmentation | — |
| #173 | Les 5 questions incontournables à se poser avant d’investir | — |
| #126 | Investir dans le futur Bitcoin | — |

> Impact : ces épisodes sont dans le podcast (flux RSS) mais invisibles en SEO et dans tout moteur de recherche qui indexerait le site. Un visiteur qui cherche "Crise des SCPI : a-t-on touché le fond ?" ne retrouve pas l'épisode.

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

1 slug(s) partagé(s) par plusieurs numéros d'épisode :

| Slug | Épisodes | # concernés |
|---|---|---|
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
| Articles manquants | 17 |
| Non-match RSS | 4 |
| Sans chapitrage H2 | 0 |
| Slugs dupliqués | 1 |
| RSS orphelins | 0 |
| Liens LinkedIn uniques extraits | 263 |
