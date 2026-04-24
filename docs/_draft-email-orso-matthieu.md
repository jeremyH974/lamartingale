# Drafts email RDV démo — Orso / Matthieu

**Statut** : 3 versions (court / medium / long). Non envoyé, non commité. À affiner
selon relation réelle et canal (mail direct, WhatsApp, LinkedIn). Jamais "Reply-all"
automatique.

---

## Version COURT (5-6 lignes, pour relation directe / WhatsApp / DM)

> **Sujet** : Démo univers MS — 30 min quand tu peux ?
>
> Salut Matthieu,
>
> J'ai bouclé la plateforme qui agrège LM, GDIY, Le Panier, Finscale,
> Passion Patrimoine et Combien ça gagne dans un hub unique, avec search
> cross-podcast, quiz qualité LLM et dashboard créateur.
>
> 30 minutes pour te montrer en live ? J'aimerais surtout ton avis sur
> ce qui te servirait au quotidien et dans quel ordre on priorise la suite.
>
> Dispo cette semaine ou la prochaine selon ton agenda.
>
> Jérémy

---

## Version MEDIUM (12-15 lignes, relation pro cordiale)

> **Sujet** : Démo plateforme univers MS — propose 30 min
>
> Bonjour Matthieu,
>
> Pour faire le point : j'ai fini d'ingérer et de déployer les 6 podcasts
> de l'univers dans une plateforme unifiée. Chaque podcast a sa charte
> graphique (bleu LM, vert néon GDIY, etc.) mais tout partage la même
> intelligence data en arrière-plan :
>
> - 2 409 épisodes, 1 208 profils d'invités consolidés
> - Search hybride vectoriel + BM25 sur les 6 podcasts
> - 2 980 références cross-podcast détectées automatiquement
> - Quiz substantiels régénérés par Claude Haiku 4.5 (1 586 sur LM, les
>   autres podcasts dès que tu valides)
> - Dashboard créateur avec KPIs, graphe D3, répartition piliers
> - Auth magic-link prête à seeder des accès externes (toi, Orso, Cosa
>   Vostra, Gokyo — scope à trancher ensemble)
>
> J'aimerais te montrer 30 minutes en live. Deux objectifs : valider ce qui
> mérite d'être mis devant ton audience / ton équipe, et prioriser la suite
> en fonction de ce qui vous servirait vraiment.
>
> Des créneaux sur [semaine X ou Y] ? Orso et / ou Cosa Vostra peuvent
> rejoindre si ça fait sens de ton côté.
>
> Bien à toi,
> Jérémy

---

## Version LONG (context complet, si relation distante ou cc équipes Orso)

> **Sujet** : Plateforme univers Matthieu Stefani — prêt pour démo
>
> Bonjour Matthieu,
>
> Un point complet sur la plateforme que je construis depuis quelques mois
> autour de tes podcasts. Je pense que c'est le bon moment pour que tu voies
> où ça en est, et surtout pour que toi et tes équipes (Orso, Cosa Vostra,
> Gokyo) me disiez si on va dans la bonne direction.
>
> **Où on en est aujourd'hui**
>
> Les 6 podcasts de l'univers sont tous ingérés et déployés sur des sites
> indépendants, avec leur identité propre :
>
> - La Martingale : lamartingale-v2.vercel.app (313 eps, bleu Poppins)
> - Génération Do It Yourself : gdiy-v2.vercel.app (959 eps, noir + vert néon)
> - Le Panier : lepanier-v2.vercel.app (506 eps)
> - Finscale : finscale-v2.vercel.app (332 eps)
> - Passion Patrimoine : passionpatrimoine-v2.vercel.app (195 eps)
> - Combien ça gagne : combiencagagne-v2.vercel.app (104 eps)
> - Hub agrégateur : ms-hub.vercel.app (6 cards dynamiques + ordering)
>
> **Ce que la plateforme sait faire qui n'existe nulle part ailleurs**
>
> - Search hybride vectoriel (embeddings OpenAI) + BM25, par podcast
>   ou cross-podcast via le hub
> - Graphe D3 des références croisées entre épisodes (2 980 refs inter-eps
>   détectées automatiquement)
> - 1 208 profils invités consolidés avec 1 162 co-occurrences détectées
>   entre podcasts (ex : un invité passé sur LM et GDIY apparaît sur les
>   deux profils avec ses deux épisodes)
> - Quiz de qualité éditoriale via Claude Haiku 4.5 (1 586 questions sur
>   LM, régénérées cette semaine à partir des articles et chapitres ;
>   parité sur GDIY et les autres podcasts dès ton GO)
> - Dashboard créateur avec KPIs, insights, répartition par pilier, top
>   outils / entreprises cités
> - Auth par magic-link signé HMAC, scope par podcast + email
>   (infrastructure prête pour onboarder qui tu veux, sur les podcasts
>   que tu choisis)
>
> **Ce qui me manque pour avancer**
>
> Trois décisions business que je ne peux pas prendre sans toi :
>
> 1. Scope de ton accès perso : univers complet (`root`) ou restreint à
>    LM + GDIY (les deux podcasts que tu animes) ?
> 2. Seed des accès Orso Media / Cosa Vostra / Gokyo : un email d'équipe
>    générique, ou individus nommés ? Sur quels podcasts ?
> 3. Priorité suivante : régénérer les quiz GDIY au même niveau que LM,
>    construire une expérience auditeur (login, favoris, reco), ou
>    absorber les dashboards externes type Spotify for Podcasters dans le
>    dashboard unifié ? Ou autre chose que je ne vois pas depuis mon angle ?
>
> **Ma proposition**
>
> Trente minutes en visio pour te montrer en live, avec écran partagé.
> Je te fais parcourir les 7 sites, puis je te donne la main pour que tu
> cliques sur ce qui t'intéresse. Si tu veux inviter Orso et/ou Cosa Vostra
> / Gokyo, c'est encore mieux — j'ai besoin de leurs retours au moins autant
> que des tiens.
>
> Des créneaux sur [semaine X ou Y] ? Je m'adapte complètement à ton agenda.
>
> Au plaisir,
> Jérémy

---

## Notes d'envoi

- **Canal** : préfère mail direct à Matthieu sans cc équipes en premier — il décidera de qui inviter
- **Pièce jointe** : aucune à l'email initial. Si demandé : `docs/DEMO_READINESS.md` converti en PDF (drop `# Demo Readiness — Univers MS`, garder pitch + 2 premiers tableaux)
- **Follow-up** : si pas de réponse à J+5, relance courte "Je repense à mon mail de la semaine dernière — dispo sur [nouvelle proposition de créneau] si ça te va"
- **À éviter** : envoyer un lien direct sur les sites Vercel sans contexte — ils sont pas finis pour un inconnu, et Matthieu pourrait tomber sur une section pas polie (ex : slugs vides LM, quiz template GDIY)
