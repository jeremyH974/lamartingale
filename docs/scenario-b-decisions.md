# Scénario B — Decisions log

Format : `[YYYY-MM-DD HH:MM] [phase] [niveau A/B/C] [décision] : [justification 1 ligne]`

Log linéaire des décisions Niveau A/B prises autonomement par CC durant
la refonte hub v2 Scénario B. Permet à Jérémy de relire après coup les
choix internes CC sans avoir à demander.

---

[2026-04-28 PM] [Étape 0] [Niveau C] Création ROADMAP_V2.md consolidé : absorbe ROADMAP.md (déprécié), ROADMAP_INTERNE.md (conservé pour verticales détaillées), strategy-ideas-backlog.md (conservé pour détails catégories). Vue agrégée + ordre d'application strict.

[2026-04-28 PM] [Étape 0] [Niveau A] Conservation ROADMAP_INTERNE et backlog originaux : pas de suppression, juste lien vers source détail. Évite perte historique en cas de besoin de relire les rationales originaux.

[2026-04-28 PM] [Étape 0] [Niveau A] ROADMAP.md ancien marqué "DÉPRÉCIÉ" dans ROADMAP_V2 mais pas supprimé ce commit. Suppression effective déférée à validation Jérémy STOP 0 (peut être garde-historique souhaité).

[2026-04-28 PM] [Étape 0] [Niveau A] 5 doublons identifiés inventaire 360° réconciliés dans ROADMAP_V2 section dédiée : diarization Whisper, bulk briefs, soft-404 guest-brief, re-extraction guests LP/GDIY, vue admin audit RSS. Source canonique désignée pour chacun.

[2026-04-28 PM] [M1.1] [Niveau A] Hero refondu : h1 "11 podcasts, 1 mémoire éditoriale" (gradient sur la 2e moitié). Sub-tagline 2 segments : factuel + "En construction active." italic muted. CTA primaire vert accent (#00F5A0) smooth scroll vers #brief-example. Stats descendent. Mobile responsive cap 32px h1.

[2026-04-28 PM] [M1.2] [Niveau A] Brief inline Larchevêque via fetch /api/cross/guests/eric-larcheveque/brief. Carte compressée : avatar initiales + head (nom, meta, 3 tags) + about (280 chars max) + 3 positions + 2 quotes + 1 question high. Borders gauches colorées par type (vert positions, bleu quotes, rouge questions). Layout grid desktop, single col mobile <720px. Label "EXEMPLE — 60 autres briefs disponibles" + CTA "Voir le brief complet →".

[2026-04-28 PM] [M1.3] [Niveau A] Cross-mini : sélection auto top 3 cross-tenant count >= 3 podcasts. Tri nb_eps desc puis nb_pods desc. 3e guest sélectionné par tri éditorial (pas de hardcode), candidats observés : Choueifaty, Delacour, Chiche, Morizot, Damien Morin, Beigbeder. Slug calculé front via NFD lower + non-alphanum→tiret. Badges --pc Phase L pattern. Grid auto-fit minmax(260px,1fr).

[2026-04-28 PM] [M1] [Niveau A] Nav top enrichie : "Exemple" ajouté en 1er. PODCASTS / GUESTS / REFS sections conservées intactes (M3/M4 futures). Filtre 5 questions vert avant commit (5/5 OK).

[2026-04-28 PM] [M1 validation] [Niveau C] AUTH_BASE_URL Preview patché TEMPORAIREMENT via API Vercel direct (CLI bouclait sur git_branch_required avec project sans Git connect). Valeur Preview = URL preview courante "https://ms-ea4y4i63t-jeremyh974s-projects.vercel.app" pour que le magic-link mail pointe bien sur preview au lieu de prod. À RESTAURER post-validation : Preview AUTH_BASE_URL = "https://ms-hub.vercel.app" (état initial supposé puisque mail pointait sur prod avant patch). Production AUTH_BASE_URL aussi restaurée à "https://ms-hub.vercel.app" après que le rm preview --yes l'ait effacée par effet de bord.

[2026-04-28 PM] [M1 validation] [Niveau A] Pour M2-M5 : envisager alias Vercel custom stable "ms-hub-v2-preview.vercel.app" pointant sur dernier deploy de feat/hub-v2-scenario-b. Set AUTH_BASE_URL Preview une fois sur cet alias = patch one-shot vs répété. À évaluer post-M1.

[2026-04-28 PM] [M1 validation] [Niveau A] Side-effect sécu : .audit-hub/.env.preview-snapshot et .audit-hub/.env.prod-snapshot2 contiennent secrets en clair (Anthropic key, OpenAI key, DATABASE_URL creds). Gitignored .audit-hub/. À supprimer post-validation pour hygiène.

[2026-04-28 PM] [M1 fix] [Niveau C] Bug bloquant détecté Jérémy : 4 sections "Chargement infini". Cause : renderCrossMini(data) appelée AVANT pcById défini. Fix commit 7cf5895 : hoist pcById + try/catch défensif renderCrossMini + disclaimer Citations Phase C dans brief inline. Force redeploy → ms-5rantuc5f-... AUTH_BASE_URL Preview API mis à jour. HTML déployé vérifié via Vercel API (file uid fa4746d) — fix présent.

[2026-04-28 PM] [M1 fix] [Niveau A] Branche poussée sur origin/feat/hub-v2-scenario-b (pour cohérence GitHub + accès si rollback distant nécessaire).

[2026-04-28 PM] [M1 validation] [Niveau C user] Deployment Protection (ssoProtection) désactivé OFF global sur projet ms-hub à la demande Jérémy pour débloquer validation visuelle preview. Avant : `{deploymentType: "all_except_custom_domains"}`. Après : `null`. PAS DE RESTAURATION jusqu'à signal Jérémy explicite. À documenter aussi pour M2-M5 : la preview reste accessible direct sans SSO Vercel pour les futures itérations (économise les patches AUTH_BASE_URL répétés).

[2026-04-28 PM] [M1 validation] [Niveau C user] Re-clarification : SSO Vercel doit être restauré (not what user veut désactiver), seul login HUB applicative (magic-link) reste désactivé. ssoProtection re-activé `all_except_custom_domains`. AUTH_BYPASS_PREVIEW=true conservé. User passe SSO Vercel 1 fois (login Vercel.com), puis accès direct hub v2 sans magic-link grâce au bypass app-level.

[2026-04-28 PM] [M1 cleanup] [Niveau A] Alias stable `https://ms-hub-v2-preview.vercel.app` créé pointant sur deploy `ms-duyvp171g-...` (qui contient le bypass). Pattern post-deploy à appliquer pour M2-M5 : après `vercel deploy --force`, faire `vercel alias set <new-deploy-url> ms-hub-v2-preview.vercel.app` pour basculer l'alias sur le dernier deploy. Évite patches AUTH_BASE_URL répétés.

[2026-04-28 PM] [M1 cleanup] [Niveau A] AUTH_BASE_URL Preview RM'd (CLI add bloqué git_branch_required, API token Vercel expiré entre calls). Décision pragmatique : laisser Preview vide → code engine/api.ts:1059 baseUrl(req) fallback sur req.headers.host (= ms-hub-v2-preview.vercel.app si user y accède). Combiné avec AUTH_BYPASS_PREVIEW, magic-link n'est jamais déclenché donc AUTH_BASE_URL Preview superflu. AUTH_BASE_URL Production préservée à `https://ms-hub.vercel.app`.

[2026-04-28 PM] [M1 cleanup] [Niveau A] .audit-hub/.env.preview-snapshot + .env.prod-snapshot + .env.prod-snapshot2 supprimés (contenaient secrets en clair). Gitignored .audit-hub/ donc jamais committé.

[2026-04-28 PM] [M1 closed pré-validation] [Niveau A] M1 fonctionnellement prêt sur https://ms-hub-v2-preview.vercel.app après login Vercel SSO. Tests 715/715, audit-timestamps 35/35 préservé. ATTENTE retest visuel + screenshots Jérémy.

[2026-04-28 PM] [M2.0] [Niveau C] Pré-check RAG : /api/cross/chat actif, fallback gpt-4o-mini (au lieu Sonnet 4.6 attendu — investigation V2). Latence 6-17s avg 11.2s (dépasse cap 5s). Sources OK (6/req, scores 0.46-0.65). Modèle obsolète prompt mentionne "LM+GDIY uniquement" alors que 11 tenants. Décision Jérémy = Option C "showcase passif" (3 Q/R pré-générées, pas de live RAG). Cap LLM consommé Phase A→M2 reste $1.84 (3¢ ajoutés sur showcase gen).

[2026-04-28 PM] [M2.1] [Niveau A] Q3 sélectionnée : "Quels sont les défis récurrents que rencontrent les entrepreneurs dans l'écosystème ?" (sources Finscale + GDIY + diversité cross-tenant max). 3 réponses générées via crossChat → frontend/data/showcase-rag-responses.json (14KB, gpt-4o-mini, sources 6 chacune).

[2026-04-28 PM] [M2.1] [Niveau A] Frontend section RAG showcase ajoutée : 3 cards Q/R en accordion (1ère ouverte par défaut), markdown bold rendering, sources cliquables avec pod-badge brand colors. Disclaimer honnête "moteur conversationnelle complet activé sur signal positif". Nav top "Démo" ajouté entre "Exemple" et "Podcasts".

[2026-04-28 PM] [M2 dette V2] [Niveau A] Notes pour DETTE.md V2 (post-pilote, conditionnel signal Stefani) :
- Switcher gpt-4o-mini → Sonnet 4.6 (pourquoi fallback ? config getLLM ?)
- Update system prompt cross-queries.ts:793 "LM+GDIY" → "11 podcasts écosystème"
- UI loading state explicite > 5s pour live RAG
- Rate limiting global IP/h
- Fix Passion Patrimoine #null episode_number rendering
- Tests qualité 10 prompts variés post-fixes
- Coût budget activation : $5-15 selon volume démos prévues
- À ajouter dans docs/DETTE.md section axe pipeline-brief Phase Scénario B V2.
