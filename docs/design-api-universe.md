# Design doc — Phase C : `/api/universe` + hub N-podcasts

**Statut** : proposition, pas de code. À valider avant implémentation.

**Contexte** : le hub actuel (`frontend/hub.html`) hardcode 2 podcasts (LM + GDIY) alors que 6 sont déployés. Phase C = réécrire le hub pour N tenants, via un nouvel endpoint `/api/universe`. Cf. `docs/audit-univers-live.md` point 2.

**Contraintes** (rappel user) :
1. `/api/universe` = ajout, pas remplacement (backward-compat).
2. Nouvelle grille = N tenants dynamique, pas 6 en dur (extensible pour Le Gratin + autres à venir).
3. Fallback propre quand `cross_podcast_ref` vide (en attendant Phase D).

---

## 1. Shape JSON de `GET /api/universe`

```json
{
  "universe": {
    "id": "ms",
    "name": "Univers MS",
    "tagline": "Six podcasts, un écosystème.",
    "producers": ["Orso Media", "Cosa Vostra", "Gokyo"],
    "totals": {
      "episodes": 2409,
      "hours": 2506,
      "guests": 1162,
      "crossGuests": 59,
      "crossEpisodeRefs": 0
    }
  },
  "podcasts": [
    {
      "id": "lamartingale",
      "name": "La Martingale",
      "tagline": "Prenez le contrôle de votre argent",
      "host": "Matthieu Stefani",
      "producer": "Orso Media",
      "website": "https://lamartingale.io",
      "siteUrl": "https://lamartingale-v2.vercel.app",
      "description": "...",
      "branding": {
        "primaryColor": "#004cff",
        "secondaryColor": "#e8eeff",
        "font": "Poppins",
        "logoUrl": "..."
      },
      "stats": {
        "episodes": 313,
        "hours": 450,
        "guests": 288,
        "articles": 312,
        "lastEpisodeDate": "2026-04-22"
      },
      "featured": [
        { "id": 312, "title": "...", "slug": "...", "pubDate": "..." },
        { "id": 311, "title": "...", "slug": "...", "pubDate": "..." },
        { "id": 310, "title": "...", "slug": "...", "pubDate": "..." }
      ]
    }
    /* ... répété pour chaque tenant actif (6 aujourd'hui, N demain) */
  ],
  "cross": {
    "guests": [
      {
        "canonical": "Frédéric Mazzella",
        "podcasts": ["lamartingale", "gdiy"],
        "count": 2,
        "appearances": [
          { "podcast": "lamartingale", "episodeId": 42, "title": "...", "slug": "..." },
          { "podcast": "gdiy", "episodeId": 678, "title": "...", "slug": "..." }
        ]
      }
      /* ... top 20 par count desc */
    ],
    "episodeRefs": [
      {
        "from": { "podcast": "lamartingale", "episodeId": 42, "title": "..." },
        "to":   { "podcast": "gdiy", "episodeId": 678, "title": "..." },
        "type": "explicit_mention"
      }
      /* ... top 20 par paire (from, to), vide tant que cross_podcast_ref = 0 */
    ],
    "pairStats": [
      { "from": "lamartingale", "to": "gdiy", "count": 14 },
      { "from": "gdiy",         "to": "lamartingale", "count": 9 }
      /* ... pour les paires non nulles seulement — UI cache automatiquement les 0 */
    ]
  }
}
```

### Notes techniques

- **Source** : agrège `getConfig()` pour chaque tenant du REGISTRY (en excluant `hub`) + 4 queries SQL : `stats_by_tenant`, `featured_by_tenant` (top 3 récents), `cross_guests_top`, `cross_episode_refs_top`.
- **Cache** : `getCached('universe', 3600, fn)` — 1h TTL. Invalidation manuelle via `/api/cache/clear?prefix=universe`.
- **Perf** : 4 queries SQL parallèles + 1 boucle REGISTRY. Budget < 400ms cold.
- **Exclusion hub** : le tenant `hub` n'apparaît pas dans `podcasts[]` (c'est le consommateur, pas un podcast auditeur).
- **Payload** : ~12 KB gzippé estimé pour 6 podcasts + top 20 cross.

---

## 2. Wireframe nouveau `hub.html`

```
┌────────────────────────────────────────────────────────────────┐
│  UNIVERS MS                                  [LOGIN →]        │  ← header (login = Phase E)
│                                                                │
│  {universe.tagline}                                            │
│  {totals.episodes} eps · {totals.hours} h · {totals.guests}    │
│  invités · {totals.crossGuests} invités partagés               │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  [Rechercher dans les N podcasts…]                             │  ← search global multi-tenant
│  (hit /api/search/hybrid?podcasts=all)                         │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  LES {podcasts.length} PODCASTS                                │
│                                                                │
│  ┌──LM──┐  ┌─GDIY─┐  ┌──LP──┐  ┌──FS──┐  ┌──PP──┐  ┌─CCG─┐   │
│  │  ━━  │  │  ━━  │  │  ━━  │  │  ━━  │  │  ━━  │  │  ━━  │   │  ← color bar = primaryColor
│  │ Nom  │  │ Nom  │  │ Nom  │  │ Nom  │  │ Nom  │  │ Nom  │   │
│  │ tag  │  │ tag  │  │ tag  │  │ tag  │  │ tag  │  │ tag  │   │
│  │ 313e │  │ 959e │  │ 506e │  │ 332e │  │ 195e │  │ 104e │   │
│  │ Host │  │ Host │  │ Host │  │ Host │  │ Host │  │ Host │   │
│  │ [→]  │  │ [→]  │  │ [→]  │  │ [→]  │  │ [→]  │  │ [→]  │   │
│  └──────┘  └──────┘  └──────┘  └──────┘  └──────┘  └──────┘   │
│                                                                │
│  (grille auto-fit : 3 col desktop, 2 tablet, 1 mobile)         │
│  (card stylée via style="--pc: {primaryColor}" variable CSS)   │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  INVITÉS PARTAGÉS (top 10)                                     │
│                                                                │
│  • Frédéric Mazzella  —  [LM] [GDIY]                          │
│  • Xavier Niel        —  [LM] [GDIY] [LP]                     │
│  • …                                                           │
│                                                                │
│  (fallback si cross.guests.length === 0 :                      │
│   message "Agrégation des invités en cours…")                  │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  RÉFÉRENCES CROISÉES ENTRE PODCASTS                            │
│                                                                │
│  [si pairStats vide OU crossEpisodeRefs === 0 :                │
│   ┌──────────────────────────────────────────────────────┐    │
│   │ Les références explicites entre podcasts sont en     │    │
│   │ cours d'indexation. Disponible après activation du   │    │
│   │ pipeline cross_podcast_ref (Phase D).                │    │
│   └──────────────────────────────────────────────────────┘    │
│  ]                                                             │
│                                                                │
│  [sinon : top 5 paires par count desc]                         │
│  ┌──────────────────────────────────┐                          │
│  │ LM → GDIY (14 refs)   [expand]   │                          │
│  │ GDIY → LM (9 refs)    [expand]   │                          │
│  │ LP → LM (5 refs)      [expand]   │                          │
│  │ … top 5                          │                          │
│  └──────────────────────────────────┘                          │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│  FOOTER — producers, liens sites, "Univers agrégé par Orso"    │
└────────────────────────────────────────────────────────────────┘
```

### Décisions UI

- **Aucun `class="podcast-card lm"` ou `gdiy`** : couleurs pilotées par `style="--pc: {branding.primaryColor}"` sur chaque card.
- **Grille CSS** : `display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));` → s'adapte de 1 à N cards sans média queries custom.
- **Ternaires `'lamartingale' ? 'LM' : 'GDIY'`** (lignes 369/444/522 actuelles) → remplacés par `podcast.name` ou helper `abbrev(podcast.name)` centralisé.
- **Title/meta HTML** : dynamique via JS `document.title = config.name + ' — ' + config.tagline`.
- **Pas de dépendance Phase E pour l'affichage** : le login est un bouton décoratif tant qu'E n'est pas shippé. Cliquer = 404 contrôlé avec message "Accès créateur bientôt disponible".

---

## 3. Règle de généralisation des refs croisées N×N

### Backend

Query `cross_queries.ts` déjà existante pour 2 tenants, à généraliser :

```sql
-- pairStats : nombre de refs explicites par paire (from_podcast, to_podcast)
SELECT
  e_from.tenant_id AS from_podcast,
  e_to.tenant_id AS to_podcast,
  COUNT(*) AS count
FROM episode_links el
JOIN episodes e_from ON e_from.id = el.episode_id
JOIN episodes e_to   ON e_to.id = el.target_episode_id
WHERE el.link_type = 'cross_podcast_ref'
  AND e_from.tenant_id <> e_to.tenant_id
GROUP BY 1, 2
ORDER BY count DESC
LIMIT 20;
```

→ Retourne `[{from, to, count}]`. Vide tant que `episode_links.link_type='cross_podcast_ref'` n'est pas populé (Phase D, item 4).

### Frontend

- Affiche **seulement les paires présentes** (pas de matrice N×N vide).
- Top 5 par défaut, `expand` → voir les refs individuelles de la paire.
- Pas de scroll horizontal ni de matrice 6×6. On reste sur une liste de paires.

### Pourquoi pas une vraie matrice N×N

- 6×6 = 30 cells dont 6 diagonales inutiles → 24 cells, dont ~20 vides aujourd'hui → UI creuse et illisible.
- Liste de paires triées par count = densité visuelle utile + extensibilité (N=10 ? 15 ?).
- Future évolution possible : heatmap si N devient grand et les counts se densifient. Pas pour cette phase.

---

## 4. Fallback quand `cross_podcast_ref` non populé

### Signaux côté API

- `totals.crossEpisodeRefs` : 0 aujourd'hui.
- `cross.episodeRefs` : `[]`.
- `cross.pairStats` : `[]`.

### Comportement UI

| État | Section "Invités partagés" | Section "Références croisées" |
|---|---|---|
| `crossGuests > 0` ∧ `crossEpisodeRefs > 0` | affichée (top 10) | affichée (top 5 paires) |
| `crossGuests > 0` ∧ `crossEpisodeRefs === 0` | affichée (top 10) | **message "indexation en cours"** |
| `crossGuests === 0` ∧ `crossEpisodeRefs === 0` | message "indexation en cours" | cachée |

**Règle clé** : les deux sections sont **indépendantes**. `match-guests.ts` produit 59 cross-guests aujourd'hui sans dépendre de `cross_podcast_ref`. Donc la section "Invités partagés" marche **dès la Phase C**, même sans Phase D.

### Pas de "Chargement…" infini

Les containers actuels du hub (lignes 288/292 de `hub.html`) restent bloqués en "Chargement…" car le JS attend une réponse qui n'arrive jamais. Nouveau hub : le JS lit `totals.crossEpisodeRefs` **avant** d'appeler l'endpoint détail, et bascule sur le message fallback immédiatement si 0. Pas de spinner.

---

## 5. Extensibilité N tenants (≠ hardcode 6)

### Checklist implémentation

- [ ] `/api/universe` itère `Object.values(REGISTRY)` (exclut `hub`) → capte automatiquement un 7e/8e tenant.
- [ ] Nouveau `hub.html` : `for (const podcast of data.podcasts) renderCard(podcast)`. Aucun count hardcodé.
- [ ] Totals `universe.totals.episodes` : agrégé SQL, pas calé sur 2409.
- [ ] Grille CSS `auto-fit` : marche pour 2 podcasts (2 cards larges) comme pour 10 (mozaïque dense).
- [ ] Tagline universe `"Six podcasts, un écosystème."` → remplacée par `"{podcasts.length} podcasts, un écosystème."` côté JS.
- [ ] `/api/config` du hub (tenant `hub`) : l'utilisateur peut éditer la tagline générique, mais le count de podcasts reste dynamique via `/api/universe`.

### Test d'extensibilité

Quand Le Gratin ou autre sera ajouté (cf. `docs/DETTE.md` P3) :
1. `npx tsx cli/index.ts init --name "Le Gratin" ... --podcast legratin`
2. `npx tsx cli/index.ts ingest --podcast legratin`
3. `curl /api/cache/clear?prefix=universe`
4. Vérifier que la grille hub a **automatiquement** 7 cards sans toucher au code.

---

## 6. Plan d'implémentation (une fois validé)

1. **`engine/api.ts`** : ajouter `GET /api/universe`, handler dans un nouveau fichier `engine/universe.ts` pour la lisibilité.
2. **`engine/universe.ts`** : `getUniverse()` qui combine REGISTRY + 4 queries SQL + cache.
3. **`engine/__tests__/universe.test.ts`** : test que la réponse a bien N podcasts (où N = tenants actifs - hub), que les fallbacks marchent avec `crossEpisodeRefs === 0`, que le cache est bien invalidé.
4. **`frontend/hub.html`** : réécriture complète. Archiver l'ancien en `frontend/archive/hub-v1-2podcasts.html` pour traçabilité.
5. **Deploy** : `npm run deploy:hub` uniquement (les 6 sous-sites non impactés).
6. **Validation visuelle** : screenshot avant/après + checklist N cards visibles + fallback message visible.
7. **Commit** : 2 commits séparés — `feat(api): add /api/universe endpoint` + `refactor(hub): reimplement for N podcasts with dynamic grid`.

**ETA** : 3 j focus. 1 j endpoint + tests, 1 j hub.html, 1 j polish + QA.

---

## 7. Questions ouvertes à trancher

1. **Login hub (bouton décoratif Phase C, actif Phase E)** : OK de mettre un bouton qui renvoie sur une page "bientôt disponible" ? Ou pas de bouton tant qu'E n'est pas ready ?
2. **Search global multi-tenant** : dans le wireframe je propose `/api/search/hybrid?podcasts=all`. L'endpoint actuel filtre par tenant courant. À étendre ou créer `/api/search/universe` dédié ?
3. **Ordre des cards** : alphabétique ? par nombre d'eps desc ? par date dernier ep ? par tenant_id dans REGISTRY ? Ma reco : par nombre d'eps desc (GDIY en tête → signal de maturité).
4. **Cache TTL** : 1h OK ? Moins → charge DB plus lourde. Plus → risque de montrer un nouvel ep avec 1h de délai.
