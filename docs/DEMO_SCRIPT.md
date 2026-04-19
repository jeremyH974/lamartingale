# Script de démo — Pitch Matthieu Stefani

**Durée cible : 17 min · Audience : Matthieu Stefani · Date : 2026-05-19**

URLs :
- La Martingale : https://lamartingale-v2.vercel.app
- GDIY : https://gdiy-v2.vercel.app

---

## Préparation (J-1, 1h avant)

1. `curl -X POST https://lamartingale-v2.vercel.app/api/cache/warm` — pré-chauffe les 10 queries démo (~20s)
2. `curl -X POST https://gdiy-v2.vercel.app/api/cache/warm` — idem GDIY
3. `curl https://lamartingale-v2.vercel.app/api/demo/summary` — lit le cheat sheet, mémorise chiffres clés
4. Tester les 5 quiz des épisodes les plus récents LM (cf. `npm run verify-quiz`)
5. Ouvrir 4 onglets :
   - `/v2-dashboard.html` (LM)
   - `https://gdiy-v2.vercel.app/v2-dashboard.html`
   - `/episode/<dernier-id>`
   - `/v2.html` (section Recherche)

---

## Étape 1 — Dashboard créateur (3 min) — **OUVRIR AVEC ÇA**

URL : `/v2-dashboard.html`

> « Voici ce que personne ne t'a jamais montré sur ton propre podcast. »

Points à montrer :
- KPI hero (chiffres réels depuis `/api/demo/summary`)
- Timeline stacked par pilier — évolution depuis 2019
- Graph inter-épisodes : 450+ connexions
- Top outils (eToro, Boursorama...) en treemap
- Insights IA dynamiques (calculés, pas hardcodés)

**Réaction attendue** : « Je n'avais jamais vu ça. »

---

## Étape 2 — Cross-podcast LM ↔ GDIY (2 min)

URL : `https://gdiy-v2.vercel.app/v2-dashboard.html`

> « Et voilà le même dashboard pour GDIY. Tes deux podcasts connectés. »

- GDIY : 537 épisodes, 890h
- Invités partagés (`/api/demo/summary` → `cross_podcast.shared_guests`)
- Combined hours (1229h)

**Réaction attendue** : « C'est les deux ensemble ? »

---

## Étape 3 — Page épisode riche (2 min)

URL : `/episode/<dernier-id>`

> « Clique sur ton dernier épisode. »

- Article complet avec chapitrage
- Topics RSS structurés (Dans cet épisode)
- Ressources citées + liens
- Carte invité avec LinkedIn
- Épisodes similaires (87% match)
- Code promo parsé automatiquement

**Réaction attendue** : « Comment t'as récupéré tout ça ? »

---

## Étape 4 — Search + Chat IA (3 min)

URL : `/v2.html` → Recherche puis Assistant

Suggestions (si Matthieu hésite) :
- « Quels épisodes parlent de SCPI pour débutant ? »
- « Qu'est-ce que Nicolas Chéron dit sur le DCA ? »
- « Compare les conseils sur assurance vie vs PER »

À montrer :
- Résultats avec **snippet de chapitre matché** (`best_chapter`)
- Chat qui cite les épisodes par numéro, résume le contenu réel
- Rapidité (<1s grâce au cache warm)

> « Tu as beta.lamartingale.io. Ici la recherche est hybride (sémantique + lexical), les réponses citent les chapitres précis, et ça tourne sur Claude Sonnet. »

**Réaction attendue** : « C'est plus précis que ce qu'on a. »

---

## Étape 5 — Factory (2 min)

URL : `https://gdiy-v2.vercel.app`

> « GDIY, c'est 30 minutes de setup et $0.06 de coût. N'importe quel podcast avec un flux RSS. »

- Branding différent (noir + vert néon)
- Même architecture, même infra DB Neon partagée
- Cosa Vostra, Orso Media, Pauline Laigneau → tous en une semaine

**Réaction attendue** : « Tu peux faire ça pour tous nos podcasts ? »

---

## Étape 6 — Rapport d'anomalies (2 min) — **SURPRISE**

Sortir `docs/anomalies-sites-orso.md` imprimé ou en PDF.

> « Bonus. En ingérant ton contenu, on a fait un audit complet des deux sites. 260+ anomalies remontées sur 1272 épisodes. »

Points à montrer :
- 17 épisodes LM sans slug (5.5% du catalogue invisible pour SEO)
- 68 épisodes GDIY sans `article_url` dans le RSS (Orso Media à alerter)
- 95 épisodes GDIY sans info invité exploitable
- Table `guests` GDIY vide (pipeline de dénormalisation pas lancé)

**Réaction attendue** : « Tu me fais ce rapport pour nos autres podcasts ? »

**Message** : ce rapport est un sous-produit gratuit de l'ingestion — il se régénère à chaque refresh.

---

## Étape 7 — Sillon (3 min) — **CLOSER**

Pas de démo technique. Pitch verbal.

> « Tout ce que tu viens de voir, c'est l'infrastructure de Sillon.
>
> Sillon transforme tes archives éditoriales en revenus. Le mécanisme : ton contenu mentionne des outils (eToro N fois, Boursorama M fois). Sillon trace l'attribution : quand ton audience souscrit après avoir écouté ton épisode, tu touches une rétrocession.
>
> Tu as 1229 heures de contenu expert entre LM et GDIY. C'est un actif qui ne rapporte rien aujourd'hui. Sillon le monétise. »

**Question attendue** : « Comment ça marche concrètement ? »
**Réponse** : modèle d'attribution + split 50/50.

---

## Checklist post-pitch

- [ ] Noter les retours précis de Matthieu
- [ ] Identifier les features demandées pendant la démo
- [ ] Confirmer les suites (meeting de suivi, intro Cosa Vostra, etc.)

## Cheat sheet chiffres

À rafraîchir via `curl /api/demo/summary` avant la démo. Stocker la sortie JSON pour consultation mobile pendant le pitch.
