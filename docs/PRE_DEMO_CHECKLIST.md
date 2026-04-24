# Pré-démo checklist — 15 minutes avant un live

**Statut** : draft interne. Non commité tant que pas de GO.

**Objectif** : éviter de se planter en live sur un bug évident (site 500, magic-link
cassé, hub qui n'affiche que 5 cards parce qu'un deploy a raté). Passer cette checklist
**15 minutes avant** le début du RDV, pas au moment où Matthieu se connecte.

---

## T-15 min : santé infrastructure

### 1. Status deploys Vercel (2 min)

```bash
npx tsx cli/index.ts status
```

Attendu : pour chaque podcast listé, `READY` + URL prod cliquable, pas de
`BUILDING` ou `ERROR`. Si un `ERROR` apparaît → checker les logs Vercel Dashboard,
décider si on démo quand même en évitant ce podcast, ou si on redéploie vite.

### 2. Hub charge avec 6 cards (30 s)

Ouvrir `https://ms-hub.vercel.app` en **navigation privée** (évite le cache navigateur
personnel qui masquerait un bug public).

Attendu :
- 6 cards visibles : La Martingale, GDIY, Le Panier, Finscale, Passion Patrimoine, Combien ça gagne
- Chaque card affiche titre + auteur + nb eps + dernier ep
- Pas de card "loading…" qui ne se résout pas
- Le Panier affiche bien sa charte (pas bleu LM par défaut)

Si cold hit > 3 s : acceptable, prévenir Matthieu « premier chargement ~2-3 s,
après c'est instant ». Si > 5 s → incident, debug avant la démo.

### 3. Les 6 sous-sites répondent (1 min)

En navigation privée, ouvrir chacun en nouvel onglet :

- https://lamartingale-v2.vercel.app
- https://gdiy-v2.vercel.app
- https://lepanier-v2.vercel.app
- https://finscale-v2.vercel.app
- https://passionpatrimoine-v2.vercel.app
- https://combiencagagne-v2.vercel.app

Attendu pour chaque : hero avec bon titre + bon accent couleur + nav publique
5 items (Accueil / Épisodes / Parcours / Experts / Recherche). La liste eps charge.

---

## T-12 min : flow auth magic-link

Critique si la démo passe par « je te montre comment j'onboarderai Matthieu ».

### 4. Magic-link envoyé + reçu (3 min, côté boîte mail perso)

1. Aller sur `https://ms-hub.vercel.app/login` en navigation privée
2. Entrer `jeremyhenry974@gmail.com` (seul email seedé aujourd'hui)
3. Submit → message « Si cet email est autorisé, tu vas recevoir un lien »
4. Ouvrir la boîte Gmail → **vérifier que le mail arrive en <60 s**
   - Expéditeur actuel (pré-DNS Resend pro) : `onboarding@resend.dev`
   - Si le mail tombe en spam → note mentale pour mentionner le point DNS en RDV
5. Cliquer le lien → redirection sur le hub, session cookie posé, nom Jérémy affiché
6. Hard refresh → toujours loggé (cookie persistant OK)

**Plan B si magic-link ne marche pas** : avoir un onglet déjà loggé ouvert pour
montrer le dashboard. Ne pas tenter de logger devant Matthieu.

### 5. Logout + relogin rapide (30 s)

Vérifier qu'un logout + immédiat re-login flow OK. Démo-safe : si ça casse, on
ne le montre pas.

---

## T-10 min : contenu démonstratif

### 6. Endpoint quiz LM nouvellement généré (1 min)

```bash
curl -sS "https://lamartingale-v2.vercel.app/api/quiz/episode/313" | python -m json.tool | head -30
```

Attendu : `count: 5`, questions substantielles sur fiscalité 2026 (réforme LNMP,
CESU, PER). Pas de « Dans quel pilier se situe l'épisode ».

### 7. Search hybride (30 s)

```bash
curl -sS "https://lamartingale-v2.vercel.app/api/search/hybrid?q=bitcoin&limit=3"
```

Attendu : 3 résultats pertinents avec score. Ou test visuel sur le site :
LM → Recherche → taper "bitcoin" → résultats non-nuls.

### 8. Dashboard créateur charge (30 s)

Ouvrir `https://lamartingale-v2.vercel.app/dashboard` (ou URL équivalente selon
le routing actuel). Attendu : KPIs visibles, graphe D3 non vide, pas de
section « loading forever ».

### 9. Page épisode avec article + chapitres + quiz (1 min)

Ouvrir `https://lamartingale-v2.vercel.app` → cliquer sur un épisode récent
(ex: #313). Attendu : article lisible, chapitres cliquables, quiz inline
fonctionnel, similar episodes non vide.

---

## T-5 min : matériel live

### 10. Outils écran partagé

- Fenêtre navigateur dédiée démo (pas ton navigateur perso avec 40 onglets)
- Zoom niveau 110-125 % pour que Matthieu lise bien
- Bloquer les notifications système (mode focus / ne pas déranger)
- Préparer 3 onglets pré-ouverts :
  1. `ms-hub.vercel.app` (point de départ)
  2. `lamartingale-v2.vercel.app` (démo détaillée d'un sous-site)
  3. `gdiy-v2.vercel.app` (second sous-site contrastant en charte)

### 11. Document pitch sous la main

Avoir `docs/DEMO_READINESS.md` ouvert dans un second écran / un autre onglet
pour checker rapidement un chiffre si Matthieu pose une question précise
(« combien d'épisodes cross-référencés ? » → 2 980).

### 12. Plan de sortie (ce qu'on veut obtenir)

Écrit sur un post-it physique à côté de l'écran :

- Scope Matthieu root / scoped ?
- Emails à seeder (perso + équipes) ?
- Top 3 priorités de la roadmap ?
- Fréquence d'usage attendue ? Qui ouvre le dashboard ?

---

## Si ça casse en live

**Ne pas paniquer, ne pas bidouiller devant.** Procédure :

1. « Tiens, ça me fait une erreur — laisse-moi te montrer sur un autre onglet »
2. Passer à la partie suivante de la démo
3. Après le RDV : debug + éventuel follow-up « j'ai fixé le truc de tout à l'heure,
   voici le lien si tu veux vérifier »

Pas de commit ni de redeploy pendant le RDV. Jamais.

---

## Après le RDV : action items à capturer immédiatement

Dès la fin du call, écrire dans un fichier local (pas commité) :

- Décisions prises (scope Matthieu, emails à seeder)
- Demandes nouvelles (features non prévues, reformulations)
- Arbitrage priorité des rails restants
- Prochaine date de point

Puis rapporter dans ce repo via un commit `docs: capture RDV Matthieu YYYY-MM-DD`
une fois la synthèse propre rédigée.
