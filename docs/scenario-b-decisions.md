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
