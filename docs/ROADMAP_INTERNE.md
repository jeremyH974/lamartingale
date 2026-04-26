# Roadmap interne Sillon — document de référence

Ce document liste les verticales et features identifiées pour 
l'extension future de Sillon. Il sert de référentiel testable pour 
la règle anti-overgeneralization : toute abstraction architecturale 
doit être justifiée par un cas présent ET au moins un cas futur 
listé ici.

Posture stratégique : construire plateforme architecturale, 
commercialiser podcast uniquement pendant 12-18 mois. Aucune 
communication externe sur les autres verticales.

## Verticales identifiées

### Verticale active (présent)

- **Podcast** : 6 podcasts de l'écosystème Stefani+Orso+Cosa Vostra. 
  Pilote Stefani en cours. Extensions visées Q3 2026 vers Bababam, 
  Nouvelles Écoutes, Binge.

### Verticales identifiées en roadmap

- **Presse écrite et média numérique** : Les Échos, L'Express, 
  équivalents. Extension envisagée Q1-Q2 2027 selon traction podcast. 
  Source = articles structurés, pas d'audio. Implications : entités 
  de type 'organization' (publications), content_type='article', 
  positions chunk = paragraphes au lieu de timestamps.

- **Cinéma et audiovisuel** : studios de production, agences talent, 
  festivals. Extension envisagée 2027 selon opportunités. 
  Source = masterclasses, interviews, making-of. Implications : 
  entités multiples (acteurs, réalisateurs, scénaristes), 
  content_type='masterclass'/'interview', positions chunk = 
  timestamps mais aussi scènes/actes pour scénarios.

- **Management de talent** : agences artistes, sportifs, conférenciers. 
  Extension envisagée 2027 selon opportunités. Source = corpus 
  hybride (privé+public), entités centrales = personnes (artistes), 
  workflow = préparation négociations / dossiers presse.

## Features identifiées en roadmap

### P2 (post-pilote, Q3-Q4 2026)

- **Audio Overview cross-corpus** : génération d'audio podcast-style 
  entre 2 voix IA résumant un thème transverse aux 6 podcasts. 
  Implication architecture : output_format = 'audio' dans 
  DeliverablePack.

- **Couche visuelle podcast** : exploitation de la vidéo 
  (clips verticaux 9:16 pour Reels/Shorts, thumbnails YouTube, 
  détection de réactions faciales). Implication architecture : 
  primary_asset.type = 'video' dans Source, derived_assets pour 
  clips et thumbnails.

- **Sillon Daily** : briefing quotidien automatique par email sur 
  l'écosystème (mentions invités, signaux Ovni, contradictions 
  émergentes). Implication architecture : DeliverablePack avec 
  trigger temporel récurrent, pas seulement événementiel.

### P3 (long terme)

- **Mode interactif sur les briefs** : Q&A à chaud sur un brief 
  généré, type "approfondis sur X", "5 questions plus dures".

- **Multi-langue** : support EN/ES si client international. 
  Aucune extension envisagée à court terme (12 mois).

- **Streaming temps réel** : transcription live d'enregistrements 
  en cours. Aucune extension envisagée à court terme.

## Règle anti-overgeneralization

Toute abstraction architecturale est autorisée si et seulement si 
elle est imposée par AU MOINS UN cas présent (Pilote Stefani / 
Sillon Podcast actuel) ET reste utile pour AU MOINS UN cas futur 
listé dans ce document.

Les abstractions hypothétiques sans cas futur listé ici sont 
interdites.

Ce document est mis à jour à chaque extension de roadmap. Toute 
modification doit être validée explicitement.
