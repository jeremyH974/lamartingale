# Short-list épisodes pilote — Rapport algorithmique

> Short-list algorithmique des 4 épisodes pilote Stefani générée le 2026-04-27.
> Méthode multi-couches (cross-refs Sillon + Wikipedia API + filtres temporels).
> 5 podcasts × top-5 candidats. Validation finale Jérémy lundi matin.
> Méthodologie complète (scripts + données brutes) archivée en local dans
> `experiments/episode-shortlist/` (sandbox gitignored).

**Date** : 2026-04-26
**Objectif** : produire 5 candidats par podcast Orso (top-5) pour
sélection finale 4 épisodes pilote (1 par podcast). Période 2021-2023,
invité non-grand-public, faible mentions externes.

---

## Résumé exécutif

- Catalogue scanné : **1 012 épisodes** (5 tenants × 2021-2023)
- Éligibles après filtres titre/guest : **604 épisodes**
- Invités uniques interrogés Wikipedia : **546**
- Sources de scoring effectivement utilisées : **2/3** (Cross-refs + Wikipedia)
- Sources skippées : **Apple Podcasts reviews** (endpoint iTunes RSS retourne 0 reviews — non utilisable)
- Top-5 par podcast : ✅ 5 podcasts couverts
- Coût APIs : **$0** (toutes sources gratuites)
- Qualité du scoring (auto-évaluation) : **Acceptable** (2/3 sources, beaucoup d'ex-aequo départagés par tie-breaker temporel)

---

## Méthodologie

### Sources évaluées

| Source | Statut | Raison |
|---|---|---|
| Cross-refs sortants (`episodes.cross_refs` JSONB) | ✅ Utilisée | Source interne Sillon, robuste |
| Cross-refs entrants (autres eps citant celui-ci via `episode_ref`) | ⚠️ Signal faible | Seulement **10 entries** dans tout le catalogue — `cross_refs.episode_ref` peu rempli en BDD. Composante incluse mais quasi-uniforme (in_refs=0 partout) |
| Wikipedia FR (page existante pour invité) | ✅ Utilisée | Rate-limit 1 req/sec, cache mémoire, 49/546 erreurs (timeout 5s) gracefully ignorées |
| Apple Podcasts reviews (iTunes RSS `customerreviews`) | ❌ Skippée | Endpoint retourne `0 reviews page1` pour tous les podcasts testés (FR, ids canoniques) — fragile / format changé. Documenté dans `probe-sources.ts` |
| SerpAPI / Twitter API | ❌ Exclues | Payantes, hors budget aujourd'hui |

### Scoring composite "épisode perdu" [0..1]

| Composante | Poids | Mapping |
|---|---|---|
| `cross_refs` sortants (out_refs) | **0.30** | 0 → 1.0, 5+ → 0.0 (linéaire) |
| `cross_refs` entrants (in_refs) | **0.30** | 0 → 1.0, 3+ → 0.0 (linéaire) |
| Wikipedia invité (has_wiki) | **0.40** | non → 1.0, oui → 0.0 |

**Pondération dynamique** : si Wikipedia indisponible (timeout), poids redistribués sur les 2 autres (0.30/0.30 → 0.50/0.50). Documenté par-épisode dans `components_used`.

### Filtres pre-scoring

- `date_created` ∈ `[2021-01-01, 2024-01-01)`
- `guest_name` non-vide (COALESCE `guest` ← `guest_from_title` ← `guests.name` via `guest_episodes`)
- Titre exclu si match `[EXTRAIT] | HORS-SÉRIE | Best of | [SUMMER | [PATRIMONIA | [REDIFF | TRAILER | "notre mission"`

### Tie-breaker (post-process)

Ex-aequo composite très fréquents (~0.88 ou 1.00) → tri secondaire :
1. **Composite DESC**
2. **Proximité date au 2022-07-01 DESC** (préférence pour le milieu de la fenêtre, évite les 1ers/derniers épisodes systématiques)
3. **Episode_number ASC**

### Rationale des poids

- Wikipedia est le signal le plus discriminant pour "non grand-public" — d'où poids 0.40.
- `out_refs` (cross_refs sortants) capture l'isolement éditorial (épisode ne référence pas d'autres → ilot autoportant) — proxy raisonnable mais imparfait, d'où poids 0.30.
- `in_refs` aurait dû dominer mais data sparse → poids 0.30 maintenu pour transparence (sera utile post-Phase 1.5 si denormalisation `episode_ref` enrichie).

---

## Couverture par podcast (avant filtres titre/guest)

| Tenant | Total | 2021-2023 | with_guest direct | Source guest_name |
|---|---|---|---|---|
| GDIY | 959 | 387 | 435 | `episodes.guest` direct |
| La Martingale | 313 | 150 | 313 | `episodes.guest` direct (100%) |
| Le Panier | 506 | 236 | 0 | `guest_from_title` (88) + `guests` table (140) — guest = **brand**, pas personne |
| Finscale | 332 | 164 | 259 | `episodes.guest` direct |
| Passion Patrimoine | 195 | 75 | 0 | `guest_from_title` (64) + `guests` table (121) |

---

## Top-5 par podcast

> Notation : `composite ↑ = plus "perdu"`. `out=cross_refs sortants`, `in=cross_refs entrants`, `wiki=page Wikipedia FR pour l'invité`.

### GDIY

| # | Ep | Date | Titre | Invité | Score | out | in | wiki |
|---|---|---|---|---|---|---|---|---|
| 1 | #267 | 2022-06-26 | Andréa Bensaïd - Eskimoz - Refuser 30 millions pour viser le milliard | Andréa Bensaïd | 0.88 | 2 | 0 | non |
| 2 | #266 | 2022-06-23 | Frédéric Plais - Platform.sh – Lever 140 M€ avec 100% de remote | Frédéric Plais | 0.88 | 2 | 0 | non |
| 3 | #269 | 2022-07-10 | Renaud Heitz - Exotec - Des robots au pays des licornes | Renaud Heitz | 0.88 | 2 | 0 | non |
| 4 | #264 | 2022-06-15 | David Brami - Point de Vente - Être sérieux sans se prendre au sérieux | David Brami | 0.88 | 2 | 0 | non |
| 5 | #270 | 2022-07-17 | Augustin Paluel-Marmont - Michel et Augustin | Augustin Paluel-Marmont | 0.88 | 2 | 0 | non |

**Note rédaction Jérémy** : Augustin Paluel-Marmont (Michel et Augustin) est probablement *trop* connu pour la cible "épisode perdu" malgré l'absence de page Wiki FR (à vérifier — il en a probablement une sous "Michel et Augustin"). Top-1 à 4 sont des fondateurs SaaS/scaleup B2B = sweet spot "lensClassificationAgent test".

### La Martingale

| # | Ep | Date | Titre | Invité | Score | out | in | wiki |
|---|---|---|---|---|---|---|---|---|
| 1 | #174 | 2023-08-09 | L'essor des cartes Pokémon: une aubaine pour investir ? | Alexandre Boissenot | 1.00 | 0 | 0 | non |
| 2 | #52 | 2021-02-17 | Investir dans l'art sans se tromper | Paul Nyzam | 0.88 | 2 | 0 | non |
| 3 | #51 | 2021-02-10 | Investir dans les montres de luxe de seconde main | Maximilien Urso | 0.88 | 2 | 0 | non |
| 4 | #50 | 2021-02-03 | Un an plus tard, la machine à construire du patrimoine | Victor Lora | 0.88 | 2 | 0 | non |
| 5 | #49 | 2021-01-27 | Comment investir dans les parkings ? | Alexandre Lacharme | 0.88 | 2 | 0 | non |

**Note rédaction Jérémy** : #174 Pokémon = candidat très fort (out_refs=0, niche pure). Épisode "perdu" exemplaire pour la démo.

### Le Panier

| # | Ep | Date | Titre | "Invité" (brand) | Score | out | in | wiki |
|---|---|---|---|---|---|---|---|---|
| 1 | #153 | 2022-03-29 | Catch-up Merci Handy : Rendre le monde ordinaire extraordinaire | Merci Handy | 0.94 | 1 | 0 | non |
| 2 | #139 | 2022-01-14 | Sunday Love : Du love, du hardware, du software et 3M€ en 2 ans | Sunday Love | 0.94 | 1 | 0 | non |
| 3 | #133 | 2021-12-10 | Emily's Pillow : De 0 à 1,6M€ de CA en 2 ans | Emily's Pillow | 0.94 | 1 | 0 | non |
| 4 | #128 | 2021-11-19 | Nooz Optics : Facebook Ads et Amazon pour faire 3M€ de CA en 18 mois | Nooz Optics | 0.94 | 1 | 0 | non |
| 5 | #122 | 2021-10-08 | Série Spéciale Paiement : les enjeux du paiement sur l'omnicanal | (multi) | 0.94 | 1 | 0 | non |

**Note rédaction Jérémy** : LP a une particularité éditoriale — le "guest" est le **brand** (entreprise), pas une personne. Wikipedia ne match jamais → score wiki=0 systématique. Le tri repose donc sur `out_refs + tie-breaker date`. Top-1 à 4 sont des cas e-commerce DTC niche (sweet spot "retail opérationnel"). Top-5 #122 est une série spéciale (multi-invités) — exclure de la sélection finale, choisir top-1 à top-4.

### Finscale

| # | Ep | Date | Titre | Invité | Score | out | in | wiki |
|---|---|---|---|---|---|---|---|---|
| 1 | #107 | 2022-07-02 | Jules Veyrat (Stoïk) - L'océan bleu de l'assurance "cyber" | Jules Veyrat | 1.00 | 0 | 0 | non |
| 2 | #106 | 2022-06-25 | Guilhem Chaumont (Flowdesk) - Le "Market Maker" crypto | Guilhem Chaumont | 1.00 | 0 | 0 | non |
| 3 | #105 | 2022-06-18 | Fabrice Staad (Alan) - Un "track" de 6 ans à couper le souffle | Fabrice Staad | 1.00 | 0 | 0 | non |
| 4 | #108 | 2022-07-16 | Eric Petitfils (Klarna) - Du BNPL à la "Shopping Company" | Eric Petitfils | 1.00 | 0 | 0 | non |
| 5 | #104 | 2022-06-11 | Béatrice Guez (Ai For Alpha) - Générer de l'alpha grâce à l'IA | Béatrice Guez | 1.00 | 0 | 0 | non |

**Note rédaction Jérémy** : Score parfait 1.00 pour les 5 (out=0, wiki=non). Tie-breaker temporel a sélectionné mid-2022. Tous niche fintech B2B.

### Passion Patrimoine

| # | Ep | Date | Titre | Invité | Score | out | in | wiki |
|---|---|---|---|---|---|---|---|---|
| 1 | #1 | 2022-10-25 | Karl Toussaint du Wast : les cryptos pour tous | Karl Toussaint du Wast | 0.94 | 1 | 0 | non |
| 2 | #2 | 2022-11-01 | Adrien Fiat : réussir sa reconversion dans la gestion de patrimoine | Adrien Fiat | 0.94 | 1 | 0 | non |
| 3 | #3 | 2022-11-08 | Stéphane Vonthron : dans la peau d'un asset manager | Stéphane Vonthron | 0.94 | 1 | 0 | non |
| 4 | #4 | 2022-11-15 | Victor Piriou : le franc-tireur du patrimoine | Victor Piriou | 0.94 | 1 | 0 | non |
| 5 | #5 | 2022-11-22 | Matthieu Navarre : le pro du placement star, la SCPI ! | Matthieu Navarre | 0.94 | 1 | 0 | non |

**Note rédaction Jérémy** : PP est le plus jeune podcast (lancement fin 2022), donc tous les "vrais" épisodes sont dans la fenêtre de tie-breaker. Tous CGP/asset managers spécialisés — public sectoriel. Très adapté à la mission "test sur context éditorial finance sectorielle".

---

## Recommandation pour Jérémy

### Sélection 4 épisodes pilote — proposition

| Podcast | Choix recommandé | Pourquoi |
|---|---|---|
| **GDIY** | **#266 Frédéric Plais (Platform.sh)** ou **#269 Renaud Heitz (Exotec)** | Fondateur SaaS B2B, growth 100M€+, peu connu grand public mais sujet riche. Éviter #270 (Augustin trop connu). |
| **La Martingale** | **#174 Pokémon (Alexandre Boissenot)** | Niche absolue, score parfait 1.00, sujet improbable = test fort pour `lensClassificationAgent`. |
| **Le Panier** | **#139 Sunday Love** ou **#128 Nooz Optics** | DTC e-commerce niche, growth 3M€, brand pas grand public. |
| **Finscale** ou **Passion Patrimoine** | choix Jérémy entre les deux | Diversité éditoriale visée : Finscale = fintech B2B / PP = CGP. Cf. arbitrage ci-dessous. |

### Arbitrage Finscale vs Passion Patrimoine (4e slot)

- **Finscale #107 Stoïk (cyber-insurance)** : sujet techy, fintech B2B, 0 cross-refs, invité inconnu grand public. Idéal pour démontrer `lensClassificationAgent` sur contenu *technique*.
- **PP #1 Karl Toussaint du Wast (cryptos)** : épisode #1 d'un nouveau podcast, sujet macro-grand public mais public sectoriel CGP. Plus *adjacent* à La Martingale qu'à Finscale → moins de diversité éditoriale gagnée.

**Suggestion** : retenir Finscale pour maximiser diversité (entrepreneuriat tech / finance personnelle / retail opérationnel / **fintech sectorielle**). PP en repli si Stefani veut ressentir l'écart fin avec La Martingale.

---

## Limites du scoring

1. **Wikipedia binaire** : "page existe ou non" ne capture pas la *taille* de la page (un sportif amateur peut avoir 3 lignes de page, un fondateur sérieux peut ne rien avoir). Future itération : compter pageviews 30j ou taille de la page.
2. **`in_refs` data sparse** : seulement 10 entries `episode_ref` non-null dans tout le catalogue → composante de poids 0.30 quasi-inutile aujourd'hui. À ré-exploiter post Phase 1.5 (denormalisation).
3. **Apple reviews** : endpoint cassé. Si Sillon a un budget pour scraper Reddit/X via API officielle, signal "mentions externes" pourrait être réintroduit.
4. **Brand vs personne** (Le Panier, Passion Patrimoine) : `guest_from_title` capture parfois des fragments de titres ("Catch-up", "Série Spéciale"). Refine post-process nettoie mais ne remplace pas un audit éditorial humain.
5. **Tie-breaker biaisé vers 2022** : par construction, on évite les 1ers/derniers eps de la fenêtre. Si Jérémy veut tester un épisode 2021 ou 2023 explicitement, il choisit dans le top-2/3 hors top-1.
6. **Wikipedia 49/546 timeouts** (~9%) : guests concernés ont `has_wiki=null` → composante skippée → score sur 2 composantes seulement. Robustesse acceptable, à raffiner si re-run.

---

## Validation requise

Jérémy lit ce REPORT lundi matin et :
- Confirme top-1 par podcast OU choisit top-2/3 selon sa connaissance terrain
- Décide entre Finscale et Passion Patrimoine pour le 4e slot (suggestion : Finscale)
- Sélection finale 4 épisodes pilote → injection dans la pipeline démo Stefani

---

## Reproductibilité

```bash
# 1. Probe sources (~30s)
npx tsx experiments/episode-shortlist/probe-sources.ts

# 2. Run scoring complet (~10 min Wikipedia rate-limited)
npx tsx experiments/episode-shortlist/score-lost-episodes.ts
# → écrit experiments/episode-shortlist/scored-episodes.json

# 3. Refine + tie-breaker
npx tsx experiments/episode-shortlist/refine-shortlist.ts
# → écrit experiments/episode-shortlist/shortlist-final.json
```

Outputs :
- `scored-episodes.json` — 604 épisodes scorés (raw)
- `shortlist-final.json` — top-5 par podcast après refine
- `run.log` — log d'exécution (progrès Wikipedia, errs, etc.)

Sandbox `experiments/episode-shortlist/` — gitignored, local-only.
