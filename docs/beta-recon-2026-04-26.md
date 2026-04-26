# Beta Recon — `beta.lamartingale.io`

> Investigation menée le 2026-04-26 dans le cadre de la stratégie pilote Stefani. Méthode reproductible : scripts archivés sur la branche `recon/beta-lamartingale-2026-04-26`.

**Date :** 2026-04-26
**Scope :** Reconnaissance de sources publiques uniquement (RSS, Apple Podcasts page publique, homepage `lamartingale.io`, Linktree). **Aucune** tentative d'accès à `beta.lamartingale.io`, **aucune** soumission de formulaire, **aucun** scraping protégé.
**Sources sondées :** 5 flux RSS Audiomeans (LM principal, Allo LM, Le Panier, Finscale, Passion Patrimoine, Combien ça gagne) + page d'accueil `lamartingale.io` + Linktree `linktr.ee/lamartingale_media` + 5 pages d'épisodes récents `gdiy.fr`.

---

## Verdict

> **Pas de code public trouvé.** En revanche, le lien `https://beta.lamartingale.io` est **partagé en clair** dans **100% des 30 derniers épisodes du flux RSS La Martingale**, dans **53% des 30 derniers épisodes Allo La Martingale**, et sur le **Linktree LM** — sans accompagnement d'un code, ni d'un formulaire, ni d'une instruction "demander l'accès". La CTA standardisée est :
>
> > « La Martingale, c'est aussi un assistant IA qui vous apporte des réponses éclairées issues des interventions des experts passés au micro du podcast. **Pour tester, direction https://beta.lamartingale.io** »
>
> Cela suggère soit (a) que la beta est ouverte sans code (ou avec un gating cosmétique côté beta lui-même), soit (b) que le gating est entièrement géré sur la page beta (formulaire d'inscription / waitlist apparaissant après visite). Ce point ne peut pas être tranché depuis le périmètre autorisé : il faudrait ouvrir `beta.lamartingale.io` (interdit) ou écrire à Orso. **Recommandation : ouvrir le lien directement dans un navigateur. Si gating, demander l'accès à Orso.**

---

## Statistiques par flux RSS (top 30 épisodes les plus récents)

| Tenant | Items dans le flux | Mentions `beta.lamartingale.io` (top 30) | Total mentions (flux entier) | Mentions "code" (top 30) |
|---|---|---|---|---|
| **lamartingale** (LM principal) | 353 | **30 / 30** (100 %) | 353 | 6 (codes promo partenaires, voir ci-dessous) |
| **allolamartingale** | 61 | **16 / 30** (53 %) | 16 | 0 |
| **lepanier** | 526 | 0 / 30 | 0 | 0 |
| **finscale** | 569 | 0 / 30 | 0 | 0 |
| **passionpatrimoine** | 216 | 0 / 30 | 0 | 0 |
| **combiencagagne** | 117 | 0 / 30 | 0 | 0 |
| **gdiy** (RSS) | — | **flux RSS bloqué (HTTP 403 CloudFront)** | — | — |
| gdiy.fr (5 pages d'épisodes récents en fallback) | 5 scannées | 0 | — | 0 |

Période couverte par les 30 derniers épisodes LM principal : 03 nov. 2025 → 23 avr. 2026.

---

## Détail des mentions

### 1. Mentions `beta.lamartingale.io` — flux LM principal

Toutes les mentions reproduisent **strictement le même footer générique** appliqué à chaque description d'épisode (probablement template Audiomeans / Orso). Citation exacte de la CTA :

> « Pour s'abonner à la newsletter, c'est ici : https://lamartingale.io/ - La Martingale, c'est aussi un assistant IA qui vous apporte des réponses éclairées issues des interventions des experts passés au micro du podcast. **Pour tester, direction https://beta.lamartingale.io** - La Martingale est un média d'Orso Media. »

Aucune variation observée. Aucun code (alphanumérique, promo, invitation) n'accompagne cette CTA. **Le lien est présenté comme directement utilisable.**

### 2. Mentions "code" — flux LM principal (top 30)

Les 6 occurrences trouvées sont **exclusivement des codes promo partenaires commerciaux**, sans rapport avec la beta :

| # ép. | Partenaire | Code | Avantage |
|---|---|---|---|
| #314 | iDealwine | `MARTINGALE` | 30 € offerts pour 150 € d'achat |
| #313 | Dougs (compta) | `MARTINGALE` | 3 mois de comptabilité offerts |
| #312 | Goodvest | `MARTINGALE` | (réduction inscription) |
| #306 | Mes Finances Ma Liberté | `MARTINGALE` | (cf. description) |
| #304 | Bitstack | `MARTINGALE` | 5 € en Bitcoin offerts |
| #292 | Patrimovie | `MARTINGALE` | (cf. description) |

→ Aucun de ces codes n'est associé à `beta.lamartingale.io`.

### 3. Allo La Martingale (16 / 30)

Les 16 épisodes d'Allo LM qui mentionnent `beta.lamartingale.io` reprennent exactement le même footer LM. Les 14 autres ont un footer Allo LM légèrement différent (« testez notre outil pédagogique pour vous aider à prendre le contrôle de votre argent ») qui ne nomme pas la beta. Pas de code beta non plus.

### 4. Le Panier / Finscale / Passion Patrimoine / Combien ça gagne

**Aucune** mention de `beta.lamartingale.io` ni de code d'invitation. Les CTA sont propres à chaque podcast (ex : `lepanier.io` pour Le Panier). Cohérent avec le fait que la beta porte le nom du podcast LM.

### 5. GDIY

Le flux RSS Audiomeans GDIY renvoie HTTP 403 sur CloudFront (testé avec UA `Mozilla/5.0`, `iTunes/12.0`, `Apple Podcasts/1.0`, `Spotify/1.0`, `PodcastIndex/1.0` — tous bloqués depuis ce poste).

**Fallback** : scan de 5 pages d'épisodes récents `gdiy.fr` (Eloa Guillotin, Jean-Baptiste Kempf #536, Marwan Mery, Mathias Frachon #531, Lisa Azuelos #530) → **aucune mention** de `beta.lamartingale.io`, `beta`, `invitation`, `early access`, `waitlist`, `assistant ia`. Cohérent avec le fait que beta.lamartingale.io est un produit La Martingale, pas Orso cross-podcast.

---

## Points d'entrée publics identifiés

1. **`https://beta.lamartingale.io`** — lien direct (mentionné dans 354 endroits cumulés). Non testé volontairement.
2. **`https://lamartingale.io/`** — homepage. Server-rendered HTML très léger (4.5 ko de texte). Contient un formulaire newsletter :
   > « S'inscrire à la newsletter — Ne manquez aucun épisode ! Un email tous les 15 jours pour vos finances perso. »
   - Pas de mention beta visible côté HTML server-rendered (le contenu est probablement hydraté côté client, mais ce n'est pas exploré).
   - **Action manuelle suggérée** : s'inscrire à la newsletter pour voir si un code/lien beta arrive par email.
3. **`https://linktr.ee/lamartingale_media`** — confirme le lien `https://beta.lamartingale.io` en clair. Texte associé identique au footer RSS.
4. **Réseaux mentionnés sur le linktree** (à explorer manuellement si besoin) :
   - YouTube La Martingale
   - Instagram `lamartingale_media`
   - TikTok `lamartingale_media`
   - X/Twitter `martingalela`
   - WhatsApp : `wa.me/33749761167` (canal Allo LM, pour poser des questions à l'antenne)

---

## Pistes d'inscription publiques (non testées — à toi de jouer)

| Action | URL | État |
|---|---|---|
| Visiter `beta.lamartingale.io` | https://beta.lamartingale.io | **Non testé** (hors périmètre). C'est l'action #1 à faire en navigateur. |
| S'inscrire newsletter LM | https://lamartingale.io/ | Form existant, non soumis. Possible canal de réception code/invite. |
| WhatsApp Allo LM | wa.me/33749761167 | Pour question à l'antenne (peu probable d'aboutir au code) |
| Demander à Orso | mail Matthieu Stefani / Orso | Si gating effectif après visite directe |

---

## Méthodologie & traçabilité

- Flux RSS téléchargés via `curl -sSL` avec UA navigateur, stockés dans `experiments/beta-recon/feeds/`.
- Parsing XML maison (`scan.mjs`, `extract-beta-context.mjs`, `scan-html.mjs`, `scan-gdiy.mjs`) — extraction `<item>` + `<title>` + `<description>` + `<itunes:summary>` + `<content:encoded>` + `<pubDate>`.
- Patterns recherchés : `beta\.lamartingale\.io`, `\bbeta\b`, `\binvitation`, `early[\s-]?access`, `waitlist|liste d.attente`, `\bpreview\b`, `code d.acc[èe]s`, `code\s+(promo|partenaire|invitation|d.acc|beta|exclusif|martingale|stefani)`, `assistant\s+(ia|ai)`.
- Résultats détaillés dump JSON : `experiments/beta-recon/scan-result.json`, `experiments/beta-recon/beta-mentions.json`.
- **Note GDIY** : `feed.audiomeans.fr` et `feeds.audiomeans.fr` retournent tous deux 403 sur ce CDN depuis ce poste. À retenter depuis un autre IP/réseau si besoin de couverture exhaustive GDIY (959 épisodes en BDD).

---

## Recommandation finale

1. **Ouvrir `https://beta.lamartingale.io` directement dans un navigateur** — c'est l'angle non testé. Si la page invite à entrer un code, alors le code n'est pas public.
2. Si gating effectif → s'inscrire à la newsletter via `lamartingale.io/` (canal le plus probable de réception d'invite/code) **et/ou** écrire à Orso Media en mentionnant ton intérêt pour la beta.
3. Ne pas perdre de temps à creuser GDIY/LP/Finscale/PP/CCG : la beta n'est promue que sur le périmètre LM (LM principal + Allo LM).
