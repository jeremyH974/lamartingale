# Sillon Defensibility Roadmap

> **Document de référence stratégique sur 24 semaines.**
> Vivant et enrichissable. À mettre à jour à chaque clôture de sprint.
> Référence à citer dans tous les briefs CC (Sprint Mod, Beta 1, etc.).

| | |
|---|---|
| **Version** | 1.0 |
| **Date création** | 29 avril 2026 |
| **Dernière mise à jour** | 29 avril 2026 |
| **Auteur** | Jérémy + Claude (Anthropic) |
| **Audience** | Jérémy (référence stratégique) + CC (contexte d'exécution) |
| **Localisation** | `docs/strategy/sillon-defensibility-roadmap.md` |

---

## TL;DR (lecture 2 minutes)

**Le constat 2026** : l'ère de la "thin wrapper" startup AI est officiellement morte. Les VC n'investissent plus dans les startups qui ne sont qu'une UI au-dessus d'une API LLM. Sillon doit construire sa défensibilité **maintenant**, pas après les premiers contrats commerciaux.

**Les 4 risques majeurs identifiés** :
1. **Commodification** (haute) : un studio + Claude API + un dev = peut reproduire 70% de Sillon en 4-8 semaines
2. **Scraping autonome** (haute) : agents IA tiers reconstituant ton corpus sémantique
3. **Dépendance fournisseur** (moyenne-haute) : Anthropic/OpenAI augmentent les prix ou lancent un produit concurrent
4. **Régulatoire** (moyenne) : jurisprudence scraping et RGPD inférences IA évoluent

**Les 7 protections planifiées** :
1. Cross-corpus (V1 podcast + V2 cinéma + V3 talent) — **moat structurel**
2. Workflow studio profond — **switching cost**
3. Data flywheel signaux d'usage — **proprietary data**
4. Multi-provider LLM abstraction — **anti-vendor-lock-in**
5. Watermarking + détection comportementale — **anti-scraping**
6. CGU + clauses anti-IA-training — **protection légale**
7. Outcome-based pricing — **alignment incentives**

**Stratégie d'intégration** : pas de sprint dédié défensibilité. Intégration progressive dans Phase Alpha S2-S4 (fondations invisibles), Sprint Modularisation S5 (architecture défensive), Phase Beta 1 S6-S12 (15-20% de chaque sprint).

**Effort total** : +3-4 jours CC sur Sprint Mod + 6-8 jours CC répartis sur Beta 1 = ~10-12 jours CC supplémentaires sur 24 semaines.
**Coût LLM total** : +30-45$ supplémentaires (cap total 500€ inchangé).

---

## 1. Cadrage stratégique

### 1.1 Pourquoi ce document existe

Tu as pris cette session 4 décisions stratégiques majeures :
1. Sillon = plateforme cross-corpus (pas produit podcast B2B)
2. Verticales 2-3 = Cinéma + Talent management (via ami)
3. Sprint Modularisation 2-3 semaines entre S4 et Beta 1
4. Intégration de 7 protections de défensibilité progressives

Sans document de référence, ces décisions risquent de se diluer dans le rythme tactique. Ce roadmap est ta **boussole défensibilité** sur 24 semaines, vivante et enrichie à chaque jalon.

### 1.2 Principe d'intégration retenu

**Trois règles d'allocation** :

1. **Modularisation d'abord, défensibilité ensuite, optimisation enfin** : on ne renforce pas un composant qu'on n'a pas modularisé. Sinon double travail.

2. **Défensibilité = part fixe de chaque sprint Beta 1** : pas un sprint séparé qu'on traiterait "plus tard", mais ~15-20% de chaque sprint Beta 1 dédié à un moat priorisé selon l'urgence.

3. **Validation client avant fortification** : pas la peine de watermarker des briefs si personne ne les utilise. Phase Beta 1 valide la valeur produit, ensuite on protège ce qui est validé.

### 1.3 Sources et références

Cette analyse s'appuie sur :
- Anthropic Project Vend Phase 1 et 2 (avril-décembre 2025)
- Anthropic Project Deal (avril 2026)
- Reddit v. Anthropic (juin 2025) + Reddit v. Perplexity (janvier 2026)
- VC analysis 2026 sur la mort des thin wrappers AI startups
- 8 strategies for defensible AI moats (post-foundation model era)
- Audit interne Sillon du 29 avril 2026
- Documents stratégiques Sillon : analyse marché 28/04, plan amélioration 29/04

---

## 2. Les 4 risques majeurs détaillés

### 2.1 Risque 1 — Commodification (criticité HAUTE)

**Le risque** : un concurrent (studio, ESN, agence digitale) peut reproduire 70% de Sillon en 4-8 semaines avec Anthropic Claude API + OpenAI embeddings + un développeur compétent. Le code Sillon en lui-même n'est pas le moat.

**Ce qui rend Sillon vulnérable** :
- Stack technique standard (TypeScript, PostgreSQL, Vercel)
- Pas de propriété intellectuelle brevetable
- Logique métier reproductible

**Ce qui rend Sillon défendable (latent)** :
- Cross-corpus 3 verticales = aucun concurrent ne va investir dans 3 marchés en parallèle
- Workflow studio profond (à construire avec Stefani)
- Signal d'usage cumulé sur plusieurs clients (à construire avec data flywheel)

**Métriques de surveillance** :
- Veille hebdo annonces concurrents (voir §6)
- Conversations prospects où ils citent un concurrent direct

**Status au 29/04/2026** : risque latent, pas encore manifeste. Stefani est dans une logique exploratoire, pas comparative.

### 2.2 Risque 2 — Scraping autonome (criticité HAUTE)

**Le risque** : des agents IA tiers (équivalents 2026 des bots Perplexity ou Bright Data) reconstituent ton corpus sémantique en faisant tourner des milliers de requêtes sur `/api/cross/search` en se faisant passer pour des utilisateurs humains.

**Ce qui rend Sillon vulnérable** :
- API publiquement accessible (par design pour les démos prospects)
- Corpus enrichi (briefs IA) = actif de valeur supérieure à du simple texte
- Pas encore de détection comportementale

**Ce qui rend Sillon défendable (en place)** :
- Rate-limit Upstash 60 req/h IP, 200 req/h token trusted (T1.3 livré)
- Auth-gate token X-Sillon-Token (T1.3 livré)
- Pages /privacy + /legal mentionnent les CGU (T1.2 livré DRAFT)

**Ce qui doit encore être construit** :
- Watermarking briefs (canaris uniques par client/tenant)
- Détection comportementale (patterns non-humains au-delà du rate-limit IP)
- CGU explicitement anti-IA-training
- Clauses contractuelles B2B anti-redistribution

**Métriques de surveillance** :
- Taux d'erreurs 401/429 sur `/api/cross/search` (anormalement élevé = signal scraping)
- Origines IP suspectes dans logs Vercel
- Signalements clients ("j'ai vu un brief identique chez X")

**Status au 29/04/2026** : risque dormant, ne se manifestera qu'avec la visibilité commerciale. À fortifier avant Phase Beta 1 commercial.

### 2.3 Risque 3 — Dépendance fournisseur (criticité MOYENNE-HAUTE)

**Le risque** : Anthropic, OpenAI ou Google augmentent leurs prix API, modifient leurs Terms of Service, ou lancent un produit concurrent direct (par ex. "OpenAI Studio for Podcasters") qui rend Sillon redondant pour une partie des prospects.

**3 sous-risques distincts** :
- **3a** Hausse des prix API (sans préavis, sans pouvoir de négociation à ton volume)
- **3b** Lancement produit concurrent (Anthropic descend dans la chaîne de valeur)
- **3c** Modification TOS bloquante (par ex. interdiction d'utiliser Claude pour générer du contenu commercial)

**Ce qui rend Sillon vulnérable** :
- 100% de la génération de briefs sur Claude API
- 100% des embeddings sur OpenAI
- 100% de la transcription envisagée sur OpenAI Whisper
- Aucun fallback testé

**Ce qui rend Sillon défendable (latent)** :
- Architecture `AgentRegistry` (T2.2 livré) prête à l'abstraction multi-provider
- Pattern step-based déclaratif = changement de provider transparent

**Ce qui doit être construit** :
- `LLMProvider` abstraction (Sprint Mod S5)
- Test multi-provider sur briefs (Beta 1 S6)
- Veille proactive annonces fournisseurs (voir §6)

**Métriques de surveillance** :
- Coût LLM cumulé / mois (si augmente sans changement de volume = signal hausse)
- Annonces officielles trimestrielles Anthropic/OpenAI/Google
- Performance comparative briefs Claude vs Mistral vs Llama (test Beta 1)

**Status au 29/04/2026** : risque progressif. Architecture déjà préparée pour le mitiger.

### 2.4 Risque 4 — Régulatoire (criticité MOYENNE)

**Le risque** : la jurisprudence scraping (Reddit v. Anthropic, Reddit v. Perplexity, NYT v. OpenAI) et l'évolution RGPD sur les inférences IA cross-corpus modifient le cadre juridique sous Sillon en cours d'année.

**3 sous-risques** :
- **4a** Durcissement scraping côté ingestion Sillon (le pipeline scrape lui-même des sites pour enrichir les briefs)
- **4b** AI Act art. 50 et obligations transparence (échéance 2 août 2026, déjà couverte par T1.4)
- **4c** RGPD inférences IA cross-corpus qualifiées comme données sensibles dérivées (objet de la Consultation 2 avocat Partie B AIPD)

**Ce qui rend Sillon défendable (déjà en place)** :
- Privacy notice + mentions légales DRAFT (T1.2)
- Mention IA art. 50 sur 5 emplacements (T1.4)
- 4 documents avocat préparatoires complets
- 3 consultations avocat échelonnées (Mai, Juillet, Septembre 2026)

**Ce qui doit être construit** :
- Veille jurisprudence hebdo (voir §6)
- Mise à jour des CGU et privacy à chaque jurisprudence majeure
- Validation rétroactive avocat à chaque évolution

**Métriques de surveillance** :
- Décisions CJUE majeures
- Sanctions CNIL trimestrielles
- Délibérations AI Office UE
- Cas notables US (Reddit, NYT, autres)

**Status au 29/04/2026** : risque sous contrôle grâce au calendrier consultation avocat. À maintenir actif avec veille.

---

## 3. Les 7 protections planifiées

### 3.1 Cross-corpus (Verticales 1+2+3) — Moat structurel

**Description** : Sillon couvre 3 verticales (podcast, cinéma, talent management) avec une architecture commune. Aucun concurrent thin-wrapper ne va investir dans 3 marchés simultanément.

**Statut** : décision actée 29/04/2026. Verticale 1 podcast en cours.

**Calendrier** :
- V1 Podcast : Phase Alpha (avril-mai 2026)
- V2 Cinéma + V3 Talent : Beta 1 S10-S20 (juillet-septembre 2026)

**Construction** : voir §5 (Sprint Modularisation S5)

### 3.2 Workflow studio profond — Switching cost

**Description** : intégrer Sillon dans le cycle complet de production d'un podcast/film/talent (de la préparation interview à la réutilisation post-publication). Plus Sillon est intégré, plus le coût de switching est élevé.

**Statut** : à construire avec Stefani en Beta 1.

**Calendrier** : Beta 1 S6-S12 (mai-juin 2026)

### 3.3 Data flywheel signaux d'usage — Proprietary data

**Description** : chaque interaction client (recherche lancée, brief téléchargé, citation copiée) enrichit le moteur de recommandation cross-corpus. Un concurrent peut copier le code, pas tes 6-12 mois de signaux.

**Statut** : à construire en Beta 1 S6-S7.

**Calendrier** : Beta 1 S6-S7 (avril-mai 2026 selon démarrage Beta 1)

**Métriques cibles** : signal d'usage capturé sur 100% des interactions principales d'ici fin Beta 1 S7.

### 3.4 Multi-provider LLM abstraction — Anti-vendor-lock-in

**Description** : abstraction `LLMProvider` qui permet de switcher entre Anthropic, OpenAI, Mistral, Llama, ou self-hosted en runtime. Protège contre hausse prix et modification TOS.

**Statut** : architecture `AgentRegistry` en place (T2.2). Abstraction LLMProvider à construire en Sprint Mod S5.

**Calendrier** : Sprint Modularisation S5 (1-2 jours CC)

**Métriques cibles** :
- Briefs générés via au moins 2 providers en Beta 1
- Coût comparatif provider documenté

### 3.5 Watermarking + détection comportementale — Anti-scraping

**Description** :
- **Watermarking** : insérer dans chaque brief une phrase-canari unique par client/tenant. Si un brief identique apparaît ailleurs, preuve de scraping.
- **Détection comportementale** : identifier les patterns "non-humains" (vélocité, régularité, parcours atypique) au-delà du rate-limit IP.

**Statut** : infrastructure à construire en Sprint Mod S5, activation en Beta 1 S10-S11.

**Calendrier** :
- Sprint Mod S5 : infrastructure watermarking (1 jour CC)
- Beta 1 S10-S11 : activation watermarking + détection (3-5 jours CC)

**Métriques cibles** :
- 100% des briefs production watermarkés en Beta 1 S10
- Détection comportementale active sur `/api/cross/search` en Beta 1 S11

### 3.6 CGU + clauses anti-IA-training — Protection légale

**Description** :
- CGU explicitement interdisant l'utilisation des contenus Sillon pour entraîner ou affiner un modèle IA tiers
- Clauses contractuelles B2B anti-redistribution dans le DPA modèle
- Clause spécifique anti-IA-training dans tous les contrats clients

**Statut** : DRAFT privacy/legal en place (T1.2), DPA modèle à construire en Consultation 3.

**Calendrier** :
- Sprint Mod S5 : drafts CGU améliorés
- Consultation 3 (Septembre 2026) : validation DPA modèle + clauses anti-IA-training
- Beta 1 S12 : intégration dans tous les contrats

### 3.7 Outcome-based pricing — Alignment incentives

**Description** : pricing à l'épisode produit, au brief généré, à l'heure de prep économisée. Pas au seat (le seat-based encourage la sous-utilisation).

**Avantages** :
- Aligne tes revenus avec la valeur livrée
- Absorbe la volatilité des coûts API
- Crée une barrière contre les concurrents seat-based legacy

**Statut** : à concevoir et tester en Beta 1 S8-S9.

**Calendrier** : Beta 1 S8-S9 (mai-juin 2026)

**Métriques cibles** :
- Pricing outcome-based testé sur Stefani en Beta 1 S9
- Signal d'usage flywheel alimenté par ce pricing

---

## 4. Calendrier intégré sur 24 semaines

### Vue d'ensemble

```
Aujourd'hui   ────► Phase Alpha S2-S4 (3 sem)
                    Scope inchangé. Règles archi 1-7 = fondation invisible.
                                  │
+3 sem        ────► Brief Sprint Mod v1 rédigé (toi + moi, 1-2h)
                                  │
+3-5 sem      ────► Sprint Modularisation (2,5-3 sem)
                    ★ Modularisation core (cross-corpus ready)
                    ★ Multi-provider LLM abstraction
                    ★ CGU + watermarking infra
                    ★ Tests cross-tenant automatisés
                                  │
+5 sem        ────► GO/NO-GO Phase Beta 1
                                  │
+6 sem        ────► Beta 1 S6-S7 — Validation Stefani
                    ★ + Instrumentation signal d'usage (data flywheel)
                                  │
+8 sem        ────► Beta 1 S8-S9 — Pivot pricing
                    ★ + Pricing outcome-based testé
                                  │
+9-10 sem     ────► Consultation 3 avocat (Septembre 2026)
                    ★ + DPA modèle validé
                    ★ + Clauses anti-IA-training validées
                                  │
+10 sem       ────► Beta 1 S10-S11 — Activation watermarking
                    ★ + Onboarding ami cinéma + talent (V2-V3)
                    ★ + Détection comportementale active
                                  │
+12 sem       ────► Beta 1 S12 — Bilan + GO/NO-GO Phase Gamma
                    ★ + Audit sécurité final
                                  │
+24 sem       ────► Sillon défendable, validé multi-vertical
                    ★ Décision Phase Gamma (commercial massif)
```

### 4.1 Phase Alpha S2-S4 (semaines 0-3) — Fondations invisibles

**Statut** : EN COURS au 29/04/2026 (S1 clôturée, S2 démarre).

**Scope défensibilité** : aucun ajout. S2-S4 reste sur le scope brief Phase Alpha v2.

**Mais** : les règles architecturales 1-7 déjà passées à CC (notamment R4 modèle data générique, R5 abstraction sources, R7 patterns émergents) créent les fondations invisibles pour le Sprint Modularisation. Sans ces règles, le Sprint Mod aurait été 4-5 semaines au lieu de 2-3.

**Action toi** : à la clôture S4 (~3 semaines), on rédige ensemble le brief Sprint Modularisation v1 qui intègre les protections.

**Checkpoint** : clôture S4, validation que les règles 1-7 ont été respectées (revue patterns-emergents.md).

### 4.2 Sprint Modularisation S5 (semaines 3-5) — Architecture défensive

**Durée** : 2,5-3 semaines (étendue vs ma reco initiale 2 semaines)

**Découpage** :

| Bloc | Durée | Contenu | Cap LLM |
|---|---|---|---|
| **A — Modularisation core** | 7-9 jours | corpus-adapter abstraction + tenant onboarding kit + feature flags + tests cross-tenant | 0$ |
| **B — Multi-provider LLM** | 1-2 jours | Abstraction `LLMProvider` (Anthropic / OpenAI / extension future) | 5-10$ (tests) |
| **C — CGU + clauses anti-IA-training** | 0-1 jour CC | Mentions textuelles dans privacy/legal + drafts DPA modèle | 0$ |
| **D — Watermarking infra** | 1 jour | Mécanique de canari (génération token unique par client/tenant intégré dans briefs) — pas l'activation, juste l'infrastructure | 0$ |
| **E — Tests + doc** | 2-3 jours | Tests régressifs intégrés + doc patterns dans CLAUDE.md | 0$ |

**Total** : 11-15 jours CC, ~5-10$ LLM

**Ce qu'on NE fait PAS en S5** :
- Pas de détection comportementale anti-scraping (prématuré, pas de trafic réel)
- Pas de pricing outcome-based (besoin de signal client)
- Pas de signal d'usage flywheel (prématuré)

**Checkpoint Sprint Mod** :
- Tests cross-tenant verts
- Architecture corpus-adapter testée sur podcast (V1) avec capacité d'extension cinéma/talent
- LLMProvider abstraction testée avec 2 providers minimum
- Watermarking infrastructure prête (non activée)
- CGU draft enrichies prêtes pour Consultation 3

### 4.3 Brief Consultation 3 avocat (semaine 5)

**Timing** : à la clôture Sprint Mod, avant le démarrage Beta 1.

**Pourquoi à ce moment** : l'avocat a besoin de matière concrète à valider. Sprint Mod produit le multi-provider, le watermarking, les drafts CGU, l'architecture cross-corpus. Tout ça nourrit la Consultation 3.

**Sujets élargis vs Partie C avocat originale** :
- DPA modèle B2B (déjà prévu)
- Qualification AI Act fournisseur/déployeur (déjà prévu)
- Transferts US et TIA (déjà prévu)
- Multi-tenant (déjà prévu)
- **+ Clauses anti-IA-training** (NOUVEAU)
- **+ Watermarking et protection IP** (NOUVEAU)
- **+ Multi-provider LLM contractualisé** (NOUVEAU)
- **+ Cross-corpus contractualisé** (NOUVEAU)

**Action** : enrichir le document Partie C avocat (déjà rédigé) avec les 4 nouveaux sujets. Effort : 1h Claude.ai à la clôture Sprint Mod.

### 4.4 Phase Beta 1 S6-S7 (semaines 5-7) — Validation Stefani + signal d'usage

**Allocation 80/20** :
- 80% : démos, onboarding Stefani, retours utilisateur
- 20% : instrumentation signal d'usage (data flywheel)

**Livrables défensibilité** :
- Capture des interactions principales (recherche, brief consulté, brief téléchargé, citation copiée)
- Stockage en DB avec tenant_id (isolation préservée)
- Dashboard interne minimal (visualisation signaux par tenant/utilisateur)

**Effort** : 2-3 jours CC sur 2 semaines de Beta 1.

**Checkpoint** : signal d'usage capturé sur 100% des interactions principales d'ici fin S7.

### 4.5 Phase Beta 1 S8-S9 (semaines 7-9) — Pivot pricing

**Allocation 80/20** :
- 80% : itérations produit selon retours Stefani
- 20% : implémenter pricing outcome-based

**Livrables défensibilité** :
- Conception pricing outcome-based (par brief, par recherche, par minute prep économisée)
- Test sur Stefani en Beta 1 S9
- Comparatif avec pricing seat-based
- Documentation des incentives alignés

**Effort** : 2-3 jours CC sur 2 semaines.

**Checkpoint** : Stefani teste le pricing outcome-based, retour qualitatif documenté.

### 4.6 Phase Beta 1 S10-S11 (semaines 9-11) — Activation watermarking + V2-V3

**Allocation 80/20** :
- 80% : préparation et onboarding ami cinéma + talent (V2-V3)
- 20% : activation watermarking + détection comportementale

**Livrables défensibilité** :
- Watermarking actif sur 100% des briefs production
- Détection comportementale au-delà du rate-limit IP (vélocité, régularité, patterns)
- Dashboard alertes scraping
- Onboarding V2 (cinéma) et V3 (talent) — validation du `corpus-adapter`

**Effort** : 4-6 jours CC sur 2 semaines.

**Checkpoint** :
- Watermarking 100% des briefs
- Détection comportementale OK
- Onboarding V2 + V3 réussi (au moins 50 contenus indexés sur chaque verticale)

### 4.7 Phase Beta 1 S12 (semaines 11-12) — Bilan + audit sécurité

**Allocation 50/50** :
- 50% : bilan Beta 1 + GO/NO-GO Phase Gamma
- 50% : audit sécurité + durcissement final

**Livrables défensibilité** :
- Audit sécurité complet (endpoints, isolation tenant, secrets, dépendances)
- Durcissement des points faibles identifiés
- Rapport de défensibilité Sillon (pour décision Phase Gamma)
- Mise à jour de ce roadmap (rétrospective Beta 1)

**Effort** : 3-4 jours CC sur 1 semaine.

**Checkpoint** : Sillon prêt pour Phase Gamma commercial massif (ou pivot si NO-GO).

---

## 5. Métriques de défensibilité

### 5.1 KPIs à suivre par phase

| KPI | Sprint Mod S5 | Beta 1 S6-S9 | Beta 1 S10-S12 |
|---|---|---|---|
| Tests cross-tenant verts | 100% | 100% | 100% |
| Multi-provider testé | 2 providers | 2 providers | 3 providers |
| Signal d'usage capturé | N/A | 100% interactions | 100% interactions |
| Pricing outcome-based testé | N/A | 1 client | 2-3 clients |
| Watermarking actif | Infrastructure | 0% | 100% briefs |
| Détection comportementale | N/A | N/A | Active |
| Verticales V2-V3 onboardées | 0 | 0 | 1-2 |
| CGU + DPA validés avocat | Drafts | Drafts | Validés (Conso 3) |

### 5.2 Indicateurs avancés

À surveiller en continu pendant Beta 1 :

- **Taux d'erreurs 401/429** sur `/api/cross/search` (anormalement élevé = signal scraping)
- **Coût LLM cumulé / mois** (si augmente sans changement de volume = signal hausse provider)
- **Origines IP suspectes** dans logs Vercel
- **Signalements clients** ("j'ai vu un brief identique chez X")
- **Annonces concurrents** (veille hebdo)

---

## 6. Routine de veille hebdomadaire

### 6.1 Format

**Rituel** : tous les vendredis matin, 30 minutes café.

**Localisation des notes** : `docs/veille/YYYY-MM-DD.md` (versionné Git pour archivage)

**Template note** (5 lignes max) :

```markdown
# Veille [DATE]

## Signaux forts détectés (urgence haute)
- [Source] [Date] : [Description] → [Action]

## Signaux faibles détectés (à surveiller)
- [Source] [Date] : [Description]

## Annonces produits Anthropic/OpenAI/Google
- [Description courte]

## Jurisprudence et régulatoire
- [Description courte]

## Actions à prendre
- [ ] Action 1
- [ ] Action 2
```

### 6.2 Sources à scanner (5 sources minimum)

**Annonces produits IA** :
1. [Anthropic News](https://www.anthropic.com/news) — annonces Claude, recherche, partenariats
2. [OpenAI Blog](https://openai.com/blog) — annonces GPT, ChatGPT, API, partenariats
3. [Google AI Blog](https://blog.google/technology/ai/) — annonces Gemini, Workspace AI, etc.

**Régulatoire et jurisprudence** :
4. [CNIL](https://www.cnil.fr/fr) — délibérations, sanctions, fiches pratiques
5. [Bureau de l'IA UE](https://digital-strategy.ec.europa.eu/en/policies/ai-office) — Code de bonnes pratiques transparence IA

**Optionnel selon disponibilité** :
- [Mishcon de Reya GenAI tracker](https://www.mishcon.com/generative-ai-intellectual-property-cases-and-policy-tracker) — cas IP IA
- [Reuters Legal](https://www.reuters.com/legal/) — décisions US notables

### 6.3 Alerte vers Claude.ai

**Critères de signal fort** justifiant une alerte vers moi :
- Annonce produit qui menace directement Sillon (par ex. "OpenAI Studio for Podcasters")
- Jurisprudence majeure changeant le cadre scraping ou inférences IA
- Sanction CNIL pour cas similaire à Sillon
- Hausse de prix significative chez Anthropic ou OpenAI (>20%)

**Mode d'alerte** : tu créés un message dans Claude.ai en référence à ce roadmap, je calibre la réponse stratégique.

### 6.4 Archivage et rétrospective

**Tous les 3 mois** : revue rétrospective des notes de veille.
- Quels signaux forts ont conduit à des actions ?
- Quels signaux faibles sont devenus forts ?
- Quels signaux ai-je raté qui auraient dû être captés ?

Ajustement des sources si nécessaire.

---

## 7. Rétrospectives et évolution du roadmap

Cette section sera enrichie à chaque jalon majeur.

### 7.1 Rétrospective Sprint Modularisation S5

*À remplir à la clôture Sprint Mod (~+5 semaines).*

**Modèle** :
- Ce qui a marché
- Ce qui n'a pas marché
- Ajustements pour Beta 1
- Métriques réelles vs cibles
- Update des protections (1-7)

### 7.2 Rétrospective Beta 1 S6-S9 (validation + pricing)

*À remplir en Beta 1 S9.*

### 7.3 Rétrospective Beta 1 S10-S12 (activation + V2-V3)

*À remplir en Beta 1 S12.*

### 7.4 Rétrospective fin Beta 1 — Décision Phase Gamma

*À remplir en clôture Beta 1.*

**Critères GO Phase Gamma** :
- 3+ clients pilotes signés et payants
- Au moins 1 verticale 2 ou 3 validée commercialement
- Watermarking + détection 100% en place
- DPA modèle utilisé sur 100% des contrats
- Multi-provider LLM testé et opérationnel
- Pricing outcome-based validé sur 2+ clients
- Aucune fuite tenant détectée
- Cap LLM total respecté (500€ Phase Alpha + Beta 1)

---

## 8. Document associés et références

### 8.1 Documents Sillon stratégiques

- **Brief Phase Alpha v2** : `docs/sillon-brief-cc-phase-alpha-v2-2026-04-29.md`
- **Audit CC 29/04** : `docs/audit-2026-04-29.md`
- **Rapport S1 Phase Alpha** : memory CC `project_phase_alpha_s1.md`
- **Patterns émergents** : `docs/patterns-emergents.md`
- **Dette technique** : `docs/debt-tracking.md`
- **Analyse marché 28/04** : `sillon-analyse-marche-2026-04-28.docx`
- **Plan amélioration 29/04** : `sillon-plan-amelioration-2026-04-29.docx`

### 8.2 Documents avocat préparatoires

- Préambule commun : `sillon-avocat-0-preambule-2026-04-29.docx`
- Partie A — RGPD initial : `sillon-avocat-A-cadrage-rgpd-2026-04-29.docx`
- Partie B — AIPD : `sillon-avocat-B-aipd-2026-04-29.docx`
- Partie C — Multi-tenant + AI Act : `sillon-avocat-C-multitenant-2026-04-29.docx`

### 8.3 Documents RGPD interne

- Synthèse non-technique : `sillon-rgpd-synthese-2026-04-29.docx`
- Document complet : `sillon-rgpd-complet-2026-04-29.docx`
- Brief CC RGPD : `sillon-brief-cc-2026-04-29.docx`

### 8.4 Échéances réglementaires externes

| Échéance | Date | Action |
|---|---|---|
| AI Act art. 50 pleinement applicable | 2 août 2026 | Conformité déjà acquise via T1.4 |
| Code de bonnes pratiques transparence IA | Juin 2026 | Vérification rétroactive en Beta 1 S6 |
| Consultation 1 avocat (Partie A RGPD) | Mai 2026 | Dossier prêt |
| Consultation 2 avocat (Partie B AIPD) | Juillet 2026 | Dossier prêt |
| Consultation 3 avocat (Partie C + protections) | Septembre 2026 | Brief enrichi à clôture Sprint Mod |

---

## 9. Contacts et gouvernance

**Décideur stratégique** : Jérémy (fondateur)
**Conseil stratégique** : Claude.ai (sessions ponctuelles selon besoin)
**Exécution technique** : Claude Code (sessions hebdo selon brief en cours)
**Conseil juridique** : Avocat à sélectionner (Mai 2026, Consultation 1)

**Cadence de revue ce roadmap** :
- À chaque clôture de sprint (revue + ajout rétrospective)
- À chaque signal fort détecté en veille (mise à jour ad hoc)
- Tous les 3 mois minimum (revue complète des protections)

**Versionnement** :
- v1.0 — 29 avril 2026 — création initiale
- (futures versions à enrichir lors des rétrospectives)

---

*Fin du Sillon Defensibility Roadmap v1.0 — document vivant.*
