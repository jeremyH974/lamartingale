# Validation persona des 3 angles différenciants

> Simulation lecture critique adverse — 3 angles (Inoxtag 2026-04-27) × 3 personas Orso Media
> (Stefani / Christofer / Esther). 9 appels Sonnet 4.6, $0.275 total.
> Conduite le 2026-04-27 dans `experiments/persona-validation/` (sandbox, jamais commité).

## Résumé exécutif

**Aucun angle ne passe les 3 filtres en l'état.** Scores moyens 2.7 / 4.3 / 4.7 sur 10. Les
3 personas tirent dans le même sens : les angles présument une valeur (rétention,
fraîcheur, rareté thématique) sans la mesurer ; et tous trois citent des reproductions
plausibles avec NotebookLM + Castmagic + Google Sheet (réfutation directe de la
non-différenciabilité). **Angle 3 (brief annexe) est le moins faible** — Stefani lui
donne 6/10 et déclare le lire en entier + forwarder à Lucie — mais à condition de (a)
prouver l'effet rétention sur un épisode ancien / faible écoute, (b) traiter
"classification par lens éditorial" comme primitive technique documentée et non comme
"Notion bien organisé" (Esther), (c) re-cadrer l'argument côté production / due
diligence VC, pas côté auditeur (Stefani). **Reco lundi** : Angle 1 → REPORTER en P3,
Angle 2 → REPORTER en P2, Angle 3 → CONFIRMER mais reframer. Aucun signal de sycophantie
(scores ≤6, fortes objections). Aucune sortie de personnage détectée.

## Tableau récap par angle × persona

| Angle | Stefani | Christofer | Esther | Moyenne | Verdict |
|---|:-:|:-:|:-:|:-:|---|
| 1 — "Auditeur-aware" quote dedup *(naming abandonné, voir bucket 1)* | 2/10 | 3/10 | 3/10 | **2.7** | **FAIL** — reporter en P3 |
| 2 — Cross-pod thematic resonance score | 4/10 | 4/10 | 5/10 | **4.3** | **À ITÉRER** — reporter en P2 |
| 3 — Brief annexe "pour aller plus loin" | 6/10 | 4/10 | 4/10 | **4.7** | **CONFIRMER avec reframe** — extension cross-refs |

Lecture : un score ≥7 chez les 3 personas signifierait PASS différenciabilité. Aucun angle n'y arrive.

## Objections récurrentes (transversales aux personas)

### Angle 1 — "Auditeur-aware" quote dedup *(naming abandonné, voir bucket 1)*

| Objection | Stefani | Christofer | Esther |
|---|:-:|:-:|:-:|
| **Reproductible trivialement** ("CSV / 2h sur Cursor / NotebookLM + sheet de suivi éditorial") | – | – | ✅ |
| **"Cross-corpus" non démontré** : valeur reste GDIY + sortants Cosa Vostra | – | ✅ | ✅ |
| **Mauvais problème résolu** : c'est de la gestion de contenu, pas de l'intelligence catalogue | ✅ | ✅ | – |
| **Index `social_clips_published` est promesse, pas edge** | ✅ | ✅ | – |
| **Naming "auditeur-aware" trompeur** — la valeur est côté production | ✅ | – | – |

→ Verdict : **3/3 personas convergent sur "reproductible" + "intention différenciante non tenue"**. C'est le pire des 3 angles.

### Angle 2 — Cross-pod thematic resonance score

| Objection | Stefani | Christofer | Esther |
|---|:-:|:-:|:-:|
| **Score sans décision éditoriale derrière** ("qui décide qu'un thème à 47 occurrences est saturé ?") | ✅ | – | ✅ |
| **Classification `predefined` = talon d'Achille** (5/6 podcasts taggés sur quel schema, qui valide ?) | ✅ | – | ✅ |
| **Confusion rareté éditoriale ↔ valeur éditoriale** (un thème rare n'est pas forcément précieux) | ✅ | – | – |
| **Castmagic + Google Sheet manuel reproduit ~70%** | – | ✅ | ✅ |
| **KPI interne de production, pas valeur client articulable** | – | ✅ | – |
| **Ignore dimension vidéo** (axe d'évolution Orso 2026) | – | ✅ | – |

→ Verdict : **2/3 attaquent le "score sans décision derrière"** + **2/3 contestent la non-reproductibilité**. Angle techniquement défendable mais commercialement faible en l'état.

### Angle 3 — Brief annexe "pour aller plus loin"

| Objection | Stefani | Christofer | Esther |
|---|:-:|:-:|:-:|
| **Rétention catalogue = KPI non mesurée** (3/3) | ✅ | ✅ | ✅ |
| **Reproductible** (ChatGPT 10 min / NotebookLM + Google Sheet 2h / show notes manuelles) | ✅ | ✅ | ✅ |
| **Pensé pour Stefani/GDIY, ne scale pas à l'écosystème Orso** | – | ✅ | – |
| **Démonstration trop propre sur Inoxtag** — prouve qu'on a écouté, pas que ça scale 537 eps | ✅ | – | – |
| **"Classification par lens éditorial" = couche manuelle déguisée en IA** (sans schema scalable) | – | – | ✅ |

→ Verdict : **3/3 attaquent simultanément la KPI rétention non mesurée ET la reproductibilité**. C'est le double-bind central à résoudre lundi.

## Validation positive cohérente

| Angle | Élément qui résonne | Personas qui convergent |
|---|---|---|
| 1 | Intention de croiser catalogue entrant ↔ sorties publiées (potentiel pour préparation interview) | Stefani |
| 1 | Mesurer la fraîcheur des quotes = bon instinct éditorial (mais pas un produit) | Esther |
| 2 | Exploitation embeddings cross-tenant comme **barrière à l'entrée structurelle** | Christofer |
| 2 | Rareté thématique cross-corpus = **signal faible actionnable** (parallèle Magma) | Esther |
| 2 | Cas d'usage **due diligence invité pour sourcing VC Ovni Capital** | Stefani |
| 3 | **Classification par lens éditorial vs similarité brute = SEULE vraie idée différenciante** | **Stefani + Christofer + Esther (3/3)** |
| 3 | Cross-refs comme signal de rétention catalogue = bon angle business (parallèle Magma signaux faibles) | Esther |

→ **Convergence cross-personas la plus forte** : "lens éditorial" (Angle 3) chez les 3. C'est le noyau à conserver. Tout le reste est négociable / reframeable.

## Prédictions comportementales agrégées

| Persona | Angle 1 | Angle 2 | Angle 3 | Synthèse |
|---|---|---|---|---|
| **Stefani** | skim → réponse négative, pas de forward | skim → demande_infos, forward responsable éditorial Orso | **lit en entier → demande_infos, forward Lucie** | Engagement croissant 1→3. Angle 3 est le seul qui déclenche un forward intra-cercle proche (Lucie = sa femme). |
| **Christofer** | skim → demande_infos, pas de forward | skim → demande_infos, pas de forward | skim → demande_infos, pas de forward | Constance "skim + demande_infos + pas de forward". Refus systématique de relayer en interne sans preuve économique. |
| **Esther** | skim → demande_infos, pas de forward | skim → demande_infos, pas de forward | skim → demande_infos, pas de forward | Constance technique : aucun angle ne passe son filtre "schema documenté + scaling prouvé". |

→ **Implication stratégique** : les 3 angles déclenchent au mieux une demande d'infos, jamais une réponse positive d'emblée. Le pack pilote ne peut pas être livré sans preuve sur épisode tiers indépendant (recommandation Stefani : "épisode de 2021 que personne n'a écouté jusqu'au bout").

## Recommandations actionnables pour primitives lundi

1. **Angle 1 (Quote dedup) — REPORTER en P3** (post-pilote).
   - 3/3 personas considèrent l'angle reproductible en quelques heures.
   - Le naming "auditeur-aware" est en plus dommageable (Stefani : "valeur côté production").
   - Garder l'idée comme module interne de prep interview, pas comme livrable pilote.
   - Coût d'opportunité de le shipper lundi : 1 journée d'ingénierie sur un angle non-vendable.

2. **Angle 2 (Thematic resonance) — REPORTER en P2 + reframer.**
   - Renommer en "**rare topic detector**" ou "**editorial gap finder**" et le positionner comme un seul signal parmi d'autres dans l'agent cross-refs (pas un score isolé).
   - Reformuler la sortie : ne pas livrer le chiffre, livrer le **diagnostic éditorial** ("ce moment touche un thème déjà couvert 18× dans le catalogue, voici 3 angles narratifs alternatifs"). 2/3 personas attaquent "score sans décision derrière" — la décision doit être dans la sortie.
   - Pré-condition : auditer la classification predefined sur les 6 podcasts avant de la mettre en avant (Esther + Stefani).

3. **Angle 3 (Brief annexe) — CONFIRMER mais reframer en "lens éditorial agent".**
   - 3/3 personas convergent sur "classification par lens éditorial vs similarité brute" comme la seule vraie idée différenciante. **C'est ça le pivot, pas le brief annexe**.
   - Livrer comme primitive technique documentée : `lensClassificationAgent` avec un schema explicite (lens = string typed, scoring = embedding + tag), pas comme couche éditoriale manuelle (Esther).
   - Reframer l'argument commercial : pas "rétention catalogue" (KPI invendable car non mesurée par les 3) mais "**production augmentée pour la due diligence et le suivi cross-corpus**" (cas Stefani VC Ovni).
   - Préparer une démo sur **épisode ancien / faible écoute** (signal Stefani : "épisode 2021 que personne n'a écouté"). Ne pas refaire Inoxtag.

## Risques identifiés non anticipés (vs rapport simulation Inoxtag)

1. **Le naming `auditeur-aware` est un piège commercial** — Stefani interprète la valeur côté audience, mais elle est côté production. Le rapport simulation Inoxtag présentait l'angle comme auditeur-facing ; il faudra le renommer.

2. **La classification `predefined` cross-tenant est un talon d'Achille structurel** non identifié dans le rapport simulation. Esther et Stefani la pointent comme "qui décide ? sur quel schema ?" — pré-condition documentaire avant de pouvoir la pitcher comme moat technique.

3. **Christofer attend une mention systématique de l'écosystème Orso entier** (Solenne / Finscale, Carine / Passion Patrimoine, Laurent / Le Panier). Aucun des 3 angles ne l'inclut nativement. À corriger dans la primitive : tout livrable doit pouvoir scale au-delà de Stefani.

4. **L'absence de dimension vidéo dans les angles est un gap pour Christofer** — il pousse activement la transition vidéo en 2026. À mentionner dans la roadmap interne (même si pas dans Pack 2 v1).

5. **La rétention catalogue est invendable comme KPI sans mesure préalable** (3/3 personas). Soit on instrumente la mesure côté Orso (analytics ApplePodcasts/Spotify), soit on retire l'argument du pitch. Status quo (claim sans mesure) = perte de crédibilité.

6. **La preuve d'efficacité doit se faire sur épisode "perdu"** (Stefani : "épisode de 2021 avec fondateur que personne n'a écouté"), pas sur invité hype comme Inoxtag. La démo Inoxtag est trop propre, paraît cherry-picked.

7. **Aucun signal de sycophantie** — les 3 personas ont tous donné des scores ≤6/10 et 3 objections solides chacun. Calibration prompt OK. Pas de méta-commentaire ni sortie de personnage détectée. Persona Stefani très direct (registre "couloir" tenu), Christofer pragmatique business, Esther technique-précise. Cohérent avec leurs profils documentés.

## Annexe : citations en personnage (in_character_signal)

> **Stefani (Angle 1)** : "Vous me pitchez une feature de gestion de contenu déguisée en intelligence catalogue. Revenez avec le vrai problème — pas le symptôme. Et revenez quand la table existe."

> **Stefani (Angle 2)** : "Le score c'est bien, mais qui décide ? Moi ou votre classification predefined ? Montrez-moi un vrai exemple sur GDIY #500 et on parle. Sinon c'est Castmagic avec une couche de maths."

> **Stefani (Angle 3)** : "L'idée des lens c'est bien, mais me montrer Inoxtag c'est facile — montrez-moi que ça marche sur l'épisode de 2021 avec le fondateur que personne n'a écouté jusqu'au bout. Là je signe le pilote."

> **Christofer (Angle 1)** : "Le problème des doublons de clips, c'est un problème de luxe. Dis-moi comment ça s'applique à Finscale ou Le Panier, et là on a une conversation."

> **Christofer (Angle 2)** : "Le cross-pod resonance c'est bien si t'es éditeur d'un groupe. Mais si tu pitches ça à Stefani, il va te demander ce que ça change pour son prochain épisode. Et t'auras pas de réponse."

> **Christofer (Angle 3)** : "La rétention catalogue c'est une vraie KPI — mais une liste de recommandations sans mesure de conversion, c'est de l'éditorial déguisé en produit. Montre-moi le taux de clic réel ou on reste dans la promesse."

> **Esther (Angle 1)** : "L'index sortants c'est un CSV. Si ton edge c'est un CSV que je peux construire en 2h sur Cursor, t'as pas un produit — t'as une feature."

> **Esther (Angle 2)** : "L'idée de rareté thématique cross-corpus c'est exactement ce que je veux — mais montre-moi le schema de classification et un vrai output avant qu'on en parle à Matthieu."

> **Esther (Angle 3)** : "L'angle rétention catalogue je le signe, mais 'classification par lens éditorial' sans me montrer comment c'est généré à l'échelle c'est un Notion bien organisé, pas une infra."

→ Ces phrases sont utilisables (sous adaptation) pour calibrer le ton du mail v4 à Stefani, et pour la rédaction interne du brief Brief A lundi.

## Métriques de la simulation

| Métrique | Valeur |
|---|---:|
| Appels Sonnet 4.6 | 9 + 1 rerun |
| Tokens input total | ~25 600 |
| Tokens output total | ~13 200 |
| Coût total | **~$0.275** (cap $2 largement respecté) |
| Latence moyenne | ~29 s / appel |
| Parse errors | 1/9 (3-stefani tronqué à 1500 tokens, rejoué à 2500 → score 6) |
| Sycophantie détectée | **0** (tous scores ≤6, 3 objections solides chacun) |
| Sortie de personnage détectée | **0** (aucun "en tant qu'IA", pas de méta-commentaire) |

## Annexe technique

- Script : `run-validation.ts` (template prompt dans `_system-prompt.md`)
- Outputs bruts : `outputs/{angle_id}-{persona_slug}.json` (raw_text + parsed JSON)
- Modèle : `claude-sonnet-4-6` via `engine/ai/llm.ts::getLLM()`
- Temperature : 0.7 (volontaire pour encourager divergence inter-personas)
- maxOutputTokens : 1500 (rerun-3-stefani.ts à 2500 pour récupérer truncation)
- Pas de commit sur ce dossier — décision de Jérémy après lecture.
