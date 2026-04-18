# La Martingale — Audit data croisé site & RSS

**À l'attention de :** Matthieu Stefani & l'équipe Orso Media
**De :** Jeremy Henry — projet indépendant data autour de La Martingale
**Date :** 18 avril 2026
**Sujet :** Retour qualité données sur l'archive du podcast (313 épisodes)

---

## En un mot

J'ai passé les dernières semaines à construire une base de données enrichie autour des 313 épisodes de La Martingale (transcriptions d'articles, recherche sémantique, quiz adaptatifs, etc. — projet perso, 100 % admirateur du podcast). En croisant systématiquement trois sources — **le site lamartingale.io**, **le flux RSS Audiomeans**, **les pages épisode elles-mêmes** — j'ai repéré quelques petites incohérences qui peuvent mériter un coup d'œil côté CMS.

**Rien d'urgent.** L'archive est globalement propre — 99 % des épisodes ont une page article, 93 % ont un vrai chapitrage H2, la synchronisation RSS/site fonctionne. Ce document liste les 5 anomalies résiduelles.

---

## Résumé exécutif

| # | Sujet | Impact | Volume |
|---|---|---|---|
| 1 | Un épisode sans page web | Invisible en SEO & apps | **1 ép** (#224) |
| 2 | Désynchronisation titre site / RSS | Non-match dans apps podcast | **4 ép** |
| 3 | URL CMS partagée entre 2 numéros | Mauvaise redirection depuis les apps | **2 ép** (#262/#264) |
| 4 | Articles sans sous-titres H2 | SEO & lisibilité dégradés | **~22 ép** à vérifier |
| 5 | Écart bios invités consolidées | Potentiel annuaire invités | **~233 noms** à structurer |

---

## 1. Un épisode sans article publié

**Épisode #224 — "Crowdfunding et immobilier fractionné : la fin de la récré ?" (Yann Balthazard, 25 juillet 2024)**

L'épisode existe dans le flux RSS Audiomeans (donc écoutable sur Spotify, Apple Podcasts, etc.), mais aucune page article `/tous/…` n'a pu être trouvée sur lamartingale.io. J'ai testé cinq variantes de slug plausibles — toutes en 404.

> **Conséquence concrète :** un visiteur qui cherche « Yann Balthazard » ou « crowdfunding fractionné » sur Google ne retrouve pas l'épisode via votre site. Les autres canaux (Spotify, YouTube potentiellement) prennent le relais, mais la valeur SEO est perdue.

**Recommandation :** republier un article dédié, ou rediriger vers un épisode proche si le contenu a été remplacé.

---

## 2. Quatre épisodes mal synchronisés entre site & RSS

Les titres diffèrent entre la page lamartingale.io et le flux RSS Audiomeans, au point qu'un moteur de recherche automatique ne retrouve pas l'épisode dans les deux sources sous le même identifiant.

| # | Titre côté site |
|---|---|
| #307 | La décennie qui va tout changer |
| #295 | Comment gagner de l'argent grâce au luxe de seconde main ? |
| #291 | Private Equity : les 3 critères pour identifier les meilleurs gérants |
| #174 | L'essor des cartes Pokémon : une aubaine pour investir ? |

> **Conséquence concrète :** si une app podcast tente de lier un épisode RSS à un article web (ce que Google, Apple et certaines extensions font), elle n'y parvient pas pour ces quatre. L'épisode s'affiche, mais sans les métadonnées enrichies.

**Recommandation :** aligner le titre RSS sur le titre du site (ou inversement). C'est une modif CMS simple côté Audiomeans.

---

## 3. Deux numéros d'épisode pointant sur la même URL

- Slug `investir-comme-chez-goldman-sachs` partagé par **#262** et **#264**.
- (Les 22 « slugs vides » que vous verrez parfois évoqués dans des audits proviennent d'un import historique côté projet, pas d'une anomalie site — voir section 4.)

> **Conséquence concrète :** un auditeur qui clique sur le lien de l'épisode #264 depuis son app podcast arrive sur la page de l'épisode #262 (ou vice-versa). Soit les deux sont bien la même rediffusion — auquel cas il suffit de ne garder qu'un numéro dans le RSS — soit c'est une erreur de slug CMS qu'il faut corriger.

**Recommandation :** clarifier si #264 est une rediffusion de #262 ou un épisode distinct, et ajuster la numérotation RSS ou le slug.

---

## 4. 22 articles anciens sans chapitrage H2 (SEO)

Sur ~20 épisodes dans la plage #126–#279, la page article ne comporte aucun sous-titre `<h2>`. Les moteurs de recherche (et les lecteurs humains) ne peuvent donc pas naviguer rapidement dans le texte.

C'est probablement lié à un template éditorial plus ancien, utilisé avant d'adopter le format « Les cases à ne pas oublier — … » systématique qu'on voit sur les épisodes récents.

> **Conséquence concrète :** ces 22 articles sont moins bien référencés sur Google (Google valorise la structure `h2/h3`), et sont moins agréables à parcourir sans ctrl+F. Pour un lecteur qui arrive sur l'article via un featured snippet, le décrochage est plus rapide.

**Recommandation :** batch éditorial d'ajout de 3-5 H2 sur les anciens articles. Pour un stagiaire ou un rédacteur, c'est ~1 h par article. Impact SEO mesurable sous 2-3 mois. Liste précise disponible sur demande.

---

## 5. Annuaire d'invités — opportunité de consolidation

Sur les 313 épisodes, il y a **~261 noms d'invités distincts**. Actuellement, seuls ~28 sont consolidés quelque part avec une bio formelle (si j'interprète correctement la structure apparente du site). Pour les 233 autres, la bio, l'entreprise et les liens LinkedIn sont uniquement dans le corps de l'article.

> **Conséquence concrète :** difficile pour un visiteur de retrouver « tous les épisodes avec *tel* invité » ou « tous les invités qui ont parlé de SCPI ». Une page annuaire `/invites/` permettrait ça, et est un très bon aimant SEO (pages peu concurrentielles sur des noms propres).

**Recommandation :** partir des **9 901 liens** qu'on peut déjà extraire automatiquement des articles (dont 545 LinkedIn distincts d'invités/intervenants) pour peupler une table d'invités. Si l'équipe est intéressée, je peux partager le script d'extraction.

---

## Annexe — Chiffres globaux (pour contexte positif)

| Dimension | Valeur |
|---|---|
| Épisodes numérotés | 313 (range #1–#313) |
| Trous de numérotation | **0** — continuité parfaite |
| Articles propres (>200 caractères) | 312 / 313 (99,7 %) |
| Articles avec H2 | 290 / 313 (92,7 %) |
| Épisodes matchés RSS | 309 / 313 (98,7 %) |
| Durée moyenne | 65 minutes |
| Liens externes moyens par article | ~32 |
| Invités avec LinkedIn identifié | 259 profils uniques |

Franchement, pour une archive de **9 ans et 313 épisodes** gérée dans un CMS et un host RSS séparés, ce niveau de propreté est remarquable. La plupart des podcasts que j'ai regardés ont un taux d'anomalies bien supérieur. Bravo.

---

## Si vous êtes curieux

Je serais ravi de partager :
- Le dataset complet (embeddings sémantiques, liens classifiés, bios extraites) en lecture,
- Une démo de la plateforme que j'ai construite autour (recherche sémantique, quiz adaptatifs, RAG pour poser des questions à l'archive).

C'est un projet 100 % non-commercial, purement par goût du podcast et des données. Si ça peut nourrir une réflexion produit chez Orso — ou juste vous amuser 2 minutes — n'hésitez pas.

**Contact :** jeremyhenry974@gmail.com — projet : https://lamartingale.vercel.app

---

*Ce document a été généré à partir d'un croisement automatique site + RSS + scraping. Données et méthodologie disponibles sur demande.*
