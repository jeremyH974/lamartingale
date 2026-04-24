# Audit Univers MS — État live (2026-04-24)

**Objet** : départager le diagnostic de `univers-ms-plan-consolide.md` (basé sur `web_fetch` sans JS) de la réalité de la plateforme. Vérifier 4 points ciblés avant d'exécuter un plan de refonte.

**Méthode** : fetch `/api/config` sur les 7 tenants + lecture source HTML servi + grep local des fichiers frontend. Chrome rendu JS non nécessaire : les endpoints JSON et le HTML brut sont suffisamment discriminants.

---

## TL;DR — ce que l'audit révèle

| # | Point | Verdict | Impact |
|---|---|---|---|
| 1 | **Multi-tenancy** (Potemkine ?) | ✅ **RÉFUTÉ** — `/api/config` différencié sur 7 tenants, branding/tagline/host/pillars OK | Pas de refonte tenant à faire |
| 2 | **Taglines hub dupliquées** | ⚠️ **REQUALIFIÉ** — pas un duplicat, mais un hub **binaire** (LM+GDIY) sur 6 tenants déployés | Beaucoup plus grave que décrit |
| 3 | **Encoding cassé** | ❌ **CONFIRMÉ** — 9 occurrences hardcodées dans `frontend/v2.html` (pas un bug UTF-8, un texte source sans accents) | Fix trivial, 5 min |
| 4 | **Nav 10 items** | ❌ **CONFIRMÉ** — 10 items sur LM et GDIY, à réduire à 4-5 | Refonte UX valide |
| 5 | **Sections "Chargement…"** | ❌ **CONFIRMÉ** — 3 zones figées dans `frontend/hub.html`, liées à cross_podcast_ref=0 ET au hub binaire | P1 dans DETTE.md |

**Conclusion** : le document initial a eu raison sur 3/4 points, mais s'est trompé sur le point 1 (multi-tenancy). Le vrai problème n'est pas "6 clones LM" — c'est "6 sous-sites OK + 1 hub qui n'a pas suivi l'extension de 2 à 6 podcasts".

---

## Point 1 — Multi-tenancy : RÉFUTÉ

### Méthode

Fetch `GET /api/config` sur les 7 tenants et comparaison des retours.

### Résultats

| Tenant | Name | Tagline | Primary | Producer |
|---|---|---|---|---|
| lamartingale-v2 | La Martingale | "Prenez le contrôle de votre argent" | #004cff | Orso Media |
| gdiy-v2 | Génération Do It Yourself | "Les histoires de celles et ceux qui se sont construits par eux-mêmes" | #000000 | Cosa Vostra |
| lepanier-v2 | Le Panier | "Le 1er podcast e-commerce français" | #1E9EFF | Orso Media |
| finscale-v2 | Finscale | "Le podcast de référence sur la finance qui innove" | #E91E63 | Gokyo |
| passionpatrimoine-v2 | Passion Patrimoine | "Le podcast qui donne la parole aux CGP" | #7A2D98 | Orso Media |
| combiencagagne-v2 | Combien ça gagne | "Le podcast qui déconstruit les business models" | #E85A23 | Orso Media |
| ms-hub | Univers MS | "Six podcasts, un écosystème. [...]" | #1a1a1a | Orso × Cosa × Gokyo |

**Tous les champs sont distincts. Accents présents. Hosts différenciés (Stefani / Kretz / Niedercorn / Dany / Lepic).**

### Pourquoi le document s'est trompé

Le `web_fetch` du plan précédent a lu le HTML brut **avant hydratation JS**. Or `frontend/v2.html` est le template unique et contient du **texte statique LM hardcodé** (hero, footer, labels). Le JS remplace ensuite ces éléments via `/api/config`. Sans exécuter le JS, on voit partout le texte LM → illusion de duplication.

**La multi-tenancy est bien en place** (cf. `engine/config/index.ts`, `instances/*.config.ts`, 80 tests verts).

---

## Point 2 — Taglines hub : REQUALIFIÉ (bien plus grave)

### Attendu (selon document)

« 5 des 6 cartes affichent la même tagline GDIY. »

### Réalité observée dans `frontend/hub.html`

Ce n'est pas un problème de tagline. **Le hub ne liste que 2 podcasts sur 6** :

```
Ligne   6 : <title>Univers MS — La Martingale × GDIY</title>
Ligne   7 : meta description = "La Martingale + Génération Do It Yourself. 850+ épisodes..."
Ligne 120 : .podcast-card.lm::before { background: var(--lm); }
Ligne 121 : .podcast-card.gdiy::before { background: var(--accent); }
Ligne 235 : tagline = "La Martingale et Génération Do It Yourself réunis."
Ligne 245 : <a class="btn btn-lm" href="lamartingale-v2">La Martingale →</a>
Ligne 246 : <a class="btn btn-gdiy" href="gdiy-v2">GDIY →</a>
Ligne 288 : <h4>La Martingale → GDIY</h4>
Ligne 292 : <h4>GDIY → La Martingale</h4>
Ligne 305 : "agrégé depuis La Martingale (Orso) et GDIY (Cosa Vostra)"
Ligne 369 : const label = a.podcast === 'lamartingale' ? 'LM' : 'GDIY';  // binaire
Ligne 444 : const badgeLabel = hit.podcast === 'lamartingale' ? 'LM' : 'GDIY';
Ligne 522 : const label = s.podcast === 'lamartingale' ? 'LM' : 'GDIY';
```

**4 podcasts (Le Panier, Finscale, Passion Patrimoine, Combien ça gagne) sont absents du hub** alors qu'ils sont déployés et fonctionnels sur leurs sous-sites.

### Divergence `/api/config` vs HTML

Le `/api/config` du hub annonce « Six podcasts, un écosystème. [...] La Martingale (313 eps), GDIY (959), Le Panier (506), Finscale (332), Passion Patrimoine (195), Combien ça gagne (104). 2400+ épisodes, 1200+ invités, 2500+ heures » — mais le HTML hardcode uniquement LM + GDIY.

**Le hub n'a pas suivi l'extension de 2 → 6 tenants.** C'est le vrai P0.

### Grille des 6 taglines (documents dit dupliquées)

Non vérifiable : il n'y a pas de grille des 6. Il y a 2 cards LM + GDIY, et les 4 autres n'existent ni dans le HTML ni dans un endpoint `/api/universe` (404). Le backend cross-podcast référence bien les 6 (cf. `engine/cross/match-guests.ts`, 1162 guests canoniques, 59 cross) mais le frontend hub ne les consomme pas.

---

## Point 3 — Encoding : CONFIRMÉ (fix trivial)

### Méthode

`grep -c "controle|francais|transforme|semantique|educative|Debutant"` sur tous les fichiers frontend.

### Résultats

| Fichier | Occurrences mojibake |
|---|---|
| `frontend/v2.html` | **9** |
| `frontend/hub.html` | 0 |
| `frontend/v2-dashboard.html` | 0 |
| `frontend/episode.html` | 0 |

### Détail des 9 occurrences (v2.html)

```
L.1326  <h1 id="hero-h1">Prenez le controle<br>de votre argent</h1>
L.1327  <p id="hero-p">Le premier podcast francais [...] transforme en plateforme educative interactive. Recherche semantique IA [...] 310 episodes analyses.</p>
L.1403  <div class="section-title">Recherche semantique</div>
L.1468  <option value="DEBUTANT">Debutant</option>
L.1490  <div class="footer-desc">Le premier podcast natif francais [...] apprendre a investir et gerer son argent.</div>
L.1769  <button onclick="setF('DEBUTANT',null,this)">Debutant</button>
L.1866  'Recherche semantique en cours...'
L.1871  'resultats en ${d.timing_ms}ms (recherche hybride semantique + lexicale)'
L.1895  'La recherche semantique necessite la base de donnees.'
```

### Diagnostic

**Pas un bug UTF-8.** `<meta charset="UTF-8">` présent sur tous les fichiers. C'est du texte qui a été saisi sans accents à la base (probable copier-coller depuis un outil non-accentué ou choix legacy).

### Impact

- Lignes 1326-1327, 1490 : **écrasées par le JS** via `/api/config` pour LM et autres tenants → invisibles après hydratation, mais flash sans accents au premier render (FOUC).
- Lignes 1403, 1468, 1769, 1866, 1871, 1895 : **persistantes** (labels UI statiques, messages d'erreur) → visibles sur les 6 sous-sites en permanence.

### Fix

Remplacer ces 9 chaînes par leurs équivalents accentués. 5 minutes. Sans risque de régression (tests ne vérifient pas ces strings).

---

## Point 4 — Nav 10 items : CONFIRMÉ

Nav effective observée (LM et GDIY, HTML brut) :

```
Accueil / Episodes / Parcours / Experts / Recherche / Assistant / Quiz / Graphe / Pour vous / 📊 Dashboard
```

= **10 items**. Cible = 4-5 max selon le plan initial.

### Recommandation (validée)

- **Niveau 1** (nav publique auditeur) : Accueil / Episodes / Parcours / Experts / Recherche
- **Niveau 2** (widgets inline page épisode) : Assistant, Quiz
- **Retiré de la nav publique** : Graphe, Dashboard → accessibles par URL directe ou via le hub créateur
- **Post-login / inline** : "Pour vous"

### Impact code

Modification `frontend/v2.html` header + CSS. Déploie sur les 6 sous-sites d'un coup (template commun). Pas de changement backend.

---

## Point 5 — Sections "Chargement…" : CONFIRMÉ, lié à P1 dette

### Localisation

`frontend/hub.html` lignes 288 et 292 : `<h4>La Martingale → GDIY</h4>` et `<h4>GDIY → La Martingale</h4>` — entourées de containers chargés en JS.

### Cause

Ces sections consomment des endpoints qui **n'ont pas de données à renvoyer** :
- `cross_podcast_ref = 0` (cf. `docs/DETTE.md` P1)
- L'endpoint remonte 0 références croisées → JS reste bloqué en état "Chargement…"

### Double problème

Même une fois `cross_podcast_ref` populé, les 3 sections du hub ne couvriront que LM↔GDIY (hardcodé ligne 369, 444, 522) — pas les 5 autres paires possibles sur 6 podcasts.

**Fix à 2 étages** :
1. Populer `cross_podcast_ref` (job déjà scoppé en P1).
2. Généraliser le hub pour 6 tenants (point 2 ci-dessus).

---

## Synthèse — priorités ajustées pour le plan B→F

Sur base de cet audit, voici les priorités **vraies** par effort/valeur :

### P0 — Quick wins (< 1 j cumulé)
1. **Fix 9 mojibake dans `frontend/v2.html`** — 5 min, déploie sur les 6 sous-sites
2. **Nav réduite à 4-5 items** — 30 min, même fichier
3. **Retirer Dashboard/Graphe de la nav publique** (les laisser accessibles via URL) — inclus dans l'item 2

### P0 — Hub élargi de 2 à 6 podcasts (2-3 j, vrai blocant)
4. **Réécrire `frontend/hub.html`** :
   - Title + meta description : 6 podcasts
   - Remplacer les ternaires `'lamartingale' ? 'LM' : 'GDIY'` par lookup multi-tenant
   - Grille 6 cards avec nom/tagline/branding via endpoint dédié (`/api/universe` à créer)
   - Refs croisées : matrice 6×6 (ou top-N paires les plus denses)
5. **Créer `GET /api/universe`** dans `engine/api.ts` : retourne les 6 `/api/config` agrégés + stats + refs croisées top-N

### P1 — Dette déjà cataloguée (5 j — cf. `docs/DETTE.md`)
6. Deep scrape Orso × 4 podcasts (LP, Finscale, PP, CCG)
7. Quiz LM/GDIY all-eps (sortir du démo top 5)
8. CCG LinkedIn enrichment
9. Activer `cross_podcast_ref` (débloque les "Chargement…" du hub une fois généralisé)

### P2 — Hub créateur enrichi (3-4 j)
10. Auth passwordless (Resend magic link)
11. Table `podcast_access(email, tenant_id)` + filtrage serveur
12. Absorber les `/dashboard` par tenant + vue comparative
13. KPIs externes (YouTube Data API prioritaire, Spotify ensuite, input manuel sinon)

### P3 — Refonte UX auditeur (3 j)
14. Widgets inline Assistant/Quiz dans page épisode
15. Home : CTA adapté par tenant, narration différenciée
16. Heuristique succès < 2 min

### P4 — Extensibilité stratégique (1 j + décisions)
17. Documenter "ajouter Le Gratin" via `cli/index.ts init` (déjà fonctionnel)
18. Décider : rester 1 projet Vercel/tenant vs routing hostname unifié — recommandation : statu quo < 10 podcasts

---

## Plan révisé B→F (à valider avant exécution)

| Phase | Contenu | ETA | Pré-requis |
|---|---|---|---|
| **B — Quick wins** | Fix encoding (9 strings) + nav 4-5 items | 1 j | — |
| **C — Hub 6 podcasts** | Réécrire `hub.html` + `/api/universe` + cross_podcast_ref populé | 3-4 j | B |
| **D — Dette P0 données** | Deep scrape Orso × 4 + Quiz all-eps + CCG LinkedIn | 5 j | parallèle à C possible |
| **E — Hub créateur** | Auth Resend + `podcast_access` + dashboards absorbés + KPIs YouTube | 3-4 j | C |
| **F — UX auditeur** | Widgets inline + home CTA + heuristique 2 min | 3 j | B |

**Total** : ~15-17 j de dev focus pour atteindre l'état cible « Univers MS cohérent en 6 produits auditeur différenciés + hub créateur enrichi ».

**Ordre recommandé** : B (vite) → D (en background, longs scrapes) ∥ C (dev hub) → F (UX) → E (hub créateur).

---

## Leçons pour futurs audits

1. **Toujours taper `/api/config` du tenant** avant de conclure à une duplication visuelle — le HTML brut ment si l'hydratation JS est config-driven.
2. **Grep local du fichier template** (`frontend/v2.html`, `frontend/hub.html`) pour distinguer « bug de contenu » (hardcodé) vs « bug de binding » (pas de /api/config OK).
3. **Mojibake sans accents ≠ encoding UTF-8 cassé** : vérifier `<meta charset>` d'abord, puis grep source.
4. **Les endpoints backend (cross-queries, /api/universe) sont la source de vérité cross-tenant** — ne pas inférer l'état produit depuis un HTML statique.
