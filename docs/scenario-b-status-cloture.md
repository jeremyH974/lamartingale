# Scénario B — Status clôture session 2026-04-28

> Document de clôture session refonte hub v2 pré-pilote Stefani 13/05. Branche `feat/hub-v2-scenario-b` complétée à `79fb0fd`. Décision merge/pause reportée à arbitrage Jérémy + Claude.ai post-stratégie produit globale.

---

## Récap milestones M1→M5

| Milestone | Commit | Validation Jérémy | Status |
|---|---|---|---|
| Étape 0 — ROADMAP_V2 + decisions log | `7dd1f51` | n/a | ✅ |
| M1.1 hero refondu | `ab01994` | ✅ | ✅ |
| M1.2 brief inline Larchevêque | `ab01994` | ✅ | ✅ |
| M1.3 cross-mini grid | `ab01994` | ✅ | ✅ |
| M1 fix pcById hoist + try/catch | `7cf5895` | ✅ (fix bug bloquant) | ✅ |
| M1 fix AUTH_BYPASS_PREVIEW | `0a4bd1b` | ✅ (validation iter visuel) | ✅ temporaire |
| M1 cleanup + alias stable | `5c129bc` | ✅ | ✅ |
| M2 RAG showcase passif (3 Q/R pré-cuites) | `90d5bae` | ✅ Option C "showcase passif" | ✅ |
| M3 invités partagés 2 tiers + toggle | `557704f` | ✅ "shippable" | ✅ |
| M4 cross-refs SVG graphique réseau | `dfb5d9b` | ✅ "bien jouée" | ✅ |
| M5.1 vision 4 cartes 2x2 (1ʳᵉ version) | `1b6557a` | ⚠️ révision demandée | itéré |
| M5.1 hybride C1/C3/C4 narratifs | `be1d6a0` | ⚠️ pause carte 4 | itéré |
| M5.1 v3 anti-Beepers + briefedGuests dyn | `e6807d2` | ✅ trust delegation Étape 1 | ✅ |
| **M5.0 finalisation briefs Nahima + Angélique** | (DB only — pas de commit code) | autonome | ✅ |
| **M5.2 EN AVANT-PREMIÈRE 3 cartes briefs** | `79fb0fd` | en attente validation finale | livré |

## Détail décisions stratégiques notables

- **Auth bypass Preview** — `AUTH_BYPASS_PREVIEW=true` env Vercel Preview pour itérer M1-M5 sans flow magic-link. Code ajouté `engine/auth/middleware.ts`, à RETIRER post-validation.
- **SSO Vercel** — restauré `all_except_custom_domains` après clarification Jérémy (couche réseau distincte de l'auth applicative).
- **RAG verdict Option C "showcase passif"** — éviter latence 11s + risque hallucination live. 3 Q/R pré-générées dans `frontend/data/showcase-rag-responses.json`.
- **Carte 4 anti-Beepers** — repositionnement "infrastructure éditoriale d'un univers de marques", chiffres dynamiques `totals.briefedGuests` ajouté god-node `engine/universe.ts`.
- **M5.0 Option B mono-pod inclus** — briefs Nahima + Angélique générés malgré couverture 1pod (badge "1ʳᵉ intervention" assumé).
- **Fix latéral cpg #825** — `tenant_appearances [8]→[314]` corrigé pour Angélique (bug populate-cross-guests pré-existant).

## Endpoints + assets touchés

- `engine/universe.ts` (god-node) : ajout `totals.briefedGuests`
- `engine/api.ts` (god-node) : `filterUniverseByTenants` préserve `briefedGuests`
- `engine/auth/middleware.ts` : bypass Preview temporaire
- `frontend/hub.html` : sections M1-M5 ajoutées + toutes injections JS dynamiques
- `frontend/data/showcase-rag-responses.json` : 3 Q/R pré-cuites
- DB : 4 briefs cpg ajoutés (Arthur #171, Joseph #278 préexistant, Nahima #959, Angélique #825) + fix 1 row tenant_appearances

## Cap LLM Scénario B consommé

| Phase | Coût | Cumul |
|---|---|---|
| M2.0 pré-check RAG (3 prompts) | ~$0.005 | $0.005 |
| M2.1 génération showcase (3 prompts) | ~$0.005 | $0.010 |
| M5.0 brief Arthur Auboeuf (cpg #171) | $0.0305 | $0.041 |
| M5.0 brief Nahima Zobri (cpg #959) | $0.0352 | $0.076 |
| M5.0 brief Angélique de Lencquesaing (cpg #825) | $0.0266 | **$0.103** |

→ **$0.103 / cap $10 = 1 %** consommé. Marge confortable pour finitions.

## URLs validation

- **Preview alias stable** : https://ms-hub-v2-preview.vercel.app
- **Preview deploy actuel** : `ms-a2mdp67ut-jeremyh974s-projects.vercel.app` (= alias)
- **Production** : `ms-hub.vercel.app` (intacte, pas de promote prod faite)

## Tests + audits

- 715/715 tests verts (incluant universe.test.ts, tenant-isolation.test.ts, output-formatters.test.ts)
- audit-timestamps Phase 6 : 35/35 (intact, hors scope Scénario B)
- audit visuel manuel desktop + mobile 375px : à faire Étape 6 ci-dessous

## Branches & tags

- **Branche active** : `feat/hub-v2-scenario-b @ 79fb0fd`
- **Master** : `fbf910c` (intact, pas mergé)
- **Tags** : `phase-8-extractquotes-fix` à `da86b40` (pré-Scénario B)

## Documents de session générés

- `docs/scenario-b-decisions.md` — log linéaire décisions A/B/C niveau A→F
- `docs/investigation-5-livrables-2026-04-28.md` — pause stratégique M5
- `docs/audit-capabilities-global-2026-04-28.md` — audit 2-strates business + tech
- `docs/scenario-b-status-cloture.md` — ce document

## Notes de continuité (reprise éventuelle)

Si reprise :
1. Branche `feat/hub-v2-scenario-b` figée à `79fb0fd`
2. Preview alias `ms-hub-v2-preview.vercel.app` actif tant que `AUTH_BYPASS_PREVIEW=true`
3. Cap LLM résiduel : $9.90 disponibles
4. Master inchangé — décision merge/pause reportée Étape 7 NIVEAU C explicite

Items de dette identifiés Scénario B :
- Retirer `AUTH_BYPASS_PREVIEW` env + middleware bypass (1 commit revert)
- Carte 4 v3 réévaluable selon stratégie produit Sillon globale
- Pipeline `runPack()` non-implémenté (audit pépite cachée)
- 13 briefs invités complémentaires possibles (audit R5)
- 999 ép. sans embedding (IFTTD/DVA/OLR/AlloLM/Fleurons) (audit R4)
- Recherche cross-podcast UI réelle (audit R1)
- Chat cross-podcast UI réelle (audit R2)
