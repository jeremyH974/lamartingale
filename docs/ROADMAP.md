# Roadmap

## Pre-pitch (avril-mai 2026) — EN COURS

Prêt pour le 19 mai 2026. Voir `docs/DEMO_SCRIPT.md`.

- [x] Deep content exposé (API + modals + dashboard + cache)
- [x] RAG enrichi (chapitres + takeaways + liens + LinkedIn)
- [x] Cache warm pour queries démo
- [x] Endpoint `/api/demo/summary` (cheat sheet pitch)
- [x] Homepage OPT-4 (hero premium, count-up, CTA pulse, Sillon footer)
- [x] Badge "Généré par IA" sur quiz

## Post-pitch (juin 2026+)

### Migration React
- Remplacer `public/v2.html` (3300+ lignes) par des composants React
- Tailwind CSS au lieu de CSS inline
- Next.js API routes au lieu d'Express
- Alignement avec le stack Sillon
- Conserver la compatibilité multi-tenant (config-driven)

### Monitoring
- Vercel Analytics (gratuit)
- Alertes Slack sur erreurs API (seuil 5xx > 1/min)
- Dashboard uptime (BetterStack ou UptimeRobot)
- Traces sur `ragQuery` et `hybridSearch` (p50/p95/p99)

### Similarités à la volée
- Remplacer les top-20 précalculés par du calcul pgvector temps réel
- Pertinent quand le corpus dépasse 1000 épisodes
- Garder le cache (invalidation sur nouveaux embeddings)

### Tests end-to-end
- Playwright ou Cypress
- Parcours : homepage → search → clic épisode → page épisode → chat → quiz
- CI GitHub Actions, run sur chaque PR

### Observabilité métier
- Tracking : queries les plus posées au chat
- Top épisodes cliqués depuis le search
- Dashboard « ce que ton audience cherche » (pour Matthieu)

### Automatisation refresh
- Vercel Cron (gratuit) : `npm run refresh` tous les jours à 6h
- Auto-deploy sur nouveau contenu détecté
- Notification Slack quand un nouvel épisode est ingéré

### Dette technique ouverte
- 22 épisodes avec `slug=""` en BDD → re-crawler le listing
- Divergence `episodes.guest_bio` vs `guests.bio` → audit + cleanup
- 4 épisodes sans match RSS (#307, #295, #291, #174)
- Feedback Orso Media à envoyer (`docs/feedback-orso-media.md`)
