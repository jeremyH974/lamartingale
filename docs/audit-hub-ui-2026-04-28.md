# Audit Hub UI ms-hub.vercel.app — 2026-04-28

> **Contexte** — pré-envoi pilote Stefani. Audit 360° crédibilité sur le surface
> visible côté visiteur (proxy Stefani). Aucun fix appliqué, livrable unique
> = ce rapport.

## Méthode

**Routes auditées :**
- `/` (home hub agrégateur) — gated `requireHubAuth` sur `/api/universe`
- `/login` — public
- `/guest-brief/:slug` — public (SPA, fetch `/api/cross/guests/:slug/brief`)
- `/api/config` — public
- `/api/cross/guests/:slug/brief` — public
- `/api/universe` — gated 401 sans session

**Outils :**
- `curl.exe` HTTP probes (desktop + mobile UA `iPhone OS 17`)
- Parsing HTML brut + lecture statique de `frontend/hub.html`,
  `frontend/guest-brief.html`, `frontend/login.html`
- Queries SQL read-only Neon via `tsx` (2 scripts ad-hoc dans `.audit-hub/`,
  6 tables interrogées : `episodes`, `episode_links`, `cross_podcast_guests`,
  `guest_episodes`, `information_schema.columns`, et `engine/universe.ts`
  pour la query exacte des featured)
- Lighthouse mobile **non exécuté** : Chrome launcher échoue avec `EPERM` sur
  `%TEMP%\lighthouse.*` (limitation environnement Windows). Voir Annexe Lighthouse
  pour la commande à lancer manuellement.

**Audit gating** : la home hub `/` est gated par auth. Stefani aura un compte
→ je l'ai auditée par proxy via DB (la query universe.ts est répliquée dans
`.audit-hub/audit-queries.ts`), pas par crawl HTTP authentifié. Hypothèse :
ce qui sort de DB = ce qui s'affiche côté Stefani.

**Total bugs catalogués** : 17 (P0 = 4, P1 = 6, P2 = 7) — regroupés par cause
racine quand pertinent.

---

## P0 — Bloquant envoi pilote

### P0-1 — Doublon `#NUM #NUM` dans toutes les cards podcast GDIY / LP / PP / CCG

- **Bug** : la card podcast affiche le numéro d'épisode deux fois pour les 3
  featured de chaque podcast dont les titres RSS commencent déjà par `#NUM`.
  Stefani verra par ex. sur la card GDIY : `#535 #535 - Marwan Mery -
  Négociateur` , `#534 #534 - Sixte de Vauplane` , `#533 #533 - Gaëlle Lebrat
  Personnaz`. Idem CCG (`#67 #67 - …`), LP (`#376 #376 - …`), PP (`#147 #147 -
  …`).
- **Section + URL** : home hub `/`, section "Six voix, un écosystème", grille
  `.podcast-grid > .podcast-card > ul.featured > li`.
- **Capture** : `[capture-P0-1-doublon-num.png]` (à faire côté Jérémy en
  authentifié — reproductible par inspection de la liste featured).
- **Root cause** : `frontend/hub.html:464` —
  ```js
  const num = ep.episode_number != null ? `#${ep.episode_number} ` : '';
  return `<li title="${esc(ep.title)}">${num}${esc(ep.title)}</li>`;
  ```
  Le code ajoute toujours `#NUM ` en préfixe, mais les titres RSS de GDIY / LP /
  PP / CCG embarquent **déjà** `#NUM - …`. LM (titres sans num) et Finscale
  (titres `[EXTRAIT] …`) ne sont pas affectés.
- **Effort** : XS (<30min). Soit strip `^#NUM\s*-\s*` du titre avant rendu, soit
  drop le préfixe `#NUM` quand le titre commence déjà par `#`. Décision côté
  config (par-tenant `titlePrefixesNumber: true` ?).
- **Périmètre** : 4 podcasts × 3 cards = 12 lignes visibles, sur les 6 cards de
  la home. Visible immédiatement en scroll.

---

### P0-2 — Finscale top 3 = 3× titres `[EXTRAIT]` ou `[EXCERPT]`

- **Bug** : la card Finscale affiche en featured les 3 derniers épisodes
  publiés, qui sont **tous** des extraits/teasers : `[EXTRAIT] Clément Buyse
  (Slate VC) - …` , `[EXTRAIT] Fanny Picard (Alter Equity)` , `[EXTRAIT]
  Emmanuel Delaveau (Partech) - …`. Donne une impression de podcast pauvre /
  promotionnel, alors que les épisodes "complets" existent ailleurs dans la
  feed (cf. ép. 334 `[EXCERPT] Anne Lucas` etc — anglais aussi).
- **Section + URL** : home hub `/`, card Finscale.
- **Capture** : `[capture-P0-2-finscale-extraits.png]`.
- **Root cause** : DATA — 151/332 épisodes Finscale (45%) ont un marker RSS dans
  le titre (`[EXTRAIT]` 146, `[teaser]` 5, plus `[EXCERPT]` non capturé par mon
  regex initial mais bien présent — query `featured_no_marker` confirme que
  *même en filtrant `[EXTRAIT]`*, les 3 derniers restants sont aussi des
  `[EXCERPT]`). La feed RSS Finscale publie majoritairement des teasers, le
  full episode est sur l'app Finscale.fr.
- **Effort** : M (half-day). Choix produit obligatoire :
  - (a) Filtrer le bruit `[extrait|excerpt|teaser|rediff|bonus|hs]` dans la
    query SQL `featured` de `engine/universe.ts:147-159` → mais Finscale tomberait
    quasi-vide.
  - (b) Stripper le préfixe `[EXTRAIT] ` à l'affichage, garder l'épisode tel
    quel (cosmétique).
  - (c) Exclure Finscale du featured (montrer juste les stats sans titres
    récents).
  - (d) Re-ingest Finscale RSS depuis une feed "full episodes" si elle existe.
- **Recommandation** : (b) court terme (cosmétique +30min) **avant envoi pilote**,
  (a)+(d) post-pilote.

---

### P0-3 — Drift counts : `/api/config` ment vs DB réelle (GDIY, PP, CCG)

- **Bug** : la description du tenant `hub` dans `/api/config` claim "537 eps
  GDIY, 156 PP, 65 CCG, 1908 épisodes total" — la DB en a réellement
  **GDIY 959 (+422)**, **PP 195 (+39)**, **CCG 104 (+39)**, total 2409. Stefani
  va inévitablement comparer la description (qu'on lui a probablement déjà
  envoyée par email) à ce que le hero hub affiche en temps réel.
- **Section + URL** : `/api/config` (`description` field) cohabite avec
  hero `/` qui affiche `data.universe.totals.episodes` calculé depuis DB
  (cf. `engine/universe.ts:283`). LM 313 ✓ et FS 332 ✓ matchent. Les 4 autres
  drift.
- **Capture** : `[capture-P0-3-config-drift.png]` (le hero affiche
  "2409 épisodes" alors que toute la com dit "1908+").
- **Root cause** : DATA — `hub` config description statiquement codée dans
  `instances/hub.config.ts` (à vérifier), pas synchronisée à DB.
- **Effort** : XS (<30min). Soit retirer les compteurs explicites par-tenant
  de la description, soit les recalculer au build (script de pré-deploy qui
  injecte les counts DB dans la description). Recommandation : virer les
  chiffres de la description, garder uniquement le hero qui est dynamique.

---

### P0-4 — Cross-references inter-podcast quasi-vides pour Finscale / PP / CCG

- **Bug** : la section "Quand un podcast cite l'autre" (top 10 par volume)
  affichera essentiellement LM↔GDIY (74 + 114 refs) et LP→GDIY (38). **CCG, FS,
  PP émettent ~0 ref croisée détectée** (1 max sur PP→PP, ce qui est même un
  faux positif self-tenant). Rendu : section dégénérée à 3-4 lignes au lieu
  des 10 attendues. Donne l'impression que l'écosystème "se cite" surtout pour
  les 3 premiers, et que les 3 autres sont des satellites sans liens.
- **Section + URL** : home `/`, section `#refs` "Références croisées".
- **Capture** : `[capture-P0-4-pair-stats.png]`.
- **Root cause** : DATA / pipeline — CCG et FS ont 0 article scrapé
  (`n_articles = 0` dans DB pour CCG/FS/LP/PP), donc `episode_links` ne
  contient que les liens RSS bruts, pas les liens enrichis depuis l'article
  HTML. La query croise via URL host match (`gdiy.fr`, `lamartingale.io`),
  c'est correct mais la source de vérité n'a juste pas le signal.
- **Effort** : XL (>1day) côté pipeline. Court terme (S, <2h) :
  - Soit afficher une fallback message claire ("Couverture en cours
    d'indexation : seuls LM, GDIY et LP ont actuellement des articles scrapés
    permettant la détection cross-refs").
  - Soit cacher la section refs si `pairStats.length < 5` plutôt que la rendre
    dégénérée.
  - Le fallback existant dans `frontend/hub.html:513` ne se déclenche que si
    `pairs.length === 0`, jamais si `length === 3`.

---

## P1 — Gênant, fix recommandé avant envoi si temps

### P1-1 — Lepanier featured : 2 sur 3 sont des hors-séries `#HS 1 to 1 Monaco`

- **Bug** : la card LP affiche `#376 - Encuentro` puis 2 hors-séries Monaco
  successifs sans `episode_number` (id 3202, 3203). Le hero hub LP devrait
  vendre des épisodes "format principal", pas 2 contenus événementiels Monaco.
- **Section + URL** : home `/`, card Le Panier featured.
- **Root cause** : 17 épisodes `#HS` dans LP, et la query universe.ts featured
  trie strictement par `date_created DESC` sans filtrer les HS.
- **Effort** : S (<2h). Ajouter `AND title NOT ILIKE '#HS%'` dans la CTE
  `ranked` de `engine/universe.ts:148`. Avec ce filtre, LP top 3 deviendrait
  `#376 Encuentro`, `#375 leboncoin`, `#374 Ethylowheel` — beaucoup plus
  vendeur.

---

### P1-2 — `cross_podcast_guests` : pollution avec titres d'épisodes au lieu d'invités

- **Bug** : 4 entrées au moins de `cross_podcast_guests` sont des titres
  d'épisode mal-parsés, traitées comme des invités :
  - id=392 `Christian Jorge VESTIAIRE COLLECTIVE 2/2`
  - id=989 `HS 1 to 1 Monaco` (avec `linkedin_url` = laurentkretz, parasite
    confirmé)
  - id=1032 `Reprendre une entreprise 4 ans après sa fermeture`
  - id=1039 `Seagale : 7 personnes, 5M de CA et 200 commandes par jour, avec
    Bertrand Durand`
- **Section + URL** : potentiellement dans la liste "Invités partagés" de la
  home et dans `/guest-brief/:slug` si quelqu'un tombe sur l'URL (le slug est
  prévisible).
- **Root cause** : DATA — la pipeline d'extraction guest a parsé des titres
  d'épisodes hors-format au lieu de tomber sur le vrai invité. `isValidPersonName`
  ne couvre pas ces patterns.
- **Effort** : S (<2h). Soft delete des 4 IDs identifiés (UPDATE
  `cross_podcast_guests` SET valid=false ou DELETE). Long terme : ajouter
  validateur sur insertion dans `engine/cross/match-guests.ts`.

---

### P1-3 — Brief invité : 1161 / 1162 (99.9%) n'ont pas de `brief_md`

- **Bug** : seul 1 invité (Eric Larchevêque, id 434) a un brief généré. Si
  Stefani teste l'URL `/guest-brief/<n'importe-quel-slug>` autre que
  `eric-larcheveque`, il tombe sur le state vide `📭 Brief non disponible`.
- **Section + URL** : `/guest-brief/:slug` (ex: `joseph-choueifaty`,
  `cyril-chiche`, `damien-morin` — tous tested guests apparaissant 3
  podcasts).
- **Root cause** : pipeline brief tourne en single-shot manuel, pas en bulk.
  Phase 1.5 explicite (cf. mémoire MEMORY.md "Larchevêque vitrine"). C'est
  voulu pour démo mais Stefani peut ne pas le savoir.
- **Effort** : XL (>1day) si bulk-generate les 1161 — coût LLM ~$5-15
  (Sonnet 4.6, ~3-5¢/brief × 1161). Court terme : message explicite dans
  `frontend/guest-brief.html` "Brief de démonstration disponible uniquement
  pour Eric Larchevêque dans cette V1, génération bulk planifiée Phase X".
- **Effort court terme** : S (<2h) pour clarifier le state vide.

---

### P1-4 — `/guest-brief/:slug` est un soft-404 universel

- **Bug** : tout slug arbitraire (`/guest-brief/azertyuiop`,
  `/guest-brief/test-not-real`) renvoie HTTP 200 + le HTML SPA. Le 404 est géré
  côté JS après fetch API, donc côté SEO et côté visiteur copier-coller URL
  cassée → page de loading → state "Brief non disponible". Pas de vraie 404.
- **Section + URL** : tout `/guest-brief/<arbitrary>`.
- **Root cause** : Vercel rewrite `/guest-brief/:slug → /frontend/guest-brief.html`
  + SPA. Comportement standard mais soft-404.
- **Effort** : S (<2h). Soit rendre côté serveur la 404 si le guest n'existe
  pas (Vercel function), soit `<meta name="robots" content="noindex">` quand
  brief absent. P2 si Stefani ne navigue qu'aux URLs qu'on lui pousse.

---

### P1-5 — Lien retour navigation : `/hub.html` au lieu de `/`

- **Bug** : le bouton "← Univers MS" en haut de `/guest-brief/:slug` pointe
  vers `/hub.html` (cf. `frontend/guest-brief.html:311`) plutôt que `/`. Vercel
  rewrite `/(.*)` → `/frontend/$1` rend ça techniquement fonctionnel, mais URL
  exposée au visiteur dans la status bar = `/hub.html` ≠ canonique `/`.
- **Section + URL** : `/guest-brief/:slug` nav top-left.
- **Root cause** : copie/collé.
- **Effort** : XS. Remplacer `href="/hub.html"` par `href="/"`.

---

### P1-6 — Compteurs guest sous-évalués massivement (LP 65% sans guest, GDIY 25%)

- **Bug** : LP affichera "135 invités" mais 328/506 (65%) de ses épisodes ont
  `guest IS NULL` en DB. GDIY "492 invités" mais 241/959 (25%) sans guest. Le
  vrai count LP devrait probablement être ~200+, GDIY 600+. Stefani va trouver
  GDIY (959 eps, 492 guests = ~51%) suspect.
- **Section + URL** : home `/`, stats par card podcast.
- **Root cause** : pipeline `extract guest` partiel sur LP (RSS LP sans
  metadata invité dans 65% des cas). Cf. dette MEMORY.md "195/222 guests LM
  sans `guest_episodes`".
- **Effort** : L (1day). Re-extraction guest via title parsing sur LP/GDIY
  (regex `\b(avec|invité.?)\b\s+([A-Z]\w+\s+[A-Z]\w+)`). Court terme : pas de
  fix, juste accepter.

---

## P2 — Cosmétique, V2 post-pilote

### P2-1 — `Producers` footer : doublons / typo possibles

- **Bug** : footer affiche `Producteurs · ` + `producers.join(' · ')`. La query
  agrège `Array.from(new Set(configs.map(c => c.producer)))` mais si un config
  a `producer = "Orso Media"` vs `"Orso Media SAS"` ils seront dédoublonnés
  Set → laisse en l'état si OK.
- **Effort** : XS audit visuel.

### P2-2 — `1 podcast` / `1 podcasts` dépluralisation manquante

- **Bug** : `frontend/hub.html:506` utilise `${g.count} ép.` sans pluralisation
  (acceptable). Mais `data.universe.tagline` = `${podcasts.length} podcasts,
  un écosystème.` — si jamais `podcasts.length === 1` (filtré par scope auth),
  texte cassé. Edge case quasi-impossible mais à tracer.
- **Effort** : XS.

### P2-3 — Single-word guest dans `cross_podcast_guests` (id 24 `jean-sebastien`)

- 1 entrée avec un seul mot (mais avec tiret donc ambigu). Cosmétique,
  prénom seul.
- **Effort** : XS.

### P2-4 — Accents dans `display_name` parfois absents (3 cas)

- `seagale : 7 personnes…` → `Seagale : 7 personnes,  5M de CA…` (deux espaces
  consécutifs après virgule). Cosmétique mais lisible. Aussi `Iñaki Lartigue`
  et `Maÿlis Staub` OK avec accents/tildes.
- **Effort** : XS.

### P2-5 — `n_no_guest` LP 65% : carte LP affiche "135 invités, 506 épisodes" → ratio bizarre

- Stefani fait ratio mental : 506 / 135 = 3.7 eps par invité, alors que dans
  GDIY/LM c'est ~2 eps par invité. Plus une donnée que UI bug. Couvert par
  P1-6.

### P2-6 — `lamartingale` 4 épisodes sans `duration_seconds`

- N'apparaît pas direct côté hub (pas affiché par card), mais `total_seconds`
  agrégé en `hours` sera 4 episodes manquants. Sous-évaluation marginale.
- **Effort** : XS (mettre à jour les 4 rows). IDs à identifier via `SELECT id,
  title FROM episodes WHERE tenant_id='lamartingale' AND
  (episode_type='full' OR episode_type IS NULL) AND
  (duration_seconds IS NULL OR duration_seconds=0)`.

### P2-7 — GDIY 1 épisode avec `title NULL`

- `count(*) FILTER (WHERE title IS NULL OR trim(title)='') = 1` sur GDIY.
  S'il tombe en featured top 3 il afficherait `#NUM ` (espace sec). Risque
  faible (date_created probablement vieille). À identifier et fix data.
- **Effort** : XS.

---

## Stats

- **Total bugs** : **17** (P0=4, P1=6, P2=7).
- **Effort total fix P0** : ~1 demi-journée (4 × XS-S avec un M sur Finscale)
  = **~4-6h**.
- **Effort total fix P0 + P1** : ~1.5-2 jours = **~12-16h**.
- **Lighthouse mobile** : **non exécuté** (Chrome launcher EPERM Windows).
  Voir Annexe.
- **Données analysées** : 6 tenants, 2409 épisodes, 1162 cross-guests, 36k
  links, 4 endpoints publics + 3 fichiers HTML SPA.

---

## Plan de fix proposé

Ordre logique avec dépendances. **Aucun fix exécuté.**

### Phase A — quick wins crédibilité (avant envoi pilote, ~3-4h)
1. **P0-1 doublon `#NUM #NUM`** (XS) — strip préfixe `#NUM\s*-\s*` à
   l'affichage si `episode_number` déjà présent en début de titre.
   *Fichier : `frontend/hub.html:464`.*
2. **P0-2 Finscale `[EXTRAIT]`** — option (b) cosmétique : strip `[EXTRAIT]`,
   `[EXCERPT]`, `[teaser]` à l'affichage seulement (XS).
   *Fichier : `frontend/hub.html:464` même boucle.*
3. **P0-3 drift counts** (XS) — retirer les nombres explicites d'épisodes par
   tenant de la `description` config hub. *Fichier : `instances/hub.config.ts`.*
4. **P1-1 Lepanier #HS** (S) — ajouter `AND title NOT ILIKE '#HS%'` dans la
   query featured. *Fichier : `engine/universe.ts:148`.*
5. **P1-5 lien retour** (XS) — `/hub.html` → `/`.
   *Fichier : `frontend/guest-brief.html:311`.*

→ **Net gain crédibilité** : 90% des bugs visibles disparaissent en ~3h.

### Phase B — réduction asymétrie podcasts (avant envoi si temps, ~2-3h)
6. **P0-4 cross-refs dégénérées** (S) — masquer la section refs si <5 paires
   ou afficher fallback explicite. *Fichier : `frontend/hub.html:513`.*
7. **P1-2 pollution cross_guests** (S) — DELETE / soft-flag les 4 IDs
   identifiés (392, 989, 1032, 1039) après vérification humaine.
   *Script à créer : `scripts/cleanup-cross-guests-polluted.ts`.*
8. **P1-3 brief vide messaging** (S) — message clair "Brief disponible
   uniquement pour Eric Larchevêque (vitrine V1)" + CTA contact.
   *Fichier : `frontend/guest-brief.html:341`.*

### Phase C — V2 post-pilote (pas avant)
9. P0-2 (a)+(d) re-ingest Finscale full episodes
10. P1-3 bulk-generate 1161 briefs (~$15 LLM)
11. P1-4 vraie 404 server-side
12. P1-6 re-extraction guests LP/GDIY
13. P2-1 à P2-7

---

## Annexe Lighthouse (à exécuter manuellement par Jérémy)

L'environnement Windows actuel échoue avec
`EPERM, Permission denied: %TEMP%\lighthouse.*` (Chrome launcher cleanup).
Probablement résolu en exécutant en admin ou en désactivant l'AV temporairement.

```powershell
# 3 pages clés, mobile, JSON output
$pages = @(
  @{name='login'; url='https://ms-hub.vercel.app/login'},
  @{name='guest-brief-eric'; url='https://ms-hub.vercel.app/guest-brief/eric-larcheveque'},
  @{name='guest-brief-empty'; url='https://ms-hub.vercel.app/guest-brief/joseph-choueifaty'}
)
foreach ($p in $pages) {
  npx --yes lighthouse $p.url --form-factor=mobile --quiet `
    --output=html,json --output-path=".audit-hub/lh/$($p.name).html" `
    --chrome-flags="--headless=new"
}
```

Pour la home `/` (gated), il faut **se logger d'abord** dans Chrome puis
fournir `--cookie` à Lighthouse, ou utiliser puppeteer.

**Score attendu** (estimation à partir de l'inspection statique HTML) :
- Performance : ~85-95 (page <25 kB HTML, 1 font Google, 1 fetch API,
  pas de JS bundle, pas d'images > preconnect Google fonts OK).
- Accessibility : ~80-90 (contrast checks à valider sur badges --pc dynamiques,
  pas de `lang` sur subsections, focus state des tags non-sondé).
- Best Practices : ~95-100 (HTTPS only, no console errors prévus, pas de
  third-party tracker visible).
- SEO : OOS (excluded scope).

---

## Annexe : artefacts d'audit

Tous gitignored (sandbox `.audit-hub/`) :
- `.audit-hub/audit-queries.ts` — query Neon principale read-only
- `.audit-hub/audit-extras.ts` — query Neon extras (totals, top shared, schema)
- `.audit-hub/db-audit.json` — dump 481 lignes (RSS markers, featured,
  cross_guests stats, cross_links, dates, durations)
- `.audit-hub/db-audit-extras.json` — dump 622 lignes (guests, top shared,
  HS titles, schema CPG, link types)
- `.audit-hub/page-root.html`, `page-eric.html`, `page-login.html`,
  `brief-eric.json`, `api-config.json` — captures HTTP raw

Pas de write DB, pas de mutation, pas de commit hors ce rapport.
