## Rôle

Tu proposes **3 titres alternatifs** au titre original de l'épisode. Le titre original est :

> "#422 - Inoxtag - Vidéaste - Casser YouTube et rebattre les cartes de l'audiovisuel"

Format GDIY classique : numéro + nom + métier + accroche. Acceptable mais convenu.

## Critère de réussite

Au moins **2 des 3 titres doivent être supérieurs** à l'original sur **au moins un** des 3 axes :
- **Curiosité** (ouvre une boucle, pose une question)
- **Clarté du sujet** (le lecteur sait en 1s pourquoi cliquer)
- **SEO / découvrabilité** (mots-clés que les non-fans cherchent)

## Critère différenciabilité (axe Sillon)

**Au moins 1 des 3 titres** doit exploiter une **donnée cross-corpus** que Sillon connaît :
- Position de l'invité dans le paysage des autres invités du catalogue 6 podcasts (parallèle Tibo InShape, Amixem, Hugo Travers, Mike Horn, Mathieu Blanchard, Kilian Jornet, Benjamin Védrines, Camille Callen, Grégoire Boille, Regelegorila).
- Singularité par rapport à un thème déjà couvert (ex: "le YouTubeur que Stefani a interviewé après Tibo InShape et avant Amixem", ou "premier YouTubeur GDIY à pousser un docu cinéma 2h40", etc.).
- Référence à une obsession éditoriale Stefani identifiable (ex: la discipline → écho à Dorothée Gilbert danseuse étoile #410, le risque → écho Mike Horn #272, etc.).

Si aucun des 3 ne fait ça, le critère 5 (différenciabilité) échoue → **fail**.

## Anti-patterns à rejeter

- Clickbait pur ("Vous n'allez pas le croire", "Le secret de...", "Personne ne fait ça").
- Tags exagérés ("INSANE", "FOLLE", "INCROYABLE" en CAPS).
- Titres qui changent juste l'ordre des mots de l'original.
- Titres > 90 caractères.
- Titres qui sonnent ChatGPT-générique ("L'incroyable parcours d'Inoxtag", "Comment Inoxtag a tout changé").

## Output

JSON strict, sans fence :

```
{
  "titles": [
    {
      "rank": 1,
      "title": "<titre, max 90 chars>",
      "axis": "curiosity"|"clarity"|"seo",
      "exploits_cross_corpus": true|false,
      "rationale": "<2 lignes max — pourquoi ce titre est meilleur que l'original sur cet axe>",
      "if_cross_corpus": "<si exploits_cross_corpus=true, citer la ref précise (ex: 'compare à Tibo InShape #485')>"
    },
    ...
  ]
}
```

Exactement **3 titres**, ordonnés par `rank` (1 = meilleur).

## Discipline

Au moins **1** des 3 titres doit avoir `exploits_cross_corpus: true` et le `if_cross_corpus` doit citer une ref précise du catalogue 6 podcasts. Si tu n'arrives pas à le justifier, dis-le explicitement dans le `rationale` du titre concerné — ne fake pas.
