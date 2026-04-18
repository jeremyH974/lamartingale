# La Martingale — Audit data croisé site & RSS

**À l'attention de :** Matthieu Stefani & l'équipe Orso Media
**De :** Jeremy Henry — projet indépendant data autour de La Martingale
**Date :** 18 avril 2026
**Sujet :** Retour qualité données sur l'archive du podcast (313 épisodes)

---

## En un mot

J'ai passé les dernières semaines à construire une base de données enrichie autour des 313 épisodes de La Martingale (transcriptions d'articles, recherche sémantique, quiz adaptatifs, etc. — projet perso, 100 % admirateur du podcast). En croisant systématiquement trois sources — **le site lamartingale.io**, **le flux RSS Audiomeans**, **les pages épisode elles-mêmes** — j'ai repéré quelques petites incohérences qui peuvent mériter un coup d'œil côté CMS.

**Rien d'urgent.** L'archive est globalement propre — 94,6 % des épisodes ont une page article sur le site, 100 % de ces articles ont un chapitrage H2 propre, la synchronisation RSS/site fonctionne à 98,7 %. Ce document liste les 4 anomalies résiduelles.

---

## Résumé exécutif

| # | Sujet | Impact | Volume |
|---|---|---|---|
| 1 | Épisodes sans page article sur le site | Invisibles en SEO & pour apps podcast | **17 ép** (range #126–#232) |
| 2 | Désynchronisation titre site / RSS | Non-match dans apps podcast | **4 ép** |
| 3 | URL CMS partagée entre 2 numéros | Mauvaise redirection depuis les apps | **1 cas** (#262/#264) |
| 4 | Écart bios invités consolidées | Potentiel annuaire invités | **~233 noms** à structurer |

---

## 1. Dix-sept épisodes sans article publié sur le site

Ces 17 épisodes existent dans le flux RSS Audiomeans (donc écoutables sur Spotify, Apple Podcasts, etc.) mais aucune page article `/tous/…` n'est trouvable sur lamartingale.io — tous les slugs plausibles testés renvoient en 404.

Tous se situent dans la plage **#126–#232** (fin 2022 à mi-2024). Hypothèse : migration CMS partielle qui a perdu ces articles, ou choix éditorial de les retirer du site sans les dépublier du podcast.

| # | Titre (depuis le RSS) |
|---|---|
| #232 | Crise des SCPI : a-t-on touché le fond ? |
| #231 | Négociation immobilière : tous les arguments pour la réussir ! |
| #230 | Travaux immobilier : comment rénover sans se ruiner ? |
| #229 | 3 millions d'étudiants à loger : c'est la rentrée des opportunités ! |
| #228 | Comment gérer l'argent de poche des enfants et ados ? |
| #227 | Orlinski, Combas, JR, Murakami : investir dans l'art contemporain quand on n'est pas millionnaire |
| #225 | Au-delà des géants : pourquoi s'intéresser aux small caps ? |
| #224 | Crowdfunding et immobilier fractionné : la fin de la récré ? (Yann Balthazard) |
| #219 | Booba, JuL, Gazo : comment investir dans leurs droits musicaux ? |
| #218 | Les crises se multiplient : vive les crises ? |
| #213 | Voitures de collection, montres, art, vin : le point sur le marché des actifs alternatifs en 2024 |
| #209 | Le guide ultime Airbnb : les 15 meilleurs conseils d'un insider |
| #208 | Halving, ATH & ETF BTC : on fait le point sur les cryptos en 2024 ! |
| #192 | Anticiper le coût de la dépendance de vos parents |
| #178 | Les 3 étapes pour négocier une augmentation |
| #173 | Les 5 questions incontournables à se poser avant d'investir |
| #126 | Investir dans le futur Bitcoin |

> **Conséquence concrète :** ces 17 épisodes représentent une audience totale importante (cumulée) mais invisible sur Google. Un prospect qui cherche « Crise des SCPI » ou « investir dans l'art contemporain » ne retrouve pas l'épisode via votre site. Le podcast existe toujours dans toutes les apps, mais le trafic SEO web est perdu.

**Recommandation :** publier (ou re-publier) ces 17 pages article sur lamartingale.io, ou à défaut créer des redirections depuis un slug prévisible vers l'écoute Audiomeans. Un stagiaire peut traiter ça en 1-2 semaines.

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

Le slug `investir-comme-chez-goldman-sachs` est partagé par **#262** et **#264**.

> **Conséquence concrète :** un auditeur qui clique sur le lien de l'épisode #264 depuis son app podcast arrive sur la page de l'épisode #262 (ou vice-versa). Soit les deux sont bien la même rediffusion — auquel cas il suffit de ne garder qu'un numéro dans le RSS — soit c'est une erreur de slug CMS qu'il faut corriger.

**Recommandation :** clarifier si #264 est une rediffusion de #262 ou un épisode distinct, et ajuster la numérotation RSS ou le slug.

---

## 4. Annuaire d'invités — opportunité de consolidation

Sur les 313 épisodes, il y a **~261 noms d'invités distincts**. Actuellement, seuls ~28 sont consolidés quelque part avec une bio formelle (si j'interprète correctement la structure apparente du site). Pour les 233 autres, la bio, l'entreprise et les liens LinkedIn sont uniquement dans le corps de l'article.

> **Conséquence concrète :** difficile pour un visiteur de retrouver « tous les épisodes avec *tel* invité » ou « tous les invités qui ont parlé de SCPI ». Une page annuaire `/invites/` permettrait ça, et est un très bon aimant SEO (pages peu concurrentielles sur des noms propres).

**Recommandation :** partir des **9 901 liens** qu'on peut déjà extraire automatiquement des articles (dont 545 LinkedIn distincts d'invités/intervenants) pour peupler une table d'invités. Si l'équipe est intéressée, je peux partager le script d'extraction.

---

## Annexe — Chiffres globaux (pour contexte positif)

| Dimension | Valeur |
|---|---|
| Épisodes numérotés | 313 (range #1–#313) |
| Trous de numérotation | **0** — continuité parfaite |
| Articles propres sur le site (>200 c) | 296 / 313 (94,6 %) |
| Articles avec chapitrage H2 | 296 / 296 (100 %) |
| Épisodes matchés RSS | 309 / 313 (98,7 %) |
| Durée moyenne | 65 minutes |
| Liens externes moyens par article | ~33 |
| Invités avec LinkedIn identifié | 263 profils uniques |

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
