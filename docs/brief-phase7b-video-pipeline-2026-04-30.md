# Brief Claude Code — Phase 7b : vidéo en entrée + clips MP4 en sortie

> Mission : ajouter au pipeline Sillon la capacité d'ingérer une vidéo (URL YouTube/Vimeo/autre via yt-dlp ou fichier local) et de produire des clips MP4 en sortie pour les key moments (L1) + micro-clips pour les quotes (L2)
> Branche : `feat/video-pipeline` (séparée de master, merge si PASS)
> Précédent : Phase 7a mergée master `c41d583` (formats pro docx + xlsx + V2-ready arch + 638 tests verts)

## CONTEXTE PHASE 7B

Phase 7a a livré les formats pro pour les livrables texte. Les xlsx L1/L2 contiennent déjà les colonnes "Lien vidéo" / "Lien micro-clip" préparées vides — Phase 7b les remplit.

L'objectif business : permettre à Stefani de recevoir des clips MP4 prêts à publier sur réseaux sociaux, pas juste des timestamps texte. Différenciateur Sillon vs concurrents qui ne font pas le découpage vidéo.

## SCOPE V1 (validé Jérémy après pushback)

### Sources d'entrée

- **YouTube** : URL https://youtube.com/watch?v=... → yt-dlp extrait audio + vidéo
- **Vimeo** : URL https://vimeo.com/... → yt-dlp natif
- **Fichier local** : .mp4, .mov, .mkv etc. déjà sur disque
- **Architecture V2-ready** : yt-dlp supporte 1000+ sites natifs. Ne PAS hardcoder "youtube/vimeo" dans la regex de validation. Toute URL extractible par yt-dlp doit fonctionner.

### Clips de sortie

- **L1 Key moments** : 1 clip MP4 par moment (4-5 par épisode), durée = `endTime - startTime` du moment, ratio source (16:9 typiquement YouTube)
- **L2 Quotes** : 1 micro-clip MP4 par quote (5 par épisode), durée = ~10-15s autour du timestamp de la quote (5s avant + 10s après par défaut)

### Format des clips

- **Codec** : H.264 (libx264)
- **Résolution** : ratio source (pas de cropping/resizing en V1)
- **Audio** : AAC stéréo
- **Container** : .mp4

### Subtitles

- **V1** : aucun subtitle incrusté
- **Architecture V2-ready** : enum `subtitleStyle: 'none' | 'simple' | 'dynamic'`, V1 n'implémente que 'none'

### Comportement si pas de vidéo source

- **Mode B2 validé** : si un épisode pilote n'a pas de vidéo accessible, le pack reste audio-only pour cet épisode. Marquer dans le pack que "vidéo non disponible".
- Pas de re-sélection des 4 épisodes pilote.

## ⚠️ FLAG TIMING — IMPORTANT À LIRE

Le brief est démarré le **30/04 à 19h15**. Phase 7b a un cap timing de **4 jours wall**. Démarrage en soirée n'est PAS optimal :

1. Phase 7b a des risques techniques nouveaux (yt-dlp auth, ffmpeg encoding, gestion fichiers volumineux). Si un blocker apparaît dans les 2 premières heures, intervention difficile à minuit.

2. Recommandation initiale Claude : faire l'Étape 1 (vérifications préalables + setup branche + Étape 2 vérification disponibilité vidéo des 4 épisodes pilote) ce soir, puis **STOP attente Jérémy** jusqu'au lendemain matin pour la suite.

3. Si Jérémy demande de continuer la mission complète ce soir, le faire mais signaler clairement les blockers dans le STOP intermédiaire si rencontrés.

**Discipline ce soir** : viser un STOP intermédiaire **après l'Étape 2 (vérification vidéos disponibles 4 épisodes pilote)** vers 21h-22h max. Reprise Phase 7b complète demain matin avec les info validées.

## CAPS NON-NÉGOCIABLES PHASE 7B

1. **Cap qualité** : aucune dégradation des livrables texte (Newsletter / Brief / Cross-refs / Key moments / Quotes texte). Phase 7b ajoute de la vidéo, ne touche pas le texte.

2. **Cap budget Phase 7b** : $0 LLM (pas d'appel Sonnet/Opus nécessaire — pure ingestion + traitement vidéo). Budget réservé exceptionnel : $0.50 pour cas d'erreur imprévu.

3. **Cap discipline anti-régression** : 638/638 tests Phase 7a maintenus + nouveaux tests Phase 7b.

4. **Cap timing** : 4 jours wall max. Si dépassement, STOP avec rapport blocker.

5. **Cap fail-safe** : branche `feat/video-pipeline`, master jamais touché tant que PASS confirmé.

6. **Cap stockage** : éviter de saturer le disque. Vidéos sources (~500 MB - 1 GB par épisode YouTube) à supprimer après extraction des clips. Garder uniquement les clips finaux (~5-10 MB chacun).

7. **Cap respect droits** : yt-dlp est un outil légal pour usage personnel/recherche. Cette mission est un test technique pour démo Stefani avec ses propres contenus. Si problème éthique/légal apparait, signaler.

## ARCHITECTURE V2-READY (préparation B+C)

### Décision V2 — outputFormats vidéo

Phase 7b ajoute le format `videoclip` au registry :

```typescript
// engine/output/formats/types.ts (extension)
type OutputFormat = 'markdown' | 'docx' | 'xlsx' | 'pdf' | 'videoclip';

// V2-ready : préparer 'composedVideo' pour newsletter en montage
// Phase V2 : type OutputFormat = ... | 'videoclip' | 'composedVideo';
```

### Décision V2 — clipFormats enum

```typescript
type ClipFormat = 'source' | 'portrait' | 'square';
// V1 implémente uniquement 'source'
// V2 prévoit 'portrait' (1080x1920) + 'square' (1080x1080) avec face tracking
```

### Décision V2 — subtitleStyle enum

```typescript
type SubtitleStyle = 'none' | 'simple' | 'dynamic';
// V1 implémente uniquement 'none'
// V2 prévoit 'simple' (SRT burn-in) + 'dynamic' (TikTok-style karaoke)
```

## SPEC TECHNIQUE

### 1. Module engine/video/

Nouvelle arborescence :

```
engine/video/
├── types.ts                    # interfaces VideoSource, ClipSpec, ClipResult
├── ingester/
│   ├── types.ts                # interface VideoIngester
│   ├── ytdlpIngester.ts        # YouTube/Vimeo/etc via yt-dlp
│   ├── localFileIngester.ts    # fichier local
│   └── dispatcher.ts           # route source URL/path → ingester
├── clipper/
│   ├── types.ts                # interface VideoClipper
│   ├── ffmpegClipper.ts        # découpe via ffmpeg
│   └── index.ts
├── formatters/
│   └── videoClipFormatter.ts   # formatter qui produit les clips MP4 pour L1/L2
└── pipeline.ts                 # orchestration complète
```

### 2. Interface VideoSource

```typescript
export interface VideoSource {
  type: 'url' | 'localFile';
  identifier: string;  // URL ou path
  metadata?: {
    podcastEpisodeId?: string;
    expectedDuration?: number;  // sanity check
  };
}

export interface IngestedVideo {
  localPath: string;       // chemin local après téléchargement/copie
  duration: number;        // en secondes
  format: string;          // 'mp4', 'mov', etc.
  resolution: { width: number; height: number };
  audioCodec: string;
  videoCodec: string;
}
```

### 3. Interface VideoIngester

```typescript
export interface VideoIngester {
  readonly id: string;
  canHandle(source: VideoSource): boolean;
  ingest(source: VideoSource, options: IngestOptions): Promise<IngestedVideo>;
}

export interface IngestOptions {
  outputDir: string;       // où télécharger
  maxSize?: number;        // bytes, défaut 2 GB
  cleanupOnFailure?: boolean;
}
```

### 4. Interface VideoClipper

```typescript
export interface VideoClipper {
  clip(spec: ClipSpec): Promise<ClipResult>;
}

export interface ClipSpec {
  source: IngestedVideo;
  startTime: number;       // secondes
  endTime: number;         // secondes
  outputPath: string;
  format: ClipFormat;      // V1: 'source' uniquement
  subtitles: SubtitleStyle; // V1: 'none' uniquement
}

export interface ClipResult {
  outputPath: string;
  duration: number;
  fileSize: number;
  success: boolean;
  warning?: string;        // ex: "audio désynchronisé détecté"
}
```

### 5. ytdlpIngester implémentation

Utiliser `yt-dlp-wrap` ou wrapper child_process direct. yt-dlp doit être installé sur le système.

```typescript
// Exemple structure (pas le code final)
async ingest(source: VideoSource, options: IngestOptions): Promise<IngestedVideo> {
  // 1. Vérifier que yt-dlp est installé : `yt-dlp --version`
  // 2. Récupérer metadata : `yt-dlp --print "%(duration)s|%(format)s" --skip-download URL`
  // 3. Télécharger : `yt-dlp -f "best[ext=mp4]/best" -o "outputDir/%(id)s.%(ext)s" URL`
  // 4. Vérifier le fichier téléchargé
  // 5. Retourner IngestedVideo
}
```

### 6. ffmpegClipper implémentation

Utiliser `fluent-ffmpeg` ou wrapper child_process direct. ffmpeg doit être installé sur le système.

```typescript
// Exemple structure
async clip(spec: ClipSpec): Promise<ClipResult> {
  // 1. ffmpeg -ss {startTime} -to {endTime} -i {source} -c copy {output}
  //    ou si re-encoding nécessaire : -c:v libx264 -c:a aac
  // 2. Vérifier le clip généré (durée, intégrité)
  // 3. Retourner ClipResult
}
```

**Note** : `-c copy` est ultra-rapide mais peut produire des cuts imprécis (clé I-frame). Pour précision +/- 1 frame, re-encoder. Tester quel mode marche pour notre cas (timestamps en secondes entiers).

### 7. Intégration au pipeline existant

Modifier `produceClientPack()` pour accepter une option `videoSource: VideoSource | null` :

```typescript
async function produceClientPack(
  episodeId: string, 
  options: {
    formats: OutputFormatsConfig;
    channels: ChannelConfig;
    videoSource?: VideoSource;  // nouveau Phase 7b
  }
): Promise<ProductionPack> {
  // ...code existant...
  
  if (options.videoSource) {
    const ingestedVideo = await videoDispatcher.ingest(options.videoSource);
    
    // Pour chaque key moment : générer un clip
    const keyMomentClips = await Promise.all(
      keyMoments.map(moment => 
        ffmpegClipper.clip({
          source: ingestedVideo,
          startTime: moment.startTimeSeconds,
          endTime: moment.endTimeSeconds,
          outputPath: `${outputDir}/clips/L1-${moment.id}.mp4`,
          format: 'source',
          subtitles: 'none'
        })
      )
    );
    
    // Pour chaque quote : générer un micro-clip
    const quoteClips = await Promise.all(
      quotes.map(quote => {
        const startTime = Math.max(0, quote.timestampSeconds - 5);
        const endTime = quote.timestampSeconds + 10;
        return ffmpegClipper.clip({
          source: ingestedVideo,
          startTime,
          endTime,
          outputPath: `${outputDir}/clips/L2-${quote.id}.mp4`,
          format: 'source',
          subtitles: 'none'
        });
      })
    );
    
    // Mettre à jour les xlsx L1/L2 avec les liens vers les clips
    // (chemin relatif dans le pack)
    
    // Cleanup vidéo source
    await fs.unlink(ingestedVideo.localPath);
  }
  
  // ...suite du pack...
}
```

### 8. Mise à jour xlsx avec liens clips

Les xlsx L1 et L2 ont déjà les colonnes "Lien vidéo (Phase 7b)" et "Lien micro-clip (Phase 7b)" préparées. Phase 7b les remplit avec :
- Chemin relatif dans le pack : `clips/L1-{moment_id}.mp4`
- Le lien doit être cliquable dans Excel (hyperlink) si possible

## ORDRE D'EXÉCUTION PHASE 7B

### Étape 1 — Vérifications préalables + branche (15 min)

```bash
pwd
git branch --show-current  # master attendu
git status  # clean
git log -1 --oneline  # c41d583 (Phase 7a mergée)
npm test  # 638/638 attendus

# Créer branche feature
git checkout -b feat/video-pipeline
git status

# Vérifier outils système installés
yt-dlp --version  # doit retourner une version
ffmpeg -version   # doit retourner une version
# Si absent : installer (yt-dlp via pip ou brew, ffmpeg via apt/brew)
```

**Si yt-dlp ou ffmpeg manque** : STOP immédiat avec demande à Jérémy d'installer.

### Étape 2 — Vérification disponibilité vidéo 4 épisodes pilote (30 min)

**CRITIQUE — STOP attendu après cette étape si soir.**

Pour chaque épisode pilote, identifier la source vidéo :

1. **GDIY #266 — Plais (Platform.sh)** : 
   - Vérifier YouTube GDIY si l'épisode est en vidéo
   - URL probable : https://youtube.com/@GenerationDoItYourself / chercher "Frédéric Plais Platform.sh"
   - Si présent : récupérer URL exacte
   - Si absent : marquer audio-only (mode B2)

2. **La Martingale #174 — Boissenot (Pokémon)** :
   - Vérifier YouTube La Martingale (si chaîne existe)
   - Si absent : marquer audio-only

3. **Le Panier #128 — Doolaeghe (Nooz Optics)** :
   - Vérifier YouTube Le Panier (si chaîne existe)
   - Si absent : marquer audio-only

4. **Finscale #107 — Veyrat (Stoïk)** :
   - Vérifier YouTube Finscale (si chaîne existe)
   - Si absent : marquer audio-only

**Test technique sur 1 épisode** :
- Pour 1 épisode trouvé en vidéo : faire un test `yt-dlp --print "%(duration)s|%(format)s" --skip-download URL` pour vérifier que yt-dlp peut accéder à la metadata
- Pas de téléchargement complet ce soir, juste validation accessibilité

**STOP intermédiaire 1 (si soir)** :

```markdown
🛑 PHASE 7B — STOP INTERMÉDIAIRE 1

Étape 1 : ✅ branche feat/video-pipeline créée, outils système OK
Étape 2 : matrice vidéos pilote

| Épisode | YouTube URL | Status |
|---|---|---|
| GDIY #266 Plais | [URL ou 'absent'] | OK / Audio-only |
| LM #174 Boissenot | [URL ou 'absent'] | OK / Audio-only |
| LP #128 Doolaeghe | [URL ou 'absent'] | OK / Audio-only |
| Finscale #107 Veyrat | [URL ou 'absent'] | OK / Audio-only |

Test yt-dlp sur 1 épisode : OK / FAIL [détail]

Décisions à valider Jérémy :
- Si N=4 vidéos disponibles : GO Phase 7b complète demain matin
- Si N=2-3 : GO Phase 7b avec 1-2 épisodes audio-only (mode B2)
- Si N≤1 : reconsidérer scope (ne fait pas sens d'investir 4 jours pour 1 épisode 
  vidéo). Soit re-sélection (+3 jours), soit drop Phase 7b et envoi pilote 
  formats pro uniquement (Phase 7a déjà mergée suffit).

STOP attente Jérémy.
```

### Étape 3 — Implémentation core video pipeline (1.5 jour)

Reprise demain matin.

1. Créer arborescence `engine/video/`
2. Définir interfaces TypeScript (VideoSource, IngestedVideo, ClipSpec, ClipResult, etc.)
3. Implémenter `ytdlpIngester.ts` (wrapping yt-dlp)
4. Implémenter `localFileIngester.ts` (copy + probe metadata)
5. Implémenter `videoDispatcher.ts` (route URL/path → ingester)
6. Implémenter `ffmpegClipper.ts` (wrapping ffmpeg)
7. Tests unitaires (15+ tests) :
   - VideoIngester : reconnaissance type source, validation
   - ytdlpIngester : metadata extraction (mock)
   - localFileIngester : copy + probe (fichier de test 5s)
   - ffmpegClipper : clip d'une vidéo de test 30s en 5s clip

**STOP intermédiaire 2 attendu après Étape 3**.

### Étape 4 — Intégration pipeline produceClientPack (0.5 jour)

1. Modifier `engine/output/produceClientPack.ts` pour accepter `videoSource`
2. Orchestration : ingestion + parallel clipping L1 + parallel clipping L2 + cleanup
3. Mise à jour xlsx L1/L2 avec les chemins clips (hyperlinks Excel si possible)
4. Tests d'intégration (5 tests) : pack avec vidéo, pack sans vidéo (audio-only), pack mixte

### Étape 5 — Génération pack pilote V3 sur 4 épisodes (1 jour)

1. Pour chaque épisode pilote avec vidéo disponible : lancer la génération complète
2. Pour chaque épisode audio-only : générer le pack sans clips, marquer dans le pack
3. Stocker dans `experiments/autonomy-session-2026-04-28/pack-pilote-stefani-orso-v3/`
4. Validation programmatique : vérifier intégrité MP4 + durées
5. Vérifier taille pack final (cap 500 MB total)

**Cap budget temps** : si 1 épisode prend plus de 30 min de génération clips, STOP et investiguer.

### Étape 6 — Tests régression + STOP final (1 jour)

1. `npm test` final : 638 + N nouveaux tests Phase 7b verts
2. Validation visuelle programmatique : 1 clip MP4 par épisode ouvert avec ffprobe pour vérifier intégrité
3. Diff anti-régression : les xlsx Phase 7a sont-ils intacts hors les colonnes Lien remplies ?

**STOP final Phase 7b** :

```markdown
# STOP Phase 7b — verdict : READY / PARTIAL / FAIL

## Verdict global
N épisodes pilotes générés avec clips vidéo / audio-only

## Détail par épisode

| Épisode | Source vidéo | L1 clips | L2 clips | Tailles |
|---|---|---|---|---|
| GDIY #266 | YouTube | 4-5/4-5 ✅ | 5/5 ✅ | XX MB |
| LM #174 | audio-only | N/A | N/A | N/A |
| LP #128 | YouTube | 4-5/4-5 ✅ | 5/5 ✅ | XX MB |
| Finscale #107 | YouTube | 4-5/4-5 ✅ | 5/5 ✅ | XX MB |

## Architecture V2-ready livrée
- VideoIngester interface (yt-dlp + local + futurs ingesters) : ✅
- VideoClipper interface (ffmpeg + futurs clippers) : ✅
- ClipFormat enum ('source' V1, 'portrait'/'square' V2) : ✅
- SubtitleStyle enum ('none' V1, 'simple'/'dynamic' V2) : ✅

## Tests
- Tests cumulés : N/M verts (delta : +N nouveaux tests Phase 7b)
- Régression : aucune

## Pack pilote V3
- Localisation : experiments/autonomy-session-2026-04-28/pack-pilote-stefani-orso-v3/
- Taille totale : XX MB
- Validation visuelle Jérémy : à faire (ouvrir 2-3 clips MP4)

## Cumul session
- Phase 7b : ~$0 LLM (objectif tenu)
- Total session cumulé : ~$6.55 / $17.50

## État repo
- Branche : feat/video-pipeline
- Commits sur la branche : N
- Master : c41d583 inchangé
- Working tree : clean

## Recommandation pour Jérémy

- Si Phase 7b READY : pack V3 généré, validation manuelle clips à faire 
  par Jérémy avant merge sur master.
- Si Phase 7b PARTIAL : décision sur quoi merger, scope dégradé.
- Si Phase 7b FAIL : diagnostic + options (rollback branche / fix ciblé).

Pas d'auto-merge sur master.
```

## DISCIPLINE TRANSVERSALE PHASE 7B

- **Branche `feat/video-pipeline` exclusivement**, master jamais touché
- **Pas de modification du contenu** des livrables texte (déjà mergés Phase 7a)
- **Pas d'appel LLM** sauf si vraiment nécessaire (devrait être 0)
- **Cleanup systématique** des vidéos sources après extraction des clips
- **Cap timing strict** : 4 jours wall

## PROCÉDURE EN CAS D'ÉCHEC

Cas typiques de blocker :

1. **yt-dlp échoue sur YouTube** (auth, geo-blocking, rate limits) : tester avec cookie auth ou sleep/retry. Si persiste, fail-safe = audio-only pour cet épisode.

2. **ffmpeg génère clips corrompus** : vérifier mode `-c copy` vs re-encode. Sinon, fail-safe = signaler dans le STOP avec sample.

3. **Taille pack explose** (>500 MB) : tester compression H.264 plus agressive (CRF 23 → 28). Si toujours trop : réduire durée des micro-clips L2.

4. **Vidéo source inaccessible (taille, format)** : fail-safe = audio-only pour cet épisode.

5. **Désynchronisation audio/vidéo dans clips** : signaler dans warning ClipResult, ne pas bloquer.

## FALLBACK EXPLICITE

Si Phase 7b échoue ou est partielle :

- Master `c41d583` (Phase 7a mergée) reste l'état stable
- Le pack pilote actuel V2 (formats pro docx + xlsx) est déjà envoyable à Stefani
- Phase 7b est un **bonus**, pas un prérequis pour l'envoi pilote
- Cap envoi 17/05 maintenu même si Phase 7b drop

L'objectif est de **ne jamais bloquer l'envoi 17/05** par cette feature.

GO Étape 1 → Étape 2 → STOP intermédiaire 1 (si soir) → reprise demain → Étape 3 → STOP 2 → Étape 4 → Étape 5 → Étape 6 → STOP final.

---

## NOTE SPÉCIALE DÉMARRAGE EN SOIREE 30/04

Si le démarrage est ce soir 30/04 vers 19h15-19h30 :

**Plan de soirée recommandé** :
- 19h30-19h45 : Étape 1 (vérifications + branche)
- 19h45-21h : Étape 2 (matrice vidéos 4 épisodes + test yt-dlp sur 1)
- 21h : STOP intermédiaire 1 + RDV demain matin

**Ne PAS attaquer Étape 3 ce soir** — c'est 1.5 jour de dev qui demande de la rigueur. Démarrage frais demain 9h.

---

## NOTE SPÉCIALE INSTALLATION OUTILS SI MANQUANTS

Si yt-dlp manque sur le système :
```bash
# macOS
brew install yt-dlp

# Linux (Ubuntu/Debian)
sudo apt install yt-dlp
# OU via pip
pip install -U yt-dlp

# Windows : voir https://github.com/yt-dlp/yt-dlp/releases
```

Si ffmpeg manque :
```bash
# macOS
brew install ffmpeg

# Linux (Ubuntu/Debian)
sudo apt install ffmpeg

# Windows : voir https://ffmpeg.org/download.html
```

Vérifier installation :
```bash
yt-dlp --version
ffmpeg -version
```
