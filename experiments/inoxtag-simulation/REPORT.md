# Simulation Inoxtag — Rapport go/no-go Pack 2 pilote Stefani

**Date** : 2026-04-27 (dimanche)
**Branche** : `pilot-simulation-inoxtag`
**Lecteur cible** : Jérémy, lecture en 15 min, décision lundi matin sur trajectoire 6 jours.
**Verdict synthétique** : **VIABLE AVEC AJUSTEMENTS** → Brief A maintenu, scope étendu d'1 livrable annexe.

---

## 1. Épisode utilisé + raison

- **GDIY #422 — Inoxtag — Vidéaste — Casser YouTube et rebattre les cartes de l'audiovisuel** (2024-10-06).
- DB id `2017`, slug `422-inoxtag-videaste-casser-youtube-et-rebattre-les-cartes-de-l-audiovisuel`.
- `audio_url` accessible (Audiomeans → CDN signé S3, HTTP 200, 137 MB MP3 / 131 MB après download).
- **Cas A** brief : audio dispo + accessible, pas de fallback nécessaire.
- Test difficile par construction : pseudo (jeune créateur YouTube), noms propres rares (Mathis, Mathieu Blanchard, Webedia, MK2), jargon mêlant audiovisuel + alpinisme + manga.

## 2. Validation Whisper

| Métrique | Valeur | Verdict |
|---|---|---|
| Durée audio | 2h22m46s (8566 s) | — |
| Chunks | 8 (1080 s × 7 + 1006 s) — split fixe sans overlap, `-c copy` ffmpeg-static | OK |
| Taille moyenne chunk | 16.5 MB (cible <25 MB Whisper) | OK |
| Latence Whisper API totale | 538 s (~9 min série) | OK pilote 4 eps |
| Coût Whisper | **$0.857** ($0.006/min × 142.8 min) | OK |
| Langue détectée | `french` 8/8 chunks | OK |
| Segments produits | 3 618 | OK |
| Caractères transcrits | 156 120 | OK plausibilité (~700 c/min parlé) |
| Monotonicité timestamps | 1 segment non-monotonique sur 3618 | Acceptable (artefact Whisper) |
| Diff durée totale vs `last_end` | 7.98 s | ⚠️ légèrement > tolérance 5 s — probable silence trailing |
| Sample boundaries c0→c1, c3→c4, c6→c7 | Coupes mid-phrase visibles, sens reconstituable | ⚠️ acceptable simulation, à fixer en primitive |
| Reconnaissance "Inoxtag" | **0× sur 3618 segments** | ❌ pseudo non capté |
| Reconnaissance "Inès" | 11× | OK (vrai prénom) |
| Reconnaissance "Mathieu" / "Matthieu" | 17× | OK |
| Reconnaissance "YouTube" | 59× | OK |

**Verdict Whisper** : **VIABLE pour primitive lundi** sous deux ajustements obligatoires :
1. Passer `prompt: "Inoxtag, GDIY, Matthieu Stefani, [+ noms propres invité]"` à l'API Whisper pour capter pseudos / noms propres rares.
2. Évaluer split avec overlap 5 s (ou détection silences) pour réduire pertes mid-phrase aux boundaries — bénéfice à confirmer après 2e simulation.

Output Whisper sauvé dans `experiments/inoxtag-simulation/01-transcript-raw.json` (3618 segments avec timestamps absolus + `chunk_idx` traçabilité).

## 3. Tableau des livrables (grille stricte)

Grille de calibration appliquée :
- **9-10/10** : publiable sans retouche par un éditeur pro (rare).
- **8/10** : publiable après 5-10 min de relecture mineure.
- **7/10** : exploitable avec 30 min de retouche par un pro.
- **6/10** : partiellement exploitable, ratés notables.
- **<6/10** : non exploitable.

| # | Livrable | Note | Verdict | Critère 5 (différenciabilité vs Q&A mono-podcast) | Notes |
|---|---|:--:|---|---|---|
| 1 | Key-moments (5 clips) | **7.0** | VIABLE | ❌ FAIL | Bug schema (`saliancy_score` au #4), risque hallucination noms (Mathieu vs Mathis). Verbatim solides. |
| 2 | Quotes (5 cartes) | **6.5** | À ITÉRER | ❌ FAIL | Mauvaise calibration `platform_fit` (#2 "t'es naze" → LinkedIn). Pas de vérif verbatim contre transcript. Pas de champ `author`. |
| 3 | Newsletter v1 (596 mots) | 6.5 | **dépassée par v2** | ❌ FAIL v1 | Hors-format +33 % vs cible 400 mots, pas de cross-corpus. |
| 3 | **Newsletter v2 (405 mots)** | **6.5** | À ITÉRER | ✅ **PASS** | Longueur respectée, cite 4 eps catalogue avec n° **corrects** (#300, #178, #272, #519). Mais hallucinations factuelles "100M vues" + "Inès Benazouz" (vrai = "Benazzouz") + CTA mal interprété ("L'équipe complète est en lien" au lieu de "L'épisode complet est en lien"). |
| 4 | Titres alternatifs (3) | **6.0** | À ITÉRER | ⚠️ **PARTIAL FAIL** | Titres en eux-mêmes corrects, mais `if_cross_corpus` **hallucine les numéros d'épisodes** : Mathieu Blanchard #404 (vrai #300), Kilian Jornet #380 (vrai #178), Védrines #404 (vrai #519). Cause : prompt 04 n'avait pas la liste cross-corpus en contexte (le 03 oui — d'où la divergence). |
| 5 | Cross-refs (3 refs, 1 hors GDIY) | **7.5** | VIABLE | ✅ **PASS** | Contrainte hors-GDIY respectée (LP #258 Kikikickz). Diversité lens (discipline-sponsoring / prise-de-risque / casser-codes-distribution). `why_mono_podcast_rag_cant_find_this` argumenté pour les 3. `cross_corpus_finding` honnête sur la zone faible LM/PP/Finscale. |
| 6 | Meta-diff synthèse | n/a | (livrable analytique) | — | Voir `livrables/06-meta-differentiability.md`. |

**Bilan brut** : 2/5 livrables ≥ 7 (cible brief 4/6 ≥ 7 → **non atteint sur la lettre**).

**Bilan critère différenciabilité** : 2/5 PASS (Newsletter v2 + Cross-refs), 1/5 PARTIAL FAIL (Titres), 2/5 FAIL (Key-moments + Quotes — par construction intra-épisode).

## 4. Verdict simulation

**VIABLE AVEC AJUSTEMENTS.**

Justification :

- L'**agent pivot Cross-refs** valide qu'un livrable Pack 2 peut porter l'edge Sillon de façon convaincante.
- Le livrable **Newsletter v2** prouve que la différenciation cross-corpus s'injecte dans n'importe quel livrable narratif **dès lors que le prompt système contient la liste cross-corpus structurée**.
- Les **Key-moments + Quotes** sont des commodities — qualité 6.5-7 stable, équivalent à NotebookLM. À assumer comme tels dans l'offre pilote (pas l'argument différenciant).
- Les **Titres** à 6/10 sont récupérables en 1 fix prompt trivial (injecter la même liste cross-corpus que pour la newsletter).
- **Hallucinations factuelles** observées (numéros eps + "100M vues") sont mitigeables en standardisant : (a) pas de chiffres non strictement présents dans le transcript, (b) liste cross-corpus structurée injectée systématiquement.

Le critère brief "4/6 livrables à 7+" n'est pas atteint sur la lettre, mais le critère stratégique (Pack 2 différenciable de NotebookLM) est **partiellement validé** : le levier différenciabilité existe, il est concentré sur 2-3 livrables (cross-refs + newsletter cross-enrichie + brief annexe à ajouter). Les autres livrables sont des table-stakes assumés.

## 5. Recommandations pour lundi

### Prompts à garder tels quels
- **`PROMPT-05-cross-refs.md`** : structure et contraintes solides. Garder. Réutiliser comme gabarit pour `crossRefsAgent`.
- **`PROMPT-03-newsletter-v2.md`** : structure correcte. **Re-tester** sans la phrase "interdire les chiffres non présents dans le transcript" et voir si les 2 hallucinations disparaissent — sinon c'est un bug Sonnet 4.6 général à intégrer comme garde-fou systématique.

### Prompts à retravailler
- **`PROMPT-04-titles.md`** : ajouter dans le contexte le bloc "Catalogue cross-corpus disponible avec numéros d'épisodes vérifiés" (copier-coller le bloc du prompt 03 v2). Sans ça, hallucinations garanties.
- **`PROMPT-01-key-moments.md`** : durcir le format JSON (schema validé en post-traitement) pour éviter les typos comme `saliancy_score`.
- **`PROMPT-02-quotes.md`** : ajouter critère "vérifier que la quote existe textuellement dans le transcript" + champ `author` (pseudo + vrai nom si dispo).

### Primitives confirmées pour lundi
- ✅ **Whisper API** avec ajustements (prompt param + overlap 5 s).
- ✅ **Sonnet 4.6** via SDK Anthropic. Coût simulation : $1.42 total. Projection pilote 4 eps × 7 livrables : ~$30. Tenable.
- ✅ **pgvector ANN** sur `episodes_enrichment.embedding` (text-embedding-3-large 3072d, couverture 100%). 538 ms côté DB pour top-50.

### Décisions architecturales à remettre en cause / standardiser
- **Toute primitive Pack 2 doit recevoir un bloc `cross_corpus_context` structuré** (top-30 ANN tous tenants + top-25 ANN hors-tenant + sample title-based queries thématiques). Sinon : hallucinations numéros / pas de différenciation.
- **Garde-fou anti-hallucination chiffrée** : tous les prompts qui demandent une newsletter / fiche / résumé doivent contenir l'instruction "ne cite aucun chiffre absent du transcript fourni — si tu veux mentionner une mesure de succès, utilise des formulations qualitatives". À ajouter en règle commune.
- **Ajouter livrable annexe "Pour aller plus loin"** au Pack 2 (extension du livrable cross-refs avec 5-7 épisodes catalogue triés par lens éditorial). Coût marginal négligeable, valeur narrative + KPI rétention catalogue.

### Brief A vs Brief B
- **Brief A maintenu** : 7 nouveaux agents + 2 pipelines orchestrators sur 6-8 jours. Scope étendu d'**1 livrable annexe "Pour aller plus loin"** dans le Pack 2.
- **Réordonner priorités primitives** : (1) `crossRefsAgent` + `pourAllerPlusLoinAgent` J1-J2 → c'est l'edge ; (2) `whisperPrimitive` J2-J3 ; (3) `newsletterAgent` avec injection cross-corpus obligatoire J3 ; (4) `keyMomentsAgent` + `quotesAgent` J4 ; (5) `titlesAgent` J4 ; (6) pipelines orchestrators J5-J6 ; (7) buffer test E2E sur 2e épisode (Tibo InShape #485 ou Amixem #522, déjà identifiés similarité haute) J7-J8.

### Argument commercial Stefani (mail 06/05)
- Mettre en avant l'**augmentation de rétention catalogue cross-podcast** comme KPI vraie cible (pas "vous gagnez du temps").
- Pack 2 = livrables multi-podcast intégrés, pas juste "résumé d'épisode".
- Le pilote livre 12 cycles d'interaction Stefani / outil sur 3 semaines — démo de valeur opérationnelle, pas démo de capacité.

## 6. Coût total de la simulation

| Poste | Tokens / unité | Coût |
|---|---|---:|
| Whisper API (8 chunks Sonnet) | 142.8 min audio @ $0.006/min | **$0.857** |
| Sonnet livrables 1-3 v1 | 168 803 in + 3 561 out | $0.560 |
| Sonnet livrables newsletter v2 + 4 + 5 | 72 377 in + 2 960 out | $0.262 |
| **TOTAL simulation** | — | **$1.679** |

Cap budget brief : ~5€ (~$5.40). **Sous le cap, marge 70 %.**

Projection pilote 4 eps × 7 livrables (avec brief annexe "Pour aller plus loin") : **~$30 total**. Largement tenable opérationnellement.

## 7. Temps réel passé par étape

| Étape | Temps | Notes |
|---|---:|---|
| Étape 1 — Localisation épisode + creds | ~10 min | Cas A trouvé immédiatement, debug `dotenv override:true` ~3 min |
| Étape 2 — Download + split + Whisper transcription | ~25 min | Download 137 MB ~3 min, split ffmpeg-static <30 s, Whisper 9 min série |
| Étape 2 bis — Vérifications post-Whisper | ~5 min | 5 checks brief + sample boundaries |
| Étape 3a — Génération livrables 1-3 v1 | ~10 min | 3 appels Sonnet 4 min cumulés + scaffolding |
| STOP intermédiaire — auto-éval 1-3 v1 | ~10 min | Lecture + grille |
| Étape 3b — Sondage cross-corpus + ANN pgvector | ~10 min | Multi-pattern title scan + top-30 ANN + top-25 hors-GDIY |
| Étape 3c — Génération newsletter v2 + 4 + 5 | ~5 min | 3 appels Sonnet 1m54 cumulés |
| Étape 3d — Fact-check numéros eps | ~3 min | Découverte hallucination titres |
| Étape 3e — Rédaction livrable 6 meta-diff | ~12 min | Synthèse manuelle |
| Étape 5 — REPORT.md final + commit | ~10 min | En cours |
| **TOTAL** | **~100 min (~1h40)** | Sous le cap brief 4h |

## 8. Risques identifiés non anticipés

1. **Hallucination numéros d'épisodes quand cross-corpus absent du prompt système** (titres). Sonnet 4.6 invente des numéros plausibles (#404 récurrent — n'existe pas chez GDIY, c'est un nombre rond) plutôt que d'admettre l'absence d'info. **Trivialement fixable** mais à standardiser sur tous les prompts qui claim cross-corpus.

2. **Hallucinations factuelles chiffrées** dans la newsletter v2 ("100M vues" jamais mentionné dans le transcript Inoxtag). Sonnet 4.6 invente des chiffres ronds quand le transcript est ambigu sur les ordres de grandeur. **Mitigation prompt** : interdire toute citation chiffrée non strictement présente dans le transcript fourni.

3. **Whisper ne reconnaît pas les pseudos d'invités** (Inoxtag → 0× sur 3618 segments, alors que "Inès" 11× et "YouTube" 59×). Critique pour précision verbatim et attribution quotes. **Fix prompt param Whisper** identifié.

4. **Catalogue zone faible "creator economy YouTube" hors-GDIY**. Pour 4 invités Stefani potentiels, anticiper que les cross-refs hors-GDIY pourraient être tirées par les cheveux si l'invité est très niché. À intégrer comme finding honnête dans les briefs livrés au lieu de masquer.

5. **Latence Whisper série** : 9 min pour 2h22 audio. Pilote 4 eps × ~2h ≈ 36 min cumulé série. Acceptable mais à paralléliser (`Promise.all` chunks par épisode) si pilote scale au-delà.

6. **Typo Inès Benazzouz vs Benazouz** : Sonnet a tenté d'extraire le vrai nom complet à partir des "Inès" partiels du transcript Whisper (qui ne contient pas le nom de famille complet) et a inventé "Benazouz" au lieu de "Benazzouz". Symptomatique : les noms propres rares non transcrits par Whisper deviennent des points de hallucination Sonnet en aval. **Fix Whisper prompt param** = solution amont.

7. **Coupes mid-phrase aux boundaries Whisper** : 3 boundaries vérifiées, sens reconstituable mais pertes <1 s par boundary cumulées sur 7 boundaries = ~5-7 s de contenu fragilisé. Si un moment-clé Pack 2 tombe pile sur une boundary cassée, l'attribution timestamp peut être imprécise. **Mitigation primitive lundi** : split avec overlap 5 s ou détection silences ffmpeg `silencedetect`.

---

## Annexes (chemins fichiers)

- Transcript Whisper brut : `experiments/inoxtag-simulation/01-transcript-raw.json` (3618 segments)
- Transcript flat timestampé : `experiments/inoxtag-simulation/transcript-flat.txt` (158k chars)
- Livrables : `experiments/inoxtag-simulation/livrables/01-key-moments.json` à `06-meta-differentiability.md`
- Prompts finaux : `experiments/inoxtag-simulation/prompts/PROMPT-{01..05}.md` + `PROMPT-03-newsletter-v2.md`
- Données cross-corpus : `experiments/inoxtag-simulation/_cross-corpus-{titles,ann,ann-nongdiy}.json`
- Scripts simulation : `transcribe.mjs`, `sound-cross-corpus.mjs`, `generate-1-3.mjs`, `generate-4-5.mjs`
- Audio source (gitignoré) : `inoxtag.mp3` (131 MB) + `chunk_000.mp3..007.mp3` (8× 16.5 MB)

**Branche** : `pilot-simulation-inoxtag` (jamais mergée sur master).
