# Dette technique — Podcast Engine

État au **28 avril 2026**, après Phase A→H pré-pilote Stefani.

Classement par priorité décroissante. **P0 = bloquant / P1 = forte valeur / P2 = améliorations / P3 = moyen terme**.

---

## Audit numérotation RSS catalogue producteur — feature Sillon V2 (P3)

**Constat** (Phase K Bug #5 investigation 2026-04-28) : la détection
automatique des trous séquentiels dans la numérotation `<itunes:episode>`
des feeds RSS révèle des patterns intéressants :
- LM 54 trous séquentiels (#3-22, …) — feed Audiomeans tronquée aux ~290
  derniers eps (politique standard d'Audiomeans pour les flux principaux,
  les vieux épisodes #1-22 ne sont pas dans le RSS publique)
- LP 1 trou (#363) — épisode dépublié ou renuméroté
- OLR 1 trou (#28) — idem
- 37 mismatch globaux ep_num DB vs `#NUM` initial dans le titre (drift +/-1
  récurrent : Audiomeans renumérote parfois à la marge)

**Mitigation Phase K appliquée** : compteur card = `displayedCount`
basé sur `MAX(episode_number)` filtré full quand le ratio
(eps_avec_epnum / total_full) > 0.8. Aligne le card sur la perception
du producteur (dernier # publié) plutôt que strict count true-full.
Évite les écarts visibles type "#314 mais 273 ép.".

**Plan fix V2** (post-pilote Stefani, conditionnel signal positif) :
1. Endpoint `/api/admin/audit-numbering/:tenant_id` qui retourne :
   - Trous séquentiels détectés (`generate_series 1..MAX` minus DB)
   - Episodes dépubliés probables (gap + dates contextuelles)
   - Episodes renommés (mismatch ep_num DB vs `#NUM` titre)
2. Vue admin créateur dédiée : "Audit éditorial RSS — voici les épisodes
   manquants/dépubliés/renommés dans votre flux sur les N derniers"
3. **Pitch potentiel additionnel à Stefani** : Sillon devient aussi un
   outil d'audit éditorial du catalogue (pas seulement RAG/cross-corpus).

**Cap budget V2 estimé** : $0 LLM (pure SQL + UI).

---

## ✅ CHANGELOG — Pré-pilote Stefani 2026-04-28 (Phases A→K)

**14/17 bugs P0/P1/P2 du rapport audit hub UI 2026-04-28 résolus** (82%) :

### P0 (4/4) ✅ tous résolus
- P0-1 doublon `#NUM #NUM` cards podcast → Phase A1 (cleanTitle helper)
- P0-2 Finscale top 3 `[EXTRAIT]` → Phase A2 (cosmétique) + Phase E (racine, feed Podcastics)
- P0-3 drift counts hub config → Phase A3a (description sans chiffres figés)
- P0-4 cross-refs dégénérées → Phase A6 (decidePairStatsRendering, fallback amorce)

### P1 (4/6) ✅ résolus
- P1-1 LP `#HS` featured → Phase A4 (filter SQL CTE) + A.5.4 (editorial_type='hs')
- P1-2 pollution cross_podcast_guests → Phases B2/B3/B4 (DELETE 31 + isValidPersonName élargi 12 patterns)
- P1-3 briefs invités vides → Phase C (50 nouveaux briefs bulk, 61/75 = 81% cross-tenant)
- P1-5 lien retour `/hub.html` → `/` → Phase A5

### P2 (6/7) ✅ résolus
- P2-1 producers footer → G1 audit (3 producers cohérents Cosa Vostra/Gokyo/Orso Media)
- P2-2 pluralisation podcast(s) → Phase G2
- P2-3 single-word jean-sebastien → Phase B4
- P2-4 espaces multiples → Phase B5a (250 episodes)
- P2-6 LM 4 eps duration NULL → Phase G3 (DELETE 4 orphans sans audio_url ni guid)
- P2-7 GDIY 1 ep title NULL → Phase A.5.5a (re-ingest backfill)

### Reportés V2 (3 items)
- P1-4 soft-404 `/guest-brief/<random>` (cf. section dédiée plus bas)
- P1-6 LP/GDIY guests sous-évalués (Phase D skipped — pipeline guest extraction RSS limité)
- P2-4b accents perdus (Frédéric/Stéphane/Géraldine, risque régression auto)

### Extensions structurelles Phases A.5 / B / C / E
- **+5 tenants Orso** ingérés (fleurons, iftd, demainvousappartient, allolamartingale, onlacherien) → 6 → 11 tenants
- **Re-ingest 6 existants** sur feeds Audiomeans à jour (LM, GDIY, LP, FS, PP, CCG)
- **+ feed Podcastics Finscale** (P0-2 racine, +164 true-full FS)
- **Colonne `editorial_type`** ajoutée + backfill 2409 rows (full/extract/teaser/rediff/bonus/hs)
- **Module pur `classifyEditorialType`** + 15 tests + appliqué à l'INSERT ingest-rss + UPSERT
- **Module pur `pickUpsertStrategy`** + 6 tests (fix LP `episode_number=null` + guid)
- **Module pur `isValidPersonName`** + 12 tests (corpus 30 pollutions B2)
- **Module pur `decidePairStatsRendering`** + 9 tests (fallback amorce ≥5 refs)
- **Fix critique `match-guests.ts:268` TRUNCATE → ON CONFLICT** (B0 P0, préserve brief_md)

### Stats DB finales 2026-04-28 (post-Phase G)
- 11 tenants, **2595 true-full eps** (double filtre `episode_type` iTunes ∧ `editorial_type='full'`)
- **1261 cross_podcast_guests**, 75 cross-tenant (≥ 2 pods), 61 avec brief
- 0 row pollution résiduelle (filtre B3 robuste, re-runs idempotents)
- 0 doublon Allo LM cross-tenant (B7)
- 0 espace multiple `\s{2,}` dans titles
- audit-timestamps 35/35 préservé à travers 8 commits Phase A→G

### Cumul session LLM
- Phase A : $0
- Phase A.5 : $0 (Whisper bulk skipped)
- Phase B : $0
- Phase C : **$1.83** (50 briefs Sonnet)
- Phase E : $0
- Phase G : $0
- **Total : ~$1.83 / cap session $60 (3%)**

### Tags rollback granulaire
- `pre-pilote-phase-a` (8cc5a3b)
- `pre-pilote-phase-a5` (137518c)
- `pre-pilote-phase-b` (cbbd9fb)
- `pre-pilote-phase-c` (09f7deb)
- `pre-pilote-phase-g` (0d341a7)

---

## Phase C V2 — Brief invité, brancher transcripts dans la cascade source (P1)

**Constat** (découvert 2026-04-28 pendant Phase C bulk briefs review qualité) :
le pipeline `engine/agents/wrappers/persistGuestBrief.ts` ne consomme PAS
les transcripts audio. La cascade `sourceSelector.ts:35-42` priorise
`article_content > chapters_takeaways > rss_description`. La ligne
`{ type: 'transcript', priority: 100, minLength: 5000 }` est commentée
"FUTURE — décommenter quand le pipeline transcript audio arrivera".

**Conséquence mécanique** : la section "Verbatims" (renommée Phase C2.5
en "Citations clés") du frontend `/guest-brief/:slug` n'a jamais accès au
verbatim oral. Le LLM extrait des paraphrases plausibles depuis le
contenu éditorial publié (article post-prod Orso, résumés). Pas du
verbatim authentique.

**Mitigation appliquée Phase C2.5** : renommage frontend "Verbatims" →
"Citations clés" + disclaimer italic sous le titre :
> Punchlines extraites du contenu éditorial publié par les producteurs
> (articles, résumés). Pas de transcript audio indexé sur ce périmètre — V2.

Pas de modif logique, pas de regen briefs (les 51 briefs Phase C restent
utilisables avec la sémantique "citation curée" honnête).

**Plan fix V2** (conditionnel signal Stefani positif post-pilote) :
1. Décommenter `engine/agents/wrappers/sourceSelector.ts:37` pour
   inclure transcripts en priorité 100 dans la cascade.
2. Générer transcripts Whisper sur les ~50-100 guests les plus partagés
   uniquement (ciblé top cross-tenant, pas bulk). Coût estimé sur top
   50 cross-guests × moy 4 eps × 60min = 200h × $0.006/min ≈ **$72**.
   Plus modeste : top 10 cross-guests 3-pods × 4 eps × 60min = 40h
   ≈ **$14.40**.
3. Régénérer les briefs concernés via `scripts/bulk-guest-briefs.ts
   --force` pour reprendre les vraies quotes verbatim. Coût Sonnet
   ≈ $0.04/brief × 50 = **$2**.
4. Retirer le disclaimer "pas de transcript indexé" du frontend.
5. Brancher la validation post-extract verbatim (style Phase 8
   `extractQuotes` segmentId pattern) pour bloquer toute hallucination
   LLM résiduelle.

**Cap budget V2 estimé** : $30-100 LLM Whisper + $2-5 Sonnet selon
ambition (ciblé top 10 cross-tenant ou top 50 entier).

**Décision A.5.5b confirmée** : skip massif Whisper bulk (~$1047 sur
2488 true-full eps) tant que pas de signal explicite Stefani sur la
valeur de recherche audio cross-corpus.

---

## Discipline scripts audit — DEFAULT paths à suivre les commits structurants (P2)

**Constat** (découvert Phase A.5 Étape A 2026-04-28) :
`scripts/audit-timestamps.js` avait `DEFAULT_PACK = 'experiments/.../
pack-pilote-stefani-orso'` (pack Phase 6 pré-fix Phase 8) au lieu de
`pack-pilote-stefani-orso-v3-final-md-audit` (post-Phase 8, baseline 35/35).
Le run sans args retournait **23/39 OK (59%)** au lieu des 35/35 attendus,
suggérant à tort une régression Phase A.5 alors qu'aucun fichier audit
ni transcript n'avait bougé.

**Fix appliqué** (commit `3576242`) : update `DEFAULT_PACK` vers
`pack-pilote-stefani-orso-v3-final-md-audit`.

**Règle générale post-pilote V2** :
- Tout commit structurant qui crée un nouveau pack/snapshot/référence
  (ex. Phase 7a output formats créant `v3-final/`) doit auditer les
  scripts qui pointent vers la version précédente (DEFAULT_PACK,
  DEFAULT_TRANSCRIPTS, etc.).
- Idéalement : checklist "scripts à mettre à jour" dans le commit
  template.

---

## Cycle de vie cross_podcast_guests — soft-delete is_active (P2)

**Constat** (suite Phase B0 fix TRUNCATE 2026-04-28) :
le retrait du `TRUNCATE cross_podcast_guests RESTART IDENTITY` dans
`match-guests.ts` (B0, commit `dcc6ab3`) préserve `brief_md` à travers
les re-runs MAIS introduit le risque d'**entries orphelines** : un guest
dont le `canonical_name` change après re-extraction (ex. accent normalisé
différemment, fix titre RSS amont) crée un nouveau row sans supprimer
l'ancien.

**Mitigation phase pilote** : 30 entries pollution + 1 jean-sebastien +
6 ré-créés ont été supprimés en B2/B3/B4. Le filtre `isValidPersonName`
B3 empêche la pollution future à l'INSERT, mais ne gère pas les rows
orphelines anciennes.

**Plan fix V2** :
- Ajouter colonne `is_active BOOLEAN DEFAULT true` sur cross_podcast_guests
- Soft-delete (`is_active = false`) au lieu de DELETE pour les rows non
  vues lors d'un match-guests run
- Cleanup périodique conditionné sur is_active = false ET updated_at < now() - 30j
- Hub queries filtrent `WHERE is_active = true`

**Cap budget V2 estimé** : $0 LLM, ~30min wall (migration ALTER + script
cleanup + adaptation match-guests).

---

## B5b — Accents perdus dans canonical_name / display_name (P3)

**Constat** (Phase B5 2026-04-28) : noms comme "frederic" sans é,
"helene" sans è, "stephane" sans é, "geraldine" sans é présents en DB.
Cosmétique mais lisibilité.

**Pourquoi pas fixé en Phase B5** : risque de régression ambiguë.
"Stephane Bern" (nom propre sans accent valide) vs "Stéphane Mailfert"
(accent légitime perdu lors de l'extraction RSS) — pas distinguable
auto sans contexte par-row. Auto-correct via regex aveugle = risqué.

**Plan fix V2** :
- Cross-référencer avec une table d'orthographe française (Wikipedia
  noms propres) ou un service NER + hint accent
- Sample manuel sur 20 noms ambigus pour calibrer
- Ou simplement : afficher accents quand `display_name` les a (déjà
  partiellement le cas) et accepter que `canonical_name` ASCII reste
  pour le slug

---

## Phase 5 V1 — Whisper sans diarization → attribution host/invité ambiguë (P1)

**Constat** : sur Plais (GDIY #266), le pipeline `extractQuotes` a
attribué la phrase "Nous sommes la moyenne des personnes que nous
fréquentons" à Frédéric Plais alors que c'est la **phrase-fétiche
documentée de Matthieu Stefani** (cf. `docs/PERSONAS_ORSO.md` ligne 70-71,
`tics rhétoriques`). Le verbatim guard est passé parce que la phrase est
réellement dans le transcript (peut-être dite par Stefani, ou citée par
Plais qui paraphrase Stefani — impossible à savoir sans diarization).

**Cause structurelle** : OpenAI Whisper API standard ne retourne PAS de
speaker labels. Tous les segments du transcript sont "anonymes". Le
pipeline ne peut donc pas savoir si une phrase verbatim vient du host ou
de l'invité.

**Mitigations en place (V2 commit a venir)** :
- `ClientToneProfile.host_blacklist_phrases` : liste de phrases-fétiches
  du host à rejeter automatiquement (Stefani : "Nous sommes la moyenne
  des personnes que nous fréquentons" + tagline GDIY).
- Prompt `extractQuotes` enrichi avec règles :
  - Rejeter quotes contenant marqueurs 1ère personne plurielle ambigus.
  - Rejeter quotes ressemblant à une question d'interviewer.
  - Rejeter explicitement les phrases-fétiches connues du host.
- Cf. commit prochain "fix(quotes): host-blacklist + diarization-aware
  prompt".

**Solution complète post-pilote** (P1, P3 délai) :
- Intégrer **Whisper diarization** : 3 options, choix à faire selon
  budget/qualité/intégration :
  - **AssemblyAI** : API hosted, Speaker Labels, tarif ~$0.025/min audio
    (vs Whisper $0.006/min). Pour 4 épisodes pilote 35h cumulés ≈ $52.5.
  - **Deepgram** : API hosted, Diarization, tarif similaire.
  - **PyAnnote** ou **whisperX** : self-hosted Python, gratuit côté API
    mais demande infra GPU (~$0.50/h GPU).
- Décision à prendre quand les 4 épisodes pilote sont définitivement OK
  + ROI mesuré : si Stefani relit et signale d'autres mauvaises
  attributions → bascule diarization. Sinon liste noire suffit pour V1
  pilote.

**Pas bloquant** pour la livraison Stefani 13/05 — la mitigation V2
(host_blacklist + prompt) couvre les phrases-fétiches connues.

---

## Phase 4 V4 — editorial-base over-matching sur transcripts longs (P2)

**Constat** : sur GDIY #266 Plais (Whisper réel, 47 segments analytiques
de 4min sur 185 min audio total), la lens fallback `editorial-base`
matche 11 segments (vs 1 sur Nooz, 0 sur Boissenot, 0 sur Veyrat). Les
rationales sont éditorialement pertinents ("parcours entrepreneurial,
prise de risque, discipline mentale") — Plais a réellement du contenu
biographique riche dans son interview 3h.

**Mitigations en place** :
- Per-lens `match_threshold: 0.6` sur editorial-base (engine/types/lens.ts
  + commit efbc0ad). Réduit V3→V4 de 20 à 11 matches sur Plais.
- Filtrage top-N par lens dans les livrables Phase 5 (constante
  `MAX_MATCHES_PER_LENS = 5` appliquée dans cross-refs by lens + brief
  annexe). Mitige l'impact UX sans toucher au scoring.

**Hypothèses sur la cause** :
1. **Signal éditorial réel** — Plais est un fondateur expérimenté dans
   un format long (3h), donc il développe des réflexions "leçons
   business" plus que sur une interview courte (Veyrat 31min).
2. **Lens fallback paramétrée trop large** — concepts génériques
   (parcours entrepreneurial, leçons business, discipline mentale) qui
   matchent tout podcast entrepreneurial.

**À investiguer post-pilote** :
- Mesurer la distribution editorial-base sur 10+ épisodes diversifiés
  (durée + invité différents). Si le pattern "long format = +matches"
  se confirme, c'est un signal éditorial à valoriser, pas un bug.
- Si surfsce après livraison Stefani : raffiner concepts editorial-base
  pour exiger un thème "biographique pivot" (tournant majeur, philosophie
  hors business pur) plutôt que des éléments toujours présents.

**Pas bloquant** pour la livraison Stefani 13/05.

---

## ✅ Phase 2 architecturale — bug parser SQL des wrappers de migration (FERMÉE 2026-04-28)

**Avant** : `engine/db/migrate-entities.ts` (et tous les wrappers `migrate-*.ts`
qui ont copié son pattern) parsait les fichiers `.sql` ainsi :

```ts
const statements = sqlContent
  .split(/;\s*\n/)
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));
```

Le filtre `!s.startsWith('--')` était appliqué APRÈS le split et regardait
le 1er caractère du statement entier. Or après split sur `;\n`, le
**premier bloc** d'une migration standard contient l'en-tête de
commentaires + le 1er CREATE TABLE. Comme ce bloc commence par `--`, le
filtre droppait silencieusement le CREATE TABLE.

**Symptôme observé** : la migration `2026-04-27-create-entities.sql` a dû
être appliquée via un one-shot `npx tsx -e ".then() chaîné"` plutôt
qu'avec le wrapper. Le wrapper `migrate-entities.ts` était donc cassé en
silence depuis sa création.

**Résolution (commit Phase 2 / Engagement 1)** :
- Nouveau module `engine/db/run-sql-file.ts` exposant
  `parseSqlStatements(sql: string): string[]` qui strippe les lignes de
  commentaires AVANT le split, puis split sur `;`. Plus robuste.
- `engine/db/migrate-entities.ts` refactoré pour utiliser `runSqlFile()`.
- Nouveau wrapper `engine/db/migrate-editorial-events.ts` qui utilise la
  même infra (Engagement 1 : table editorial_events).
- Tests : `engine/__tests__/run-sql-file.test.ts` (10 tests dont 1
  *witness test* qui prouve que l'ancien parser droppait bien le 1er
  statement sur le contenu réel des migrations).

**Migration future** : tous les futurs wrappers `engine/db/migrate-*.ts`
doivent utiliser `runSqlFile()` plutôt que de copier l'ancien pattern.
Les anciens wrappers `migrate-tenant.ts`, `migrate-rss-exhaustive.ts`,
etc., héritent probablement du même bug — à auditer si une re-application
est jamais nécessaire (idempotence sauf eux-mêmes).

---

## Règle smoke test pour flags UI

Un flag qui affecte l'UI doit être smoke-testé avec une vérification
navigateur (rendu JS exécuté), pas seulement par `curl /api/config` ou
grep HTML. La propagation back-end n'est qu'une moitié du test.

**Format smoke test correct** :
- Vérif API : champ présent + valeur attendue.
- Vérif navigateur : élément présent/masqué visuellement + fonctionnel
  au clic/hover.
- Screenshot si possible pour trace.

**Faux positif connu** : 24/04/2026, commit `0daff6a` — smoke test du flag
`qualityQuizReady` validé par `curl /api/config` seul, bouton Quiz
déclaré *"affiché sur LM"* alors qu'il avait été retiré de la nav 7h
plus tôt par `c67f4bf`. Régression non détectée avant Jérémy en prod.
Fix tracé dans `fix(v2): make hero quiz stat clickable on tenants with qualityQuizReady`.

---

## État transitoire à tracer (post-B, pré-F)

### Nav publique réduite à 5 items, routes Assistant/Quiz toujours actives
- **Commit** : `refactor(nav): reduce public nav from 10 to 5 items`
- **État** : `frontend/v2.html` nav = Accueil / Épisodes / Parcours / Experts / Recherche. Les 5 items retirés (Assistant, Quiz, Graphe, Pour vous, Dashboard) ne sont plus dans la nav publique.
- **Mais** : les sections HTML correspondantes (`#v-chat`, `#v-quiz`, `#v-graph`, `#v-reco`) et leurs routes JS `go('chat')` / `go('quiz')` / `go('graph')` / `go('reco')` restent fonctionnelles. Accessibles par lien direct ou bouton interne.
- **Résolu par Phase F** : Assistant et Quiz seront transformés en widgets inline sur la page épisode, "Pour vous" deviendra post-login. Graphe et Dashboard resteront URL-only (outils créateur/admin).
- **Pas un bug** : état intentionnel pour que la nav publique soit cohérente avant la refonte UX complète.

### Audit entry points post-c67f4bf

Le commit `c67f4bf` a retiré 5 items nav (Assistant, Quiz, Graphe,
Pour vous, Dashboard). **Quiz rétabli sur LM** via hero-stat cliquable
(commit `7e5caa4`, pattern conditionnel `qualityQuizReady === true`).

Reste à auditer pour chacun des 4 autres, **tenant par tenant** :

- **Assistant** (`go('chat')`) : qualité prod ? Introduire flag `assistantReady` ?
  Vérifs à faire : RAG fonctionne sur quel tenant (scope `/api/chat` + embeddings) ?
  Qualité des réponses sur LM vs GDIY vs les 4 Orso ? Si prod sur LM seul,
  même pattern que `qualityQuizReady` → tile hero cliquable conditionnelle
  (ex. hero CTA "Poser une question à l'assistant →" déjà présent ligne 1335
  de `v2.html`, peut-être suffisant — à vérifier).
- **Graphe** (`go('graph')`) : qualité prod ? Introduire flag `graphReady` ?
  Dépend directement de `pillarsReady` (le graphe colore par pillar). Sur
  LP/PP/CCG (`pillarsReady=false`), le graphe afficherait le bucket
  UNCLASSIFIED — à masquer ou à reskin neutre.
- **Pour vous** (`go('reco')`) : déjà conditionné par `pillarsReady` (commit
  `0a642ea` — placeholder "Thématiques en cours d'analyse" quand flag false).
  Reste à rétablir un entry point UI sur tenants où `pillarsReady=true`
  (LM, GDIY, Finscale). Sinon la route fonctionne mais personne n'y arrive.
- **Dashboard** (`/v2-dashboard.html`) : Option Beta déjà planifiée
  (absorption hub créateur, cf. section "Absorption dashboards créateur
  dans hub"). Pas de réhabilitation nav publique prévue — reste URL-only
  pour créateur.

**Pattern commun** : introduire des flags `features.XReady` par feature
secondaire + pattern hero-stat cliquable (ou hero CTA conditionnel) pour
rétablir la découvrabilité. Propagation via `toPublicConfig()` +
tests config + smoke test navigateur obligatoire (cf. "Règle smoke test
pour flags UI").

**Priorité** : **P2**, à faire avant démo Orso/Matthieu **si** la démo
couvre ces features. Si scope démo limité à Accueil / Épisodes / Quiz /
Hub agrégateur (top 4 livrables Rail 1 + Phase B), repousser à Phase F.

**Autonomie** : lecture-seule + ajout DETTE. Aucun patch UI pour
Assistant/Graphe/Reco sans GO explicite — arbitrage produit (qualité
suffisante pour démo ?) dépend du retour Matthieu/Orso.

### Hub figé sur LM×GDIY (2/6 podcasts)
- **État** : `frontend/hub.html` hardcode 2 cards + ternaires `'lamartingale' ? 'LM' : 'GDIY'` lignes 369/444/522. Les 4 autres tenants (LP, Finscale, PP, CCG) déployés mais absents du hub.
- **Résolu par Phase C** : nouveau `/api/universe` + réécriture `hub.html` pour N tenants. Design doc dans `docs/design-api-universe.md`.

### Search multi-tenant hub retirée en Phase C
- **Décision** : le hub V2 (Phase C) n'aura pas de search bar globale. Les créateurs (cible du hub) ont rarement besoin de recherche cross-podcasts ; l'user qui arrive sur un card → va sur le site tenant → utilise la recherche par tenant existante.
- **Pas de fan-out côté client** (6 fetches parallèles) pour un usage marginal.
- **À reconsidérer** : après Phase E (auth + usage réel des créateurs), si un vrai besoin remonte côté Orso/MS, créer `/api/search/universe` dédié.

### Perf `/api/universe` cold hit 2.15s (acceptable, sous surveillance)
- **Mesure** (24/04/26, pré-deploy Phase C) : cold hit ~2.15s (4 queries parallèles sur 6 tenants + URL-matching runtime sur ~28 500 rows `episode_links`). Warm hit ~71ms (cache `getCached('universe', 3600, …)` MEM + Vercel KV).
- **Acceptable maintenant** : la page `hub.html` est low-traffic (créateurs + partage) et le cache 1h amortit. Cold hit uniquement au premier load post-deploy ou post-TTL.
- **Seuils de surveillance** :
  - **P3** si cold > 3s sustained (dégradation modérée, à investiguer)
  - **P2** si cold > 5s (dégradation bloquante UX, refactor requis)
- **Leviers d'optimisation si nécessaire** : index partiels sur `episode_links(tenant_id, url)`, matérialisation d'une `cross_refs_mv` rafraîchie au post-ingest, ou pré-calcul runtime dans une table `universe_snapshot` (refresh via hook CLI). À considérer si GDIY complet (passage 959 → ~1 200 eps à terme) fait monter cold hit au-delà des seuils.

### Redeploy sous-sites conditionnel — widget "Autres podcasts de l'univers"
- **État** : `hub_order` est exposé dans `PublicPodcastConfig` (via `/api/config`) mais **non consommé** par les sous-sites (LM, GDIY, LP, FS, PP, CCG). Les déploiements sous-sites courants (24/04/26) n'ont donc pas besoin d'être refaits pour Phase C.
- **À activer en Phase F (probable)** : si un widget "Autres podcasts de l'univers" est ajouté dans le footer ou sidebar de `frontend/v2.html`, il consommera `hub_order` pour ordonner les cards et nécessitera un redeploy des 6 sous-sites pour récupérer les nouveaux champs dans `/api/config`.
- **Action Phase F** : si ce widget est spec'é, ajouter au plan de release "redeploy 6 sous-sites post-merge" (boucle `npm run deploy:<id>` ou `cli deploy --all` si #19 shipped).
- **Si décision inverse** (pas de widget cross-podcast sur les sous-sites) : skip redeploy, laisser `hub_order` comme métadonnée hub-only.

### Calibration quiz Rail 1 — factoïdes numériques intrinsèques

Décision Rail 1 : le prompt Haiku autorise les questions numériques
quand elles portent sur un chiffre-clé de l'épisode (règle 50/20/30,
plafond PER, taux fiscaux). Ces factoïdes ne sont pas un bug mais
une fidélité au contenu source.

À ne pas "corriger" par un prompt plus strict anti-numérique : ça
dégraderait les eps dont le fond EST numérique (listes de conseils,
fiscalité, ratios d'investissement).

Validation : 3 samples dry-run (#16, #141, #313) — 12/15 conceptuels
ou applicatifs, 3 factoïdes traçables et utiles. Calibration retenue.

---

## Phase E — Auth créateur (post-Rail 4a, pré-seed externe)

### Scope produit à trancher avant onboarding externe

Rail 4a a shippé le back-end auth (magic-link + session cookie HMAC + scope `podcast_access`) avec **seulement `jeremyhenry974@gmail.com × '*' × root` seedé**. Avant de seeder des accès externes, trancher :

- **Matthieu Stefani** : accès `root` (visibilité univers complet y compris futurs podcasts MS) ou scope restreint `[lamartingale, gdiy]` (les 2 podcasts qu'il anime) ? Si root, alignement avec la vision "propriétaire/créateur principal de l'univers MS". Si scope restreint, plus granulaire mais bloque la visibilité sur LP/Finscale/PP/CCG (produits Orso dont il n'est pas host).
- **Orso Media / Cosa Vostra / Gokyo** : email d'équipe générique (`team@orsomedia.fr`) avec scope multi-tenant, ou individus distincts par label ? L'email d'équipe simplifie l'onboarding (1 accès partagé) mais perd le tracking par personne. Décision à prendre avec Matthieu.
- **Invités VIP** : aucun besoin modélisé en Phase E. À re-évaluer Phase G+ si un besoin d'accès guest émerge (ex: guest veut voir ses stats d'écoute sur ses passages). Trop tôt pour modéliser — laisser `podcast_access` porter uniquement créateurs/producteurs pour l'instant.

**Action** : recueillir la décision de Matthieu lors du seed externe (post-validation prod hub 4b). Le seeding actuel est 100% réversible (`DELETE FROM podcast_access WHERE email = ?`), pas de risque à itérer.

### Absorption dashboards créateur dans hub — Option Beta (P2)

**Constat** : les dashboards `frontend/v2-dashboard.html` sont actuellement **par tenant** (un dashboard par sous-site, accessible via `/dashboard` de chaque instance). Un créateur multi-podcasts (Matthieu : LM + GDIY) doit naviguer entre sites pour voir ses KPIs.

**Option retenue — Beta (post-4b, pré-Phase F)** :
- Le hub créateur (`ms-hub.vercel.app`, auth-protégé après 4b) devient le point d'entrée unique.
- Une future route `/hub/dashboard` agrégerait les KPIs de tous les tenants auxquels le créateur a accès (ou tous si root).
- Les dashboards per-tenant restent disponibles via les sous-sites (pas de breaking change).

**Volontairement hors scope de Phase 4b** : 4b se concentre sur `login + header session + logout` côté hub. L'absorption dashboard est une feature distincte qui :
- dépend du scope "KPIs hub" (Phase E-bis ou Phase G selon priorités)
- nécessite un design produit (quels KPIs agréger, comment afficher N tenants)
- réutilisera l'infrastructure auth de 4a (déjà prête)

**Priorité** : P2, à trancher après retours Matthieu sur le flow 4b en prod.

---

## Bruit cross_podcast_ref — patterns à filtrer en lecture hub

Les URLs suivantes sont classées `cross_podcast_ref` par `engine/scraping/rss/extractors.ts` mais n'ont pas de valeur éditoriale pour le hub `/api/universe` :

- **`audiomeans.fr/politique-de-confidentialite`** — footer RSS injecté automatiquement par Audiomeans dans tous les flux de ses clients (pas une référence cross-podcast éditoriale).
  Volumes observés post-sync v3 : **LP 505, GDIY 537, PP 156, CCG 65** (LM exempt car non-Audiomeans).

- **Spotify show root** (`open.spotify.com/show/<id>` sans épisode spécifique) et **Apple Podcasts show root** (`apple.com/*/podcast/<slug>/id<id>` sans `?i=<episode>`) : auto-promo du podcast courant (lien vers la page show), pas une ref cross.
  Volume observé Spotify show LP : **339 rows**.

### Filtre SQL à appliquer dans `/api/universe` (Phase C)

```sql
WHERE link_type = 'cross_podcast_ref'
  AND url NOT LIKE '%audiomeans.fr/politique%'
  AND url !~ '(spotify\.com/show/[^/]+|apple\.com/.*/podcast/[^/]+/id[0-9]+)$'
```

Ce filtre est la spec canonique pour les lectures hub. Pas de blackbox : tout lien classé `cross_podcast_ref` doit être testable contre ces 2 patterns avant affichage côté hub.

### Signal hub-utile [3b] par tenant (post-sync 24/04/26)

Métrique produit mesurée après `scripts/sync-rss-links-to-episode-links.ts --write` + filtre Phase C complet :

| Tenant | cross total | audiomeans | sans audiomeans | hub-utile [3b] |
|---|---|---|---|---|
| lamartingale | 840 | 309 | 531 | **2** |
| gdiy | 992 | 959 | 33 | **24** |
| lepanier | 845 | 506 | 339 | **16** |
| finscale | 4 | 0 | 4 | **3** |
| combiencagagne | 104 | 104 | 0 | **0** |
| passionpatrimoine | 195 | 195 | 0 | **0** |
| **Total** | **2 980** | **2 073** | **907** | **45** |

**Lecture** : sur 2 980 rows classées `cross_podcast_ref` globalement, seules **45 (1.5%)** sont éditorialement utiles pour le hub cross-podcast. Les 2 935 autres sont du bruit (Audiomeans footer 2 073 + Spotify/Apple show root ~862). Implication Phase C : le hub ne peut pas se contenter de `WHERE link_type='cross_podcast_ref'` — le filtre SQL documenté ci-dessus est impératif.

Le ratio LM (2 refs sur 840) vs GDIY (24 sur 992) vs LP (16 sur 845) suggère que les vraies refs éditoriales (mention d'un autre épisode du même univers dans le RSS description) sont rares et concentrées sur les 3 plus gros podcasts. À re-examiner en Phase D+ si Orso souhaite enrichir explicitement les refs cross dans les RSS descriptions.

### ✅ Divergence classifieurs `scrape-deep.ts` vs `rss/extractors.ts` — **FERMÉE Rail 1 (24/04/26)**

**Avant** : `rss/extractors.ts` hardcodait `/lamartingale\.io\/(?:episode|podcast)/` → `episode_ref` → biais sur 5 tenants non-LM. Le sync v3 protégeait contre ce biais via blacklist `episode_ref`.

**Résolution Rail 1 (Option D)** :
1. `rss/extractors.ts` accepte `websiteHost?` en paramètre ; dérivé de `cfg.website` via `websiteHostFromUrl()`. Propagé à travers `extractItem(it, websiteHost)` → `extractLinks(html, websiteHost)` → `classifyUrl(url, websiteHost)`.
2. Call sites : `ingest-rss.ts`, `scrape-rss.ts` (deux entry points d'ingestion) calculent `WEBSITE_HOST` au démarrage et le propagent.
3. Nouveau module `engine/classify/episode-ref-rules.ts` avec `isEpisodeRefCandidate(url, websiteHost)` appliquant 3 règles cumulées :
   - **R1** host match : hostname(url) === websiteHost
   - **R2** non-racine : path != '' && path != '/' (évite `lamartingale.io/`, `http://lepanier.io`)
   - **R3** pas de path utilitaire : exclusion universelle de `/contact`, `/about`, `/legal`, `/privacy`, `/newsletter`, `/press`, `/careers`, `/404`, `/search`, `/tag/*`, `/category/*`, `/author/*` (évite `orsomedia.io/contact`)

Les 3 règles sont exprimées avec des patterns universels — **pas de mapping per-tenant**, donc l'ajout d'un nouveau podcast Orso/MS ne requiert aucune config. Un path utilitaire manquant = 1 ligne à ajouter dans `UTILITY_PATH_PATTERNS`.

**Script de reclassif** : `scripts/reclassify-rss-links.ts` (syntaxe explicite --tenant/--tenants/--all/--write). Instrumentation R2/R3 + sample paths self-host.

**Résultats reclassif (post-Option D)** :

| Tenant | self-host URLs | match | exclu R2 racine | exclu R3 utilitaire | reclassifs (resource→episode_ref) |
|---|---|---|---|---|---|
| lamartingale | 897 | 623 | 274 | 0 | 623 |
| gdiy | 2 733 | 2 688 | 45 | 0 | 2 688 |
| lepanier | 787 | 711 | 76 | 0 | 711 |
| combiencagagne | 104 | 0 | 0 | **104 (/contact)** | 0 |
| finscale | — | — | — | — | 0 (idempotent) |
| passionpatrimoine | — | — | — | — | 0 (idempotent) |

Total : **4 022 liens reclassifiés** en JSONB, puis **2 670 UPDATE** relayés vers `episode_links` via re-sync avec `episode_ref` retiré de `BLACKLIST_DOWNGRADE` (gardé : `tool`, `social`).

Tests : `engine/__tests__/episode-ref-rules.test.ts` (66 tests : R2/R3 par path + ≥2 vrais positifs par tenant + rejets) + `engine/__tests__/rss-extractors.test.ts` (classifyUrl per-tenant + websiteHostFromUrl). **171/171 green**.

**Impact sync** : blacklist réduite à `['tool', 'social']`. Commit dans `scripts/sync-rss-links-to-episode-links.ts`.

### D2-bis — Observation CCG : 0 episode_ref self-host éditorial

Corollaire de la résolution D2 : CCG (combiencagagne) **n'a aucun lien interne vers ses propres épisodes dans les `rss_links`**. Les 104 URLs self-host (orsomedia.io) sont toutes `/contact` → exclues R3.

Deux hypothèses à distinguer :
1. **Comportement Audiomeans** : le feed CCG hébergé chez Audiomeans ne porte pas d'URLs éditoriales vers `orsomedia.io/podcast/combien-ca-gagne/<slug>` dans la description des items.
2. **Vide éditorial** : Orso n'ajoute pas de cross-refs internes dans la description Audiomeans côté CCG.

Cette dette est **bloquée tant que P0#1 n'est pas résolue** : sans scrape-deep actif sur CCG (`hasArticles:false`), impossible de vérifier si les liens internes sont dans le HTML des articles CCG. Quand scrape-deep tournera sur orsomedia.io/podcast/combien-ca-gagne/, on saura si le signal existe en HTML ou s'il est absent en amont.

Impact immédiat : `episode_ref` côté CCG = 0 sur episode_links post-reclass (hors orphelins historiques mentionnés ci-dessous).

### D2-ter — Orphelins `/contact` sur `episode_links` CCG (65 rows)

Post-write sync, `episode_links` CCG contient 65 rows `url=orsomedia.io/contact, link_type=episode_ref` qui ne correspondent à **aucune entrée courante** dans `rss_links` JSONB. Ce sont des résidus d'un sync antérieur (avant Option D) : lors du run qui les a ajoutées, `/contact` était classé `resource` ou autre ; le passage par episode_ref vient d'un autre chemin (historique, merge JSONB différent, ou scrape-deep hypothétique).

`sync-rss-links-to-episode-links.ts` est **INSERT/UPDATE only** (pas de DELETE) pour des raisons de sécurité (on ne veut pas perdre du signal en reclasif). Résultat : les orphelins persistent.

**À résoudre en Phase D+** (nouveau script `scripts/prune-orphan-episode-links.ts`, syntaxe explicite, dry-run obligatoire, 2-pass : identifier orphelins = `episode_links WHERE (episode_id, url) NOT IN (JSONB source)` puis DELETE après validation humaine).

### D3 — Classifieur commun (enabler Rail 1)

Le module `engine/classify/episode-ref-rules.ts` est le **premier pas** vers un classifieur unifié entre `scrape-deep.ts` et `rss/extractors.ts`.

**✅ Step 1 (c157bde, 25/04/26)** : extraction de la logique `tool` dans `engine/classify/tool-rules.ts` (fusion fintech + SaaS, `isToolDomain` + `isToolUrl`, 11 tests). Les 2 call sites (`scrape-deep.ts`, `rss/extractors.ts`) importent désormais du module commun → fin de la divergence pour `link_type='tool'`.

**Prochaine étape — non triviale** : porter aussi la logique `company` dans un `classify/company-rules.ts`. **Attention** : les 2 heuristiques actuelles sont fondamentalement divergentes :
- `scrape-deep.ts` : `host.split('.').length === 2 && TLD ∈ {fr,com,io}` (domaine court)
- `rss/extractors.ts` : `/^https?:\/\/[^/]+\/?$/` (URL racine sans path)

Ces heuristiques classent des ensembles **différents** de liens en `company`. Unifier nécessite audit d'impact sur `episode_links` (17k+ rows classifiés, risque de reclasification massive). À faire hors stand-by démo, avec dry-run + diff avant/après sur DB.

Ensuite exposer un `classifyUrl()` unifié (`tool | company | episode_ref | linkedin | resource`) consommé par les 2 call sites. Bénéfice final : test unitaire unique, fin complète de la "divergence classifieurs".

### D4 — Richesse `episode_ref` conditionnée par scrape-deep

Le nombre de `episode_ref` auto-détectés par tenant est **proportionnel au volume de contenu scrappé en profondeur** (articles, chapitres). Les podcasts dont `scraping.hasArticles: false` (LP, PP, CCG, parfois Finscale) n'ont que les liens du RSS description, qui sont plus rares et moins riches en cross-refs éditoriales.

État post-sync 24/04/26 après Rail 1 (Option D, reclassify + sync JSONB → episode_links) :

| Tenant | episode_ref self-host | hasArticles | Source principale |
|---|---|---|---|
| lamartingale | 4 426 | ✓ | RSS desc + article scrape-deep (chapitres + media_links) |
| gdiy | 2 707 | ✓ | RSS desc + article scrape-deep |
| lepanier | 787 | ✗ | RSS desc uniquement |
| finscale | 0 | ✓ | Ni RSS desc ni article (article-ingest bug open) |
| passionpatrimoine | 1 | ✗ | RSS desc uniquement |
| combiencagagne | 65 | ✗ | RSS desc uniquement (65 proviennent de `/contact` = R3 faux-positif historique, cf. D2-ter) |

**Implication produit** : tant que P0#1 "Deep scrape Orso" n'est pas résolu pour LP/PP/CCG/Finscale, le hub verra **un déséquilibre** entre LM/GDIY (riches en refs cross-podcast) et les 4 autres tenants. La Phase C (`/api/universe`) affiche déjà un fallback propre ("Agrégation en cours" + "Indexation en cours") pour les tenants sans contenu cross exploitable, mais la vraie résolution passe par scrape-deep généralisé (P0#1).

**Corollaire** : ajouter un nouveau tenant Orso/MS sans article scrape-deep donnera **systématiquement** un signal cross faible côté hub, indépendamment de la qualité du podcast. C'est un signal architectural, pas un bug.

### Audio / other drop — surveillance volumes

`sync-rss-links-to-episode-links.ts` drop :
- `link_type = 'audio'` (doublon avec `episodes.audio_url`)
- `link_type = 'other'` (non classifié = bruit résiduel)
- types inconnus (fallback défensif)

Volume dry-run v3 : **0 row** sur les 6 tenants. Si ce compteur monte >100 sur un tenant, suspecter un nouveau pattern URL non géré par `classifyUrl()` → investiguer.

### Flags qualité `tool` — scrape-deep non appliqué (post-sync 24/04/26)

Le `link_type = 'tool'` est une classification fine qui nécessite scrape-deep.ts (analyse contexte article). Tenants avec `hasArticles: false` ne reçoivent **pas** cette analyse → comptage `tool` très bas, révélateur de la dette P0#1.

| Tenant | tool count | hasArticles | Commentaire |
|---|---|---|---|
| lamartingale | 228 | true | ✓ scrape-deep actif |
| finscale | 337 | true | ✓ scrape-deep actif (meilleur score, thématique outils financiers) |
| gdiy | 28 | true | ⚠ bas — à investiguer (scrape-deep peut-être incomplet sur GDIY) |
| lepanier | 7 | false | ⚠ scrape-deep skipped |
| passionpatrimoine | 2 | false | ⚠ scrape-deep skipped |
| combiencagagne | 1 | false | ⚠ scrape-deep skipped |

Dette P0#1 "Deep scrape Orso — 0 articles sur 4 podcasts" (lepanier/passionpatrimoine/combiencagagne/finscale) a maintenant un **impact quantifié côté produit** : la classification fine `tool` n'émerge pas sans scrape-deep, privant le hub d'un signal outil/produit clé.

Finscale est une exception intéressante : `hasArticles: true` (scrape-deep actif) + thématique fintech → 337 tool (plus que LM). Montre que quand scrape-deep tourne, les résultats sont au rendez-vous.

À prioriser en Phase D+ : résoudre P0#1 pour LP/PP/CCG ; investiguer GDIY (hasArticles:true mais tool seulement 28).

### Règle ops : scripts qui modifient la BDD = syntaxe explicite obligatoire

**Principe** : tout script `scripts/*.ts` ou `engine/*.ts` qui fait INSERT/UPDATE/DELETE sur Postgres **doit imposer une syntaxe de scope explicite**. Appel nu = **exit 2** avec usage printé. Pas de mode implicite "tout ce qui reste" ou "défaut = tous les tenants".

Modes canoniques à supporter (copier `scripts/sync-rss-links-to-episode-links.ts` comme référence) :

```bash
--tenant <id>                              # un seul tenant
--tenants id1,id2,id3                      # liste explicite
--all [--exclude id1,id2]                  # tous, exclusions explicites
--write                                    # opt-in explicite pour muter
```

Validations obligatoires :
- **flags mutuellement exclusifs** : `--tenant`, `--tenants`, `--all` → exit 2 si 2+ combinés
- **`--exclude` sans `--all`** → exit 2 (pas de sens seul)
- **aucun flag scope** → exit 2 avec message listant les 3 modes
- **dry-run = défaut**, `--write` doit être opt-in explicite

Motivation : fuite V1 (deploy parasite 14× en 4j via `.vercel/project.json` implicite) + risque systémique sync-rss-links (v1 buggé skip-if-exists) montrent que les "modes implicites" transforment une petite erreur de commande en migration destructive. Cette règle ferme cette classe de bug.

Applicable aux futurs scripts : migrations schema (`engine/db/migrate-*.ts`), backfills (`scripts/denormalize-*.ts`, `scripts/fix-*.ts`), sync JSONB→tables, batches LLM coûteux.

---

## LinkedIn pollution résiduelle post-Phase 2 (25/04/26)

**Contexte** : Phase 2 LinkedIn write a appliqué **255 UPDATE** confiance haute (B1=168 label-match + B2-ok=86 slug-match avec token ≥4 + B3=1 host-as-guest Stefani LM) sur les 6 tenants Orso/MS, en transaction atomique COMMIT. Stefani LM corrigé `/in/gautier-delabrousse-mayoux/` → `/in/stefani/`. Re-audit 255/255 persistés. Idempotence vérifiée (ré-exécution = 0 nouveau UPDATE).

**Stratégie SAFE UPDATE-only** : 216 NULLIFY préservés (linkedin_url existant maintenu, jamais effacé) + 139 CONFLICT basculés en arbitrage humain. Voir CSV source : `docs/_linkedin-changes-affined.csv`.

4 catégories de pollution résiduelle restent à régler **post-démo** :

### A. CONFLICT à arbitrer humainement — 139 guests (P2)
- **Volume** : GDIY 77 + LP 62, tous en `rule=order-fallback` (aucun label-match ni slug-match confiant trouvé sur l'épisode source).
- **Source** : `docs/_linkedin-changes-affined.csv` ligne par ligne `category=CONFLICT-B4`.
- **Workflow** : review humain ligne par ligne :
  - soit UPDATE manuel via SQL si match évident à la lecture (titre + LinkedIn host),
  - soit NULLIFY si aucun match clair,
  - soit re-scraping ciblé si la victime dépasse 3-4 guests sur un même host parasite.

### B. LP pollution résiduelle laurentkretz — ~62 guests (P2)
- **Volume initial** : 73 victimes pré-Phase 2 portant `/in/laurentkretz/` (host Le Panier) faute d'alternative.
- **Status post-Phase 2** : 2 corrigés via UPDATE-B2 (slug-match), 9 préservés en NULLIFY (UPDATE-only safe), **62 restent en CONFLICT-B4** avec un order-fallback douteux.
- **Solution** : re-scraping LP avec extracteur amélioré qui priorise label-match au scrape (avant denorm), ou nullification massive et acceptation perte temporaire.

### C. GDIY pollution résiduelle morganprudhomme — ~20 guests (P2)
- **Volume initial** : 47 victimes pré-Phase 2 portant `/in/morganprudhomme/`.
- **Status post-Phase 2** : 27 corrigés via UPDATE-B1/B2, **20 restent en CONFLICT-B4**.
- **Solution** : idem LP — re-scraping ou nullification.

### D. Gap structurel `guest_episodes` LM — 195/222 guests orphelins (P1)
- **Volume** : sur 222 guests LM avec `linkedin_url IS NOT NULL`, **195 (88%) ont ZÉRO entrée dans `guest_episodes`**. Confirmé par stat directe post-Phase 2.
- **Symptôme** : `guests.linkedin_url` valide (slugs matchent les noms) mais `guest_episodes` orphelin → guests invisibles côté matching cross-tenant, dashboard, et search.
- **Hypothèse cause** : pipeline historique scrape-deep ou seed initial qui écrivait `guests.linkedin_url` directement **sans** passer par `populate-guests` (seul script qui insère `guest_episodes` aujourd'hui).
- **Investigation post-démo** :
  1. Origine exacte (`migrate-json` / `migrate-enriched` / autre script disparu ?)
  2. Re-population `guest_episodes` LM via re-run `populate-guests` après vérif que l'INSERT respecte les FK composites (cf. Phase 1.5)
  3. Garantir que toute prochaine ré-ingestion ne wipe pas ces 195 `linkedin_url` valides

**Priorité globale** : tous P2 sauf gap structurel #D qui est P1 (dette structurelle qui bloque le matching cross-tenant). Aucun n'est bloquant pour la démo (Stefani LM corrigé, top guests B1/B2 enrichis sur les 6 tenants).

---

## ✅ Phase 7b audit timestamps L2 — RÉSOLU Phase 8 (28/04/26)

**Statut** : **RÉSOLU**. Audit final pack v3-final = **35/35 OK (100%)** — 19/19 L1 préservés + 16/16 L2 corrigés (vs 4/19 pré-fix). 0 hors-borne. Pack envoyable à Stefani.

**Tag** : `phase-8-extractquotes-fix` sur master (merge `fix/extractquotes-timestamps`).
**Commit fix code** : `b335b34` (Phase 8.2).
**Pack final** : [`experiments/autonomy-session-2026-04-28/pack-pilote-stefani-orso-v3-final/`](../experiments/autonomy-session-2026-04-28/pack-pilote-stefani-orso-v3-final/).
**Audit archive** : [`experiments/autonomy-session-2026-04-28/audit-timestamps-v3-final-2026-04-28.txt`](../experiments/autonomy-session-2026-04-28/audit-timestamps-v3-final-2026-04-28.txt).

**Fix appliqué Phase 8.2** (commit `b335b34`) :
- `extractQuotes` refactoré : le LLM ne reçoit plus `full_text` plat mais un bloc `[N] text` (segments indexés sans timestamps). Sonnet retourne `segment_index_start`/`segment_index_end` (sélection d'index) au lieu de `start_seconds`/`end_seconds` (calcul halluciné).
- Validation 3 couches post-extraction : bornes / fenêtre prompt (anti-hallucination index) / verbatim trouvable dans fenêtre ±10s.
- Pipeline résout `segment_index → timestamps Whisper réels` côté serveur. Output public inchangé (backward-compat Phase 6/7a).
- **Bonus** : passage `PROMPT_TRANSCRIPT_CHAR_LIMIT` 50 000 → 250 000 chars résout aussi un bug pré-existant de truncation massive (Plais GDIY perdait 76% du transcript = 188 min réduites à 24 min vues par le LLM, Boissenot/Doolaeghe ~30%). **Voir entrée séparée "Truncation prompt 50k chars (RÉSOLU Phase 8)"**.
- 660/660 tests verts (baseline 638 + 22 nets), 0 régression.

**Régénération Phase 8.3** : 4 épisodes pilote, $0.555 LLM total, 16/20 quotes valides (80% — Plais 3/5, Boissenot 5/5, Doolaeghe 4/5, Veyrat 4/5). 0 hors-borne. Les 4 quotes rejetées par les 3 couches de validation sont des hallucinations Sonnet (verbatim INTROUVABLE) ou paraphrase verbale, attrapées proprement.

**Pack final Phase 8.4** : produit via pipeline `produceClientPack` standard (pas de format ad-hoc, pas de warnings auto-éval ni footer dev — garde-fou test `output-formatters.test.ts` "L2 quotes rendered markdown contains NO dev metadata"). Audit final 35/35 = 100% intégrité timestamp.

---

## ✅ Truncation prompt extractQuotes 50k chars — RÉSOLU Phase 8 (28/04/26)

**Bug pré-existant** silencieux découvert pendant Phase 8.1 : `PROMPT_TRANSCRIPT_CHAR_LIMIT = 50_000` dans `engine/primitives/extractQuotes.ts` tronquait **massivement** les transcripts longs avant envoi à Sonnet :
- **Plais GDIY #266** (188 min) : 210k → 50k chars = **76% du transcript perdu**, le LLM ne voyait que les 24 premières minutes.
- **Boissenot LM #174** (67 min) : 70k → 50k = **29% perdu**.
- **Doolaeghe LP #128** (76 min) : 79k → 50k = **37% perdu**.
- Veyrat (31 min) : 35k → 50k = pas de truncation.

**Symptôme observé** : impossibilité structurelle d'extraire des quotes de la 2e moitié des épisodes longs. Probablement contributeur au cluster début Plais (1/5 OK pré-fix).

**Résolution** : passage à `PROMPT_TRANSCRIPT_CHAR_LIMIT = 250_000` (commit `b335b34`). Couvre intégralement les 4 épisodes pilote (max Plais 233k). Coût input single-call Plais Sonnet 4.6 = $0.275 — bien sous le cap budget Phase 8.

---

## Biais primauté long-contexte Sonnet 4.6 sur épisodes >180min (NEW P2, 28/04/26)

**Constat** : Phase 8.3, audit pack pilote V3, Plais GDIY #266 (188 min). Sonnet retourne 5 raw quotes mais 2 sont des hallucinations (verbatim INTROUVABLE) attrapées par le verbatim guard → 3/5 quotes valides. Les 3 timestamps valides : 25:38, 64:35, 73:55 — **toutes dans la première heure** (94 min). Aucune quote entre 74min et 188min. `temporal_spread = 0.111` < seuil clustering 0.20 défini Phase 8.

**Cause probable** : biais primauté connu des LLM sur long contexte. Sonnet "voit" 3h05 mais préfère sélectionner dans le début du transcript. Pas un bug `extractQuotes` (le fix passe l'audit 100% sur les 16 quotes valides livrées) — c'est une limite du modèle sur très long contexte.

**Décision Phase 8** : ACCEPT 3/5 sur Plais, livré tel quel. Posture Polish (mieux 3 solides que 5 dont 2 fausses). Pack v3-final 16/20 = 80% intégrité, 0 hors-borne.

**À traiter V2 SEULEMENT si signal Stefani** : si Stefani note "pourquoi seulement 3 quotes Plais ?" ou "pourquoi rien après 1h ?", follow-up commit chunking conditionnel (split Plais en 2-3 fenêtres temporelles, top-N final). Branchement Option C écartée Phase 8.2 — la complexité chunking était précisément ce qu'on a refusé pour la qualité du fix architectural. Réactivable post-démo si besoin réel.

**Trade-off connu** : Option A (single-call partout) accepté Phase 8.2 explicitement. Le clustering primauté Plais est l'effet de bord prévu, pas une régression.

---

**Constat** : audit déclenché pendant test bout-en-bout Phase 7b sur Veyrat (yt-dlp + ffmpeg + `produceClientPack`). Le test a planté côté `validateSpec` sur 2 quotes Veyrat dont les timestamps (`38:30`, `38:50`) dépassent la durée du transcript (1896s = 31:36). Audit étendu aux 4 épisodes pilote → **15/19 quotes L2 ont un timestamp erroné**.

**Chiffres** :
- L1 key moments : **19/19 OK (100%)**
- L2 quotes : **4/19 OK (21%)** — soit 79% de timestamps faux

**Typologie des erreurs** :
- **3 cas HORS_BORNE** : timestamp > durée transcript → hallucination directe (Veyrat L2#3 38:30, Veyrat L2#4 38:50, Doolaeghe L2#5 88:05 sur épisode de 75:46).
- **11 cas TS_FAUX** : la quote existe textuellement dans le transcript mais à un endroit complètement différent. Décalage observé 7 à 40 minutes. Pattern suggère un mismatch entre l'agent qui sélectionne la quote (Sonnet) et l'attribution du timestamp.
- **1 cas TEXTE_INTROUVABLE** : Boissenot L2#5 « Pokémon, c'est trois fois plus qu'Harry Potter... » — verbatim non confirmable.

**Validation manuelle (échantillon)** :
- Plais L2#2 annoncé `02:40` → en transcript = **pub Squarespace** ; le texte réel de la quote est à **09:44** (584s). Décalage 7 min.
- Doolaeghe L2#1 annoncé `69:40` → texte réel à **31:06** (1866s, et un teaser à 6s). Décalage 38 min.

**Implication business** : si Stefani vérifie 1 quote au hasard sur 4 épisodes, **probabilité ~80% de tomber sur un TS faux ou un hors-borne**. Crédibilité produit en jeu. Phase 6 review « PASS franchement 12/12 » n'a pas vérifié les timestamps — la review portait sur le contenu textuel uniquement.

**Cause racine probable** : bug dans l'agent `extractQuotes` (Phase 6) — l'agent récupère le bon verbatim mais associe un timestamp incorrect (peut-être pris au hasard, peut-être un index off-by-N, peut-être un reuse d'un autre passage). À investiguer.

**Plan de fix** (priorité absolue, avant Phase 7b vidéo) :
1. Audit du prompt + code de l'agent `extractQuotes`. Identifier d'où vient le timestamp dans le retour LLM.
2. Re-prompter avec contrainte forte : « le timestamp retourné DOIT correspondre à un segment du transcript dont le texte est ≤ 10s du verbatim choisi ».
3. Validation programmatique post-LLM : pour chaque quote, vérifier `transcript[ts ± 10s]` contient bien ≥6 mots consécutifs du verbatim. Reject sinon → re-roll ou drop.
4. Régénérer les 4 packs pilotes (4 × 5 quotes = 20 appels, ~$0-5 si Haiku).
5. Re-run audit script pour valider 100% intégrité avant envoi.

**Côté Phase 7b** : indépendamment du fix data, ajouter un skip out-of-bounds + warning dans [`engine/output/videoOrchestration.ts`](../engine/output/videoOrchestration.ts) pour ne plus jamais throw sur clip hors-borne (fail-safe Mode B2 vraiment respecté).

**Process** : ajouter une lens « verbatim timestamp alignment » dans le flow validation des packs (Phase 6 et au-delà).

**Audit script** : [`experiments/autonomy-session-2026-04-28/audit-timestamps.js`](../experiments/autonomy-session-2026-04-28/audit-timestamps.js) — réexécutable post-fix pour valider la régression.

**Détection** : 27/04/26, pendant Étape 4 Phase 7b. Sub-mission test e2e Veyrat → bug `validateSpec` → audit étendu.

**Owner** : Jérémy + agent Phase 8 à instancier.

---

## P0 — Bloquant ou à fort ROI immédiat

### 1. Deep scrape Orso — 0 articles sur 4 podcasts
- **Tenants concernés** : `lepanier`, `finscale`, `passionpatrimoine`, `combiencagagne`
- **État** : `hasArticles: false` dans leurs configs → aucun `article_content`, `article_html`, ni extraction liens classifiés via `scrape-deep`
- **Impact** : embeddings appauvris (~4x moins de signal vs LM), pas de `/api/links/stats`, `links` très limités, pas de biographie invités canoniques.
- **Action** : investiguer sources (site `lepanier.io`, `passionpatrimoine.com`, `orsomedia.io/podcast/combien-ca-gagne`, Finscale site absent). Définir sélecteurs par instance, passer `hasArticles: true`, relancer `cli ingest --podcast <id>` étape scrape-deep.

### 2. Quiz LM/GDIY encore en template (hors top 5 démo)
- **État** : `quiz_questions` LM=621, GDIY=979 générées via `generate-quiz.ts` (format template Q1 pilier / Q2 invité). Seuls ~5 épisodes démo ont eu un quiz LLM de qualité via `regenerate-quality-quiz.ts`.
- **Impact** : UX quiz médiocre sur 95% des épisodes LM/GDIY.
- **Action** : batch `regenerate-quality-quiz.ts` pour tous les eps LM + GDIY (~1300 eps × 5 questions = 6500 appels Haiku, coût ≈ $5). Étendre à LP/PP/CCG/Finscale.

### 3. CCG guests LinkedIn
- **État** : CCG a 64 guests (post P0), 19 LinkedIn renseignés (30%). Versus LM ~95%.
- **Impact** : profils invités CCG pauvres, sourcing des LinkedIn absent.
- **Action** : script `scripts/denormalize-linkedin.ts` PODCAST_ID=combiencagagne + backfill manuel pour les 45 restants (recherche LinkedIn par nom + domaine d'activité).

---

## P1 — Forte valeur, à planifier

### 4. Finscale 332/567 épisodes ingérés
- **État** : RSS feed Audiomeans expose 332 eps, mais 567 annoncés sur le site.
- **Hypothèses** : limite pagination Audiomeans, dedup sur `episode_number IS NULL`, feed secondaire non référencé.
- **Action** : curl `https://feeds.audiomeans.fr/feed/55e0559e-ee0f-44ea-9e0f-acb0a18ec478.xml?items=9999` pour confirmer la limite. Chercher feed secondaire. Investiguer `finscale.com/archive` pour complétion manuelle.

### 5. cross_podcast_ref = 0
- **État** : `episode_similarities` a 0 paires cross-tenant par design. `cross_podcast_guests` donne 59 guests cross-podcast, mais aucune référence explicite d'un épisode d'un podcast citant un épisode d'un autre.
- **Impact** : graph cross-univers incomplet, potentiel de navigation horizontale inexploité.
- **Action** : nouveau pipeline `cross-references.ts` qui cherche dans `episodes.rss_description` + `article_content` les mentions d'épisodes d'autres tenants (heuristique : nom de podcast + numéro/titre). Populate table `cross_podcast_refs (from_tenant, from_episode, to_tenant, to_episode, context)`.

### 6. Passion Patrimoine sous-volume
- **État** : 195/214 annoncés. Desync mineure (~9%).
- **Action** : idem Finscale — vérifier feed, items manquants via site.

---

## P2 — Améliorations qualité/UX

### 7. KV store pas encore créé
- **État** : `engine/cache.ts` utilise LRU mémoire (fallback), Vercel KV jamais branché.
- **Impact** : cache perdu à chaque cold start Vercel (~1s latence première requête post-idle).
- **Action** : créer KV sur Vercel, injecter `KV_REST_API_URL` + `KV_REST_API_TOKEN` dans env vars des 7 projets. Code déjà prêt, active automatiquement.

### 8. Classifications incomplètes (batch LLM fail)
- **État** : post-P0, certains eps restent `UNCLASSIFIED` :
  - CCG 6/65 (10%), PP 46/142 (33%), LP 35/376 (9%), Finscale 1 ep
- **Action** : rerun `classify-predefined --prune` avec prompt amélioré, ou classifier manuellement par episode_number pour petits volumes.

### 9. Divergence LM `episodes.guest_bio` (88) vs `guests.bio`
- **État** : bio denormalisée sur 88 eps LM, bio canonique sur ~288 guests. Probable duplication obsolète.
- **Action** : audit `SELECT count(DISTINCT e.id) FROM episodes e JOIN guests g ON ... WHERE e.guest_bio != g.bio` — confirmer, puis `UPDATE episodes SET guest_bio = NULL` et lire depuis `guests` en JOIN.

### 10. 17 LM eps sans slug · 68 GDIY eps sans article_url · 4 LM sans match RSS
- **État** : inchangé depuis M4.
- **Action** : re-crawler listing canonique `lamartingale.io?current_page=N` pour retrouver les slugs. `scripts/fix-empty-slugs-v2-lm.ts` existe mais partiel.

### ✅ 11. Filtres SQL noise hardcodés — **FERMÉE 2026-04-24**
- **Avant** : `engine/api.ts` (`/api/demo/summary`), `engine/db/cross-queries.ts` (getCrossStats) et `engine/cross/populate-guests.ts` hardcodaient `%matthieu stefani%`, `%amaury de tonqu%`, `%matthieustefani%`, `%matthieu-stefani%`, `%amaurydetonquedec%` dans leurs filtres SQL → bloquait l'ajout d'un nouveau podcast avec un autre host (le filtre ne suivait pas).
- **Résolution** : `deriveHostFilters(rawHosts)` exporté par `engine/db/cross-queries.ts` dérive 3 tableaux depuis `cfg.host` + `cfg.coHosts` de **toutes les configs chargées** :
  - `HOST_NAME_PATTERNS` (`['%matthieu stefani%', ...]`) → `NOT LIKE ALL(${HOST_NAME_PATTERNS}::text[])`
  - `HOST_LINKEDIN_SLUGS` (`['matthieustefani', 'matthieu-stefani', 'amaurydetonquedec', 'amaury-de-tonquedec']`) → `NOT ILIKE ALL(${...::text[]})`
  - `HOSTS_NORMALIZED` (existant) → `isHost()` helper
- **Ajout config** : `gdiy.config.ts` gagne `coHosts: ['Amaury de Tonquédec']` (préserve le comportement existant du filtre LinkedIn).
- **Tests** : `engine/__tests__/host-filters.test.ts` (6 cas) — dédup, accents, invalides, univers MS complet. **224/224 green**.
- **Impact opérationnel** : ajouter un nouveau podcast avec `host: "X Y"` + `coHosts: [...]` propage automatiquement les filtres — plus de modif SQL à prévoir.

---

## P3 — Moyen terme / nice-to-have

### 12. Le Gratin (C3) pas encore ajouté
- **État** : podcast non onboardé. Pitch à faire.
- **Action** : `cli init --name "Le Gratin" --id legratin --rss "..."` + `ingest`. ~15 min vu le workflow CLI.

### 13. Migration Next.js
- **État** : 4 frontends HTML statiques (v2.html, episode.html, hub.html, v2-dashboard.html) + API Vercel serverless.
- **Motivations possibles** : SSR pour SEO, App Router pour routing dynamique cleaner, auth NextAuth pour profils persistants.
- **Risques** : perte de l'architecture single-file config-driven très simple, build plus lourd, re-écriture vanilla JS → React.
- **Action** : décision architecture à prendre avant de se lancer. Pas urgent — l'actuel fonctionne et est maintenu.

### 14. Hub sans /dashboard
- **État** : hub.html agrège déjà cross-podcast, pas de frontend dashboard dédié au hub.
- **Action** : créer `frontend/hub-dashboard.html` avec KPIs univers (total eps, heures, guests cross, top pillars par tenant) + rewrite `/dashboard` dans `vercel-hub.json`.

### 15. Rename repo GitHub + custom domain
- **État** : repo = `jeremyH974/lamartingale`, ms-hub sur `.vercel.app`.
- **Action** : rename → `podcast-factory` + custom domain `univers-ms.io` (ou similaire) + certificats.

### 16. Auth + profil persistant cross-tenant
- **État** : aucun état utilisateur (quiz progress, favoris, historique). Tout est anonyme.
- **Action** : NextAuth + Postgres `users` + jointure cross-tenant `user_quiz_progress`. Pré-requis pour Le Gratin roadmap long-terme.

### 17. API `/api/demo/summary` instance-spécifique
- **État** : endpoint LM-only dans `engine/api.ts` pour la démo Stefani.
- **Action** : soit supprimer (démo passée), soit généraliser (`/api/demo/summary?n=N` pour toutes instances).

### 18. Similarité cross-tenant
- **État** : 0 paires dans `episode_similarities` cross-tenant (par design multi-tenant).
- **Décision à prendre** : est-ce pertinent d'avoir "épisodes similaires" qui traversent les podcasts ? Risque de bruit, mais valeur découverte cross-univers. Orthogonal à cross_podcast_refs (#5).

### 19b. Résolution cross-ref URL → épisode cible (Phase F ou post-F)

Les 213 refs cross-tenant Phase C sont affichées comme URLs brutes dans le hub. Pour un enrichissement visuel (titre épisode, cover art, date) côté hub ou côté sous-sites, il faudra résoudre chaque URL vers l'ID d'épisode du tenant cible.

Complexité identifiée dans le sample Rail 2 :
- GDIY a au moins 4 patterns URL historiques : `/podcast/<slug>/`, `/<slug>/`, `/<YYYY>/<MM>/<DD>/<N>-<slug>-...`, `/<cat>/<slug>/`.
- URLs legacy contenant des scories d'encoding (ex: `%E2%80%8A` hair space).
- Normalisation nécessaire avant lookup DB.

**Approche recommandée** : ajouter une table `cross_ref_resolution(url_normalized, tenant_dst, episode_id)` peuplée par un job batch, consultée par `/api/universe`. Évite un lookup per-request.

**Priorité** : P3, attendre que le hub enrichi affiche plus que l'URL brute (Phase F ou démo Orso).

### 19. CLI Factory `deploy --all` absent
- **État** : `cli/index.ts` n'a que `deploy --podcast <id>` (requiredOption). Pas de `--all` pour déployer les 7 tenants en une commande.
- **Impact** : pour re-déployer après un changement global (ex: fix dans `engine/api.ts`), il faut enchaîner 7 `npm run deploy:<tenant>` séquentiels.
- **Action** : ajouter `program.command('deploy').option('--all')` + boucle async sur `listPodcasts()` (`cli/index.ts`). Priorité P3 (confort dev, pas bloquant). Si ajouté, aussi exposer `"deploy:all"` dans `package.json` scripts.

## Scénario B post-pilote — items à statuer (P2)

Identifiés pendant la session refonte hub v2 (28/04 PM, branche `feat/hub-v2-scenario-b @ 79fb0fd`).

1. **Retirer `AUTH_BYPASS_PREVIEW` env Vercel + bypass middleware** (P1 quand pilote envoyé)
   - Code : `engine/auth/middleware.ts` lignes 41-48 (commentaire `Phase Scénario B M1 validation`)
   - Action : commit revert + `vercel env rm AUTH_BYPASS_PREVIEW preview --yes`
   - Bloquant si on garde la branche en attente sans la merger : le bypass est explicitement gated `process.env.AUTH_BYPASS_PREVIEW === 'true'`. Sans cette env var sur Production, aucun risque prod. Mais à retirer pour propreté code.

2. **Réévaluer carte 4 v3 selon stratégie produit Sillon globale**
   - Body actuel : "infrastructure éditoriale d un univers de marques", verticales presse/AV/talent
   - Bullet 2 dynamique : "{guests} invités briefés (vs {briefedGuests} aujourd hui)"
   - À reframer si stratégie produit Sillon évolue (ex : pivot multi-écosystèmes audio-only, ou pivot SaaS B2B agences éditoriales)

3. **Pipeline `runPack()` non implémenté** (P2 post-décision stratégique)
   - `engine/pipelines/runPack.ts` ligne 142 : `throw new Error('runPack: not implemented yet')`
   - Toute la production des 5 livrables (key-moments / quotes / cross-refs / newsletter / brief-annexe) passe par `experiments/.../phase6-runner.ts` script ad-hoc avec slugs hardcodés
   - Industrialisation : implémenter orchestrateur + persistance DB `editorial_events` (table créée mais 0 rows)
   - Effort estimé : 2-3 jours CC + ~$1 800 LLM full corpus 3 354 ép.

4. **13 briefs invités complémentaires** (P3 quick win)
   - 75 invités cross-podcast (>= 2 podcasts), 64 ont un brief, 11 manquent
   - Script existant `scripts/run-guest-brief.ts --guest-id <X> --write` pour chacun
   - Coût : ~$0.40 total

5. **999 épisodes sans embedding** (P2 cohérence audit)
   - Tenants concernés : iftd (706), demainvousappartient (98), onlacherien (82), allolamartingale (58), fleurons (6) + (gdiy 4 manquants, finscale 6 manquants, lamartingale 35 manquants, passionpatrimoine 3 manquants, combiencagagne 1 manquant) ≈ 999 total
   - Script : `PODCAST_ID=<id> npx tsx engine/ai/embeddings.ts`
   - Coût : ~$5 total
   - Active recherche sémantique cross-corpus complète (audit reco R4)

6. **Bug populate-cross-guests : Angélique de Lencquesaing tenant_appearances [8]→[314]** (RÉSOLU 28/04)
   - Fix manuel ciblé 1 row appliqué session M5.0 finalisation
   - Investigation racine populate-cross-guests recommandée (autres rows potentiellement buggées sur eps recents auto-ingerés vs tenant_appearances obsolète)
   - Audit léger à prévoir : `SELECT cpg.canonical_name, cpg.tenant_appearances FROM cross_podcast_guests cpg JOIN episodes e ON e.tenant_id = cpg.tenant_appearances->0->>'tenant_id' WHERE NOT (cpg.tenant_appearances->0->'episode_numbers' @> to_jsonb(e.episode_number))` — vérifie cohérence ep_number cpg vs episodes table.

7. **Recherche cross-podcast UI réelle dans hub** (P3 audit R1)
   - Endpoint `GET /api/cross/search?q=` existe et fonctionne
   - Hub n affiche pas de barre de saisie (seulement 3 démos passives M2)
   - Effort 3-4h CC, $0 LLM

8. **Chat conversationnel cross-podcast UI réelle dans hub** (P3 audit R2)
   - Endpoint `POST /api/cross/chat` existe et fonctionne (utilisé pour générer les 3 démos passives M2)
   - Hub n affiche pas de barre de saisie
   - Effort 4-6h CC, $0 LLM
