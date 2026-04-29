# Sillon — Brief d'exécution Phase Alpha v2

> **Version 2 — révision post-audit du 29/04 après-midi.**
> Ce brief remplace intégralement le brief v1 du 29/04 matin.
> Il intègre les écarts détectés par l'audit CC (`audit-2026-04-29.md`).

| | |
|---|---|
| **Date** | 29 avril 2026 |
| **Version** | 2.0 (remplace v1) |
| **Audience** | Claude Code (exécution directe) |
| **Cap LLM** | **10 $ MAX** sur 4 semaines |
| **Effort CC estimé** | 41-57h |
| **Tag de référence** | `scenario-b-v1-cloture` (commit `634bfeb`) |
| **Branche cible** | `feat/phase-alpha` (à créer depuis master) |

---

## 1. Écarts détectés à l'audit (29/04 après-midi)

### 1.1 Écarts majeurs (impactent la séquence)

| # | Écart détecté | Impact | Action v2 |
|---|---|---|---|
| **1** | `/api/cross/search` déjà public, lent (5107 ms), non rate-limité | Risque vol IP avant même expo R1 | **Sécurisation S1 (rate-limit + auth-gate basique)** |
| **2** | Cookies Resend posés sans bandeau, 0 mention RGPD/cookies/CGU/légales | Non-conformité existante (pas future) | **Conformité RGPD remontée P0 en S1** |
| **3** | 950 ép. sans embeddings sur 5 tenants entiers | Recherche sémantique partielle = mauvais signal | **R4 obligatoire en S2 avant R1 UI** |

### 1.2 Écarts mineurs (intégrés en pre-flight)

- **Tag annoté piège** : `git rev-parse <tag>` retourne `62dff59` (SHA-tag), pas `634bfeb` (commit). Tout pre-flight doit utiliser `<tag>^{commit}`.
- **AUTH_BYPASS_PREVIEW status incertain** : preview hub v2 retourne 401. Mémoire CC dit "actif" mais prod dit "non". Vérification Vercel dashboard requise (5 min user — préalable à S1).
- **Build TS strict +1 erreur** : passé de 13 à 14 erreurs depuis le 27/04 (`output-formatters.test.ts:131`, Buffer Node 24). Baseline mise à jour, fix optionnel S4.

### 1.3 Bonnes nouvelles confirmées

- Tests 715/715 verts (aligné cible)
- Master `fbf910c` intact, working tree clean
- Tag `scenario-b-v1-cloture` pointe bien sur `634bfeb` (via `^{commit}`)
- DB cohérente : 64 briefs, 75 multi-pod, 1 261 cpg, 3 354 ép.
- Mémoire CC du 28/04 lisible et à jour
- `/api/cross/search` déjà fonctionnel (juste à sécuriser et exposer)

---

## 2. Règles d'engagement Phase Alpha

### 2.1 Cap budget LLM strict

> **Cap LLM Phase Alpha = 10 $ MAXIMUM cumulés sur les 4 semaines.**
> Si une opération unitaire dépasse 1 $, **STOP et demander validation Jérémy** avant exécution.
> Logger systématiquement le coût LLM par tâche dans `MEMORY.md`.

### 2.2 Décisions structurantes (validation Jérémy obligatoire)

1. Choix du provider de rate-limit (Vercel KV vs Upstash vs in-memory) — impact perf + coût.
2. Stratégie auth-gate `/cross/search` (header token simple vs auth complète) — impact UX + sécurité.
3. Texte exact privacy notice + mentions légales (à valider avocat avant publication finale).
4. Stratégie de marquage IA sur les contenus générés (mention discrète vs proéminente).

### 2.3 Décisions auto-prises par CC

- Refactorings internes sans impact API publique
- Choix de tests unitaires et leur structure
- Documentation interne (commentaires code, README techniques)
- Optimisations de performance internes

### 2.4 Garde-fous techniques

- **Tests régressifs** : ne jamais casser le 715/715. Si un test cassé apparaît, STOP et fix avant de continuer.
- **Build TS strict** : ne pas dégrader vs baseline 14 erreurs. Si une nouvelle erreur apparaît, l'enregistrer dans `docs/debt-tracking.md` avant de continuer.
- **Multi-tenant isolation** : tester systématiquement après toute modification touchant aux endpoints. Une fuite cross-tenant est critique (incident V2 LM en mémoire).
- **Vercel deploy workflow** : explicit project linking avant chaque deploy (`rm -rf .vercel && vercel link --project X --yes`), comme documenté dans `MEMORY.md`.

---

## 3. Pre-flight checks (à exécuter avant S1)

### 3.1 Pre-flight git

```bash
# Vérifier le tag avec déréférencement annoté
git rev-parse scenario-b-v1-cloture^{commit}
# Doit retourner : 634bfeb...

# Vérifier master intact
git rev-parse master
# Doit retourner : fbf910c...

# Working tree doit être clean
git status
# Doit afficher : nothing to commit, working tree clean
```

### 3.2 Pre-flight tests + build

```bash
npm test
# Cible : 715/715 passing

npm run build  # ou tsc --noEmit
# Cible : 14 erreurs (baseline post-27/04)
# Si > 14 erreurs : remonter à Jérémy avant continuation
```

### 3.3 Pre-flight Vercel (action Jérémy requise — 5 min)

> Avant que CC démarre S1, **Jérémy doit vérifier dans le dashboard Vercel** le projet `ms-hub` :
> - La variable `AUTH_BYPASS_PREVIEW` est-elle présente sur l'environnement Preview ?
> - Si oui, vérifier sa valeur.
> - Si non, décider : (a) la rajouter pour démo, (b) abandonner la démo via preview hub v2.

### 3.4 Pre-flight DB (read-only, hors repo)

Vérifications attendues :

- `episodes` : 3 354 rows, 11 tenants distincts
- `cross_podcast_guests` : 1 261 rows, 75 multi-pod
- `guest_briefs` : 64 rows
- `episode_embeddings` : 2 355 rows (= 70 % des episodes)
- 5 tenants à 0 % embeddings : `iftd`, `dva`, `onlacherien`, `allolamartingale`, `fleurons`

Script temporaire dans `C:\Users\jerem\AppData\Local\Temp\sillon-audit\` (hors repo, supprimé après).

---

## 4. Semaine 1 — Sécuriser le périmètre

**Objectif** : boucher les deux risques majeurs détectés à l'audit (non-conformité existante + endpoint exposé non-sécurisé) avant tout enrichissement produit.

**Métriques cibles fin S1** : privacy notice + mentions légales + bandeau cookies LIVE sur master prod. `/api/cross/search` rate-limité + auth-gated. Tests 715/715 toujours verts. Cap LLM consommé < 1 $.

**Effort total S1** : 10-13h CC, 0 $ LLM.

### T1.1 — Pre-flight checks complets

| | |
|---|---|
| **Effort** | 1h CC, 0 $ LLM |
| **Dépendances** | Aucune (point de départ) |
| **Action** | Exécuter §3.1 à §3.4. Documenter les résultats dans `MEMORY.md`. Si une anomalie détectée, remonter à Jérémy avant de continuer. |
| **Validation** | Tous les checks PASS, aucune anomalie remontée |

### T1.2 — Conformité RGPD (privacy + légales + cookies)

| | |
|---|---|
| **Effort** | 4-6h CC, 0 $ LLM |
| **Dépendances** | T1.1 complété |
| **Action** | 1) Créer page `/privacy` (privacy notice basique : finalités, base légale intérêt légitime, sous-traitants, droits, contact). 2) Créer page `/legal` (mentions légales LCEN). 3) Implémenter bandeau cookies CNIL-conforme (à minima : information + consent + opt-out cookies non-essentiels Resend). 4) Footer ajouté sur tous les frontends pointant vers `/privacy` et `/legal`. 5) Templates à valider Jérémy avant publication finale. |
| **Validation** | Pages `/privacy` et `/legal` en ligne sur master prod. Bandeau cookies visible. Footer à jour sur les 7 frontends. Aucun test régression. |

### T1.3 — Sécurisation `/api/cross/search`

| | |
|---|---|
| **Effort** | 4-6h CC, 0 $ LLM |
| **Dépendances** | T1.1 complété (peut être en parallèle de T1.2) |
| **Action** | 1) Rate-limit IP+origin via Vercel KV ou Upstash (60 req/h/IP par défaut, 200 req/h pour Origins trusted). 2) Auth-gate basique : header `X-Sillon-Token` requis, valider contre liste env var `SILLON_PREVIEW_TOKENS`. 3) Cache simple sur les requêtes répétées (Redis ou in-memory LRU). 4) Tests : vérifier que sans token = 401, avec token valide = 200, après 60 req IP non-trusted = 429. |
| **Validation** | Endpoint répond < 1s en cache hit, retourne 401 sans token, 429 après dépassement quota, 200 avec token + sous quota. |

### T1.4 — Mention 'IA' visible sur frontends + RAG showcase

| | |
|---|---|
| **Effort** | 1h CC, 0 $ LLM |
| **Dépendances** | T1.2 complété |
| **Action** | 1) Vérifier que les frontends mentionnant déjà 'IA' incluent une mention claire "Cet outil utilise une intelligence artificielle" (article 50 AI Act). 2) Sur RAG showcase, ajouter mention proéminente avant la première interaction. |
| **Validation** | Mentions IA visibles sur les frontends concernés. Tests visuels OK. |

> **Validation Jérémy fin S1** : avant de passer à S2, Jérémy valide : (a) privacy notice + mentions légales lus et acceptés (à validation avocat ultérieure), (b) sécurisation `/cross/search` testée manuellement, (c) cap LLM consommé < 1 $, (d) tests 715/715 verts. **Si OK → GO S2. Sinon → revue S1.**

---

## 5. Semaine 2 — Compléter le terrain technique

**Objectif** : combler les 950 épisodes sans embeddings sur 5 tenants avant d'exposer R1 en S3. Industrialiser `runPack()`. Investiguer l'anomalie `finscale.cross_refs`.

**Métriques cibles fin S2** : embeddings sur 100 % des 3 354 épisodes (vs 70 % aujourd'hui). `runPack()` industrialisé et testé sur 2-3 packs. Cause `finscale.cross_refs` identifiée et fixée si triviale.

**Effort total S2** : 13-18h CC, ~5 $ LLM.

### T2.1 — R4 Embeddings sur 950 épisodes manquants

| | |
|---|---|
| **Effort** | 3-4h CC, ~5 $ LLM |
| **Dépendances** | S1 validé |
| **Action** | 1) Identifier précisément les 950 épisodes (5 tenants : iftd 706, dva 98, onlacherien 82, allolamartingale 58, fleurons 6). 2) Lancer pipeline `embeddings.ts` par batch de 50 (Neon HTTP OOM au-dessus de 10 inserts parallèles, **batching obligatoire**). 3) Logger coût LLM réel cumulé. 4) Vérifier post-run que tous les episodes ont des embeddings. |
| **Validation** | `episode_embeddings` count = 3 354. Aucun tenant à 0 % d'embeddings. Coût LLM total < 6 $. |

### T2.2 — `runPack()` industrialisé

| | |
|---|---|
| **Effort** | 8-12h CC, 0 $ LLM |
| **Dépendances** | T2.1 idéalement complété (pas bloquant) |
| **Action** | 1) Implémenter `engine/pipelines/runPack.ts` (actuellement throw `not implemented`). Réutiliser logique de `experiments/.../phase6-runner.ts`. 2) Tester sur 2 packs existants pour vérifier reproductibilité. 3) Documenter usage dans `CLAUDE.md`. |
| **Validation** | `runPack(packId)` génère un pack complet en autonomie. Tests sur 2 packs pilote OK. |

### T2.3 — Investigation anomalie `finscale.cross_refs`

| | |
|---|---|
| **Effort** | 1-2h CC, 0 $ LLM |
| **Dépendances** | Aucune (en parallèle) |
| **Action** | 1) Investiguer pourquoi seulement 8/338 épisodes finscale ont `cross_refs` jsonb peuplé. 2) Diagnostic : bug ingest, scope manquant, autre. 3) Si fix trivial (< 30 min) : appliquer. Sinon : documenter dans `docs/debt-tracking.md` et reporter S4. |
| **Validation** | Cause identifiée et documentée. Fix appliqué si trivial, sinon dette documentée. |

> **Validation Jérémy fin S2** : GO S3 si : (a) 100 % embeddings OK, (b) `runPack()` fonctionnel, (c) cap LLM cumulé < 7 $, (d) tests verts. Si KO sur l'un, replanifier avant de continuer.

---

## 6. Semaine 3 — Exposer R1 + R3

**Objectif** : exposer publiquement la recherche cross-podcast (R1) sur l'API désormais sécurisée (T1.3). Livrer le pack pilote Boissenot complet (R3) pour démo prospects.

**Métriques cibles fin S3** : UI R1 accessible publiquement avec auth preview (token Stefani). R3 page pack pilote Boissenot complète et accessible. Tests intégration cross-tenant verts. Démo crédible disponible.

**Effort total S3** : 9-12h CC, 0 $ LLM.

### T3.1 — UI R1 Recherche cross-podcast

| | |
|---|---|
| **Effort** | 3-4h CC, 0 $ LLM |
| **Dépendances** | T1.3 (sécurisation) + T2.1 (embeddings) complétés |
| **Action** | 1) Composant UI R1 sur le hub (champ recherche + résultats). 2) Intégration avec `/api/cross/search` avec header `X-Sillon-Token`. 3) Affichage des résultats avec scoring sémantique + lien vers épisode source. 4) Loading states + gestion d'erreurs (401, 429, 500). |
| **Validation** | UI R1 fonctionnelle sur le hub. Recherche test "intelligence artificielle" retourne résultats cohérents en < 1.5s. |

### T3.2 — R3 Page pack pilote Boissenot complet

| | |
|---|---|
| **Effort** | 6-8h CC, 0 $ LLM |
| **Dépendances** | T2.2 (runPack) complété |
| **Action** | 1) Migrer le pack pilote depuis `experiments/.../pack-pilote-stefani-orso-v3-final/` vers une page publique (avec route Vercel). 2) Présentation : key-moments + quotes + cross-refs + brief annexe. 3) Page publique sous URL stable (par ex. `/pack-pilote/boissenot`). 4) Tests visuels. |
| **Validation** | Page accessible publiquement, contenu complet, design cohérent avec le hub. |

### T3.3 — Tests intégration cross-tenant

| | |
|---|---|
| **Effort** | 2-3h CC, 0 $ LLM |
| **Dépendances** | T3.1 + T3.2 complétés |
| **Action** | 1) Vérifier qu'un utilisateur d'un tenant ne peut pas accéder aux données d'un autre tenant via l'UI R1 ou la page pack pilote. 2) Tests automatisés sur isolation `tenant_id`. 3) Logs d'audit vérifiés. |
| **Validation** | Aucune fuite cross-tenant détectée. Tests automatisés ajoutés au build. |

> **Validation Jérémy fin S3** : GO S4 si : (a) R1 et R3 fonctionnels et accessibles, (b) tests cross-tenant verts, (c) cap LLM cumulé < 7 $, (d) au moins 1 test démo Stefani fait. Si KO : revoir avant S4.

---

## 7. Semaine 4 — Quick wins + GO/NO-GO Beta 1

**Objectif** : finaliser les quick wins restants (briefs invités complémentaires, quiz badge), boucler les tests E2E complets, préparer le GO/NO-GO Phase Beta 1.

**Métriques cibles fin S4** : top 50 cross-corpus = 100 % de briefs invités (vs 50/75 actuellement). Quiz badge visible sur le hub. Tests E2E couvrant les flux critiques. Bilan complet Phase Alpha rédigé.

**Effort total S4** : 9-14h CC, ~5 $ LLM.

### T4.1 — Briefs invités top 50 cross-corpus

| | |
|---|---|
| **Effort** | 2-3h CC, ~5 $ LLM |
| **Dépendances** | T2.1 (embeddings) idéalement complété |
| **Action** | 1) Identifier les invités du top 50 cross-corpus sans brief actuel (audit a remonté que 50/75 multi-pod ont des briefs, donc ~25 manquants). 2) Lancer génération via `persistGuestBrief()` pour ces invités. 3) Vérifier qualité aléatoire sur 5 briefs. |
| **Validation** | 75/75 multi-pod ont un brief. Coût LLM total Phase Alpha < 10 $. |

### T4.2 — Quiz quality badge exposé

| | |
|---|---|
| **Effort** | 3-5h CC, 0 $ LLM |
| **Dépendances** | Aucune (en parallèle) |
| **Action** | 1) Identifier où le quiz badge est calculé en backend. 2) L'exposer visuellement sur les pages publiques (pages épisodes, hub). 3) Design cohérent avec le hub. |
| **Validation** | Quiz badge visible sur les pages concernées. |

### T4.3 — Tests E2E + bilan Phase Alpha

| | |
|---|---|
| **Effort** | 4-6h CC, 0 $ LLM |
| **Dépendances** | T4.1 + T4.2 complétés |
| **Action** | 1) Tests end-to-end : ingestion → embeddings → brief → publication → R1 search → R3 page. 2) Documentation finale dans `MEMORY.md`. 3) Bilan Phase Alpha : ce qui a été livré, ce qui a été reporté, métriques finales (tests, coûts LLM réels, leads). 4) Préparation GO/NO-GO Phase Beta 1 (proposer 3 options à Jérémy). |
| **Validation** | Tests E2E verts. Bilan Phase Alpha rédigé dans `MEMORY.md`. 3 options Phase Beta 1 préparées pour décision Jérémy. |

> **GO/NO-GO Phase Beta 1 (fin S4)** :
> Critères GO : (1) Phase Alpha livrée intégralement (10 tâches ✓), (2) cap LLM < 10 $, (3) tests verts, (4) au moins 1 conversation prospect démarrée, (5) Jérémy disponible pour 200-400h CC sur 8 semaines suivantes.
> Si l'un manque : NO-GO et reprise Alpha pour combler. Décision finale Jérémy après lecture du bilan.

---

## 8. KPIs et reporting hebdomadaire

### 8.1 Format obligatoire dans `MEMORY.md`

Chaque vendredi, CC ajoute dans `MEMORY.md` un rapport hebdo au format strict ci-dessous :

```markdown
## Rapport hebdo S<N> (<date>)

### Tâches livrées
- [x] T<N>.<sub> Titre (effort réel : Xh, vs estimé Yh)
- [ ] T<N>.<sub> Titre (en cours, blocage : ...)
- [~] T<N>.<sub> Titre (reporté à S<M> pour raison Z)

### Métriques techniques
- Tests : X/Y (delta vs S<N-1>)
- Build TS strict : N erreurs (vs baseline 14)
- Coverage : X % (si remontable)

### Métriques business / coûts
- LLM consommé semaine : X $ / cumulé phase : Y $ / cap 10 $
- CC consommé semaine : Xh

### Décisions à valider Jérémy
- [ ] Question 1 : ...

### Risques détectés
- R1 : description, mitigation proposée
```

### 8.2 KPIs spécifiques Phase Alpha

| KPI | Baseline (29/04) | Cible fin S4 | Critique si |
|---|---|---|---|
| Tests passants | 715/715 | ≥ 715/715 | < 715 |
| Build TS strict | 14 erreurs | ≤ 14 | > 14 |
| Embeddings episodes | 2 355 / 3 354 (70 %) | 3 354 / 3 354 (100 %) | < 90 % |
| Briefs invités multi-pod | 64 / 75 (85 %) | 75 / 75 (100 %) | < 95 % |
| LLM cumulé Phase Alpha | 0 $ | ≤ 10 $ | > 10 $ |
| CC cumulé Phase Alpha | 0h | 41-57h | > 70h |
| Pages `/privacy` + `/legal` LIVE | Non | Oui | Non fin S1 |
| `/cross/search` rate-limit | Non | Oui | Non fin S1 |

---

## 9. Bloc d'amorçage CC

Pour démarrer Phase Alpha v2, l'utilisateur (Jérémy) ouvrira une nouvelle conversation CC, joindra ce fichier et `audit-2026-04-29.md`, puis demandera à CC d'amorcer.

### 9.1 Question d'amorçage

> Avant de commencer, exécute les pre-flight checks (§3 du brief)
> et fais-moi un résumé en 5 lignes max de :
> 1. État pre-flight (anomalie ou tout OK)
> 2. Plan d'attaque S1 (ordre des 4 tâches T1.1 à T1.4)
> 3. Questions de clarification éventuelles

### 9.2 Récapitulatif des 10 tâches Phase Alpha

| Semaine | Tâche | Effort | LLM |
|---|---|---|---|
| **S1** | T1.1 Pre-flight checks | 1h | 0 $ |
| **S1** | T1.2 Conformité RGPD privacy + légales + cookies | 4-6h | 0 $ |
| **S1** | T1.3 Sécurisation `/api/cross/search` | 4-6h | 0 $ |
| **S1** | T1.4 Mention IA frontends + RAG | 1h | 0 $ |
| **S2** | T2.1 R4 embeddings 950 ép. | 3-4h | ~5 $ |
| **S2** | T2.2 `runPack()` industrialisé | 8-12h | 0 $ |
| **S2** | T2.3 Investigation `finscale.cross_refs` | 1-2h | 0 $ |
| **S3** | T3.1 UI R1 sur API sécurisée | 3-4h | 0 $ |
| **S3** | T3.2 R3 page pack pilote Boissenot | 6-8h | 0 $ |
| **S3** | T3.3 Tests intégration cross-tenant | 2-3h | 0 $ |
| **S4** | T4.1 Briefs invités top 50 | 2-3h | ~5 $ |
| **S4** | T4.2 Quiz badge exposé | 3-5h | 0 $ |
| **S4** | T4.3 Tests E2E + bilan + GO/NO-GO | 4-6h | 0 $ |
| | **TOTAL** | **41-57h** | **~10 $** |

---

## 10. Référentiels et liens

### Documents associés
- `audit-2026-04-29.md` — rapport d'audit CC du 29/04 après-midi (à joindre)
- `MEMORY.md` — mémoire CC à enrichir hebdomadairement
- `CLAUDE.md` — règles projet, à respecter

### Mémoires CC du 28/04 (lisibles, à jour)
- `project_scenario_b_cloture_2026_04_28.md`
- `reference_audit_capabilities_2026_04_28.md`

### Échéances réglementaires externes
- **2 août 2026** : AI Act article 50 pleinement applicable (95 jours)
- **Juin 2026** : Code de bonnes pratiques transparence IA (Bureau de l'IA) finalisé

---

*Fin du brief Phase Alpha v2 — 29 avril 2026*
