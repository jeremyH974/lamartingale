# 🎙️ La Martingale — Plateforme d'éducation financière

> Data science & IA appliquées aux **313 épisodes** du podcast La Martingale de Matthieu Stefani.

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-000)
![Neon Postgres](https://img.shields.io/badge/BDD-Neon%20%2B%20pgvector-00e59b)
![OpenAI](https://img.shields.io/badge/Embeddings-OpenAI-74aa9c)
![Episodes](https://img.shields.io/badge/Episodes-313-004cff)
![Status](https://img.shields.io/badge/Status-Prod-brightgreen)

## Ce que fait la plateforme

À partir des **313 épisodes** scrapés de [lamartingale.io](https://lamartingale.io) (articles complets, audio, invités), on construit une base structurée : embeddings sémantiques, graph de connexions, chapitrage, annuaire invités. Par-dessus, une app web explore l'archive en recherche naturelle, répond aux questions par RAG, et propose des quiz qui s'adaptent au niveau du visiteur.

Pensé comme un prolongement data du podcast — pour les auditeurs qui veulent naviguer l'archive autrement que scroll chronologique.

## Captures

![V2 Homepage](docs/screenshots/v2-home.png)
![Recherche sémantique](docs/screenshots/v2-search.png)
![Quiz adaptatif](docs/screenshots/v2-quiz.png)

_Pour régénérer les screenshots : voir [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)._

## Fonctionnalités clés

- 🔍 **Recherche hybride** — sémantique (pgvector cosine) + lexicale (pg_trgm) fusionnées via RRF
- 🤖 **Chat RAG** sur le corpus complet (gpt-4o-mini, prompt pédagogique en français)
- 📊 **Analytics** — distribution par pilier/difficulté, invités récurrents, co-occurrences
- 🧠 **Quiz adaptatif** — 614 questions, IRT simplifié (theta bayésien, exploration/exploitation)
- 📋 **Contenu profond** — 296 articles complets (avg 5300 c), 899 chapitres H2, 9906 liens classifiés
- 🔗 **Graph inter-épisodes** — arêtes par invité partagé, parcours pédagogique, similarité sémantique
- 👥 **Invités enrichis** — 263 profils LinkedIn extraits, multi-apparitions suivies

## Stack technique

| Couche | Technologies |
|---|---|
| Backend | TypeScript, Express, Vercel Serverless |
| BDD | Neon Postgres, pgvector (3072d), pg_trgm, Drizzle ORM |
| IA / ML | OpenAI text-embedding-3-large, gpt-4o-mini (RAG), UMAP + HDBSCAN (clustering) |
| Frontend | HTML/CSS/JS vanille, D3.js (V1), Chart.js (V2) |
| Infra | Vercel (2 projets : V1 + V2), GitHub, Neon serverless |

## Démarrage rapide

```bash
git clone https://github.com/jeremyH974/lamartingale.git
cd lamartingale
npm install
cp .env.example .env   # remplir DATABASE_URL, OPENAI_API_KEY
npx tsx src/api.ts     # http://localhost:3001
```

Ouvrir [`http://localhost:3001/`](http://localhost:3001/) pour V1, [`/v2.html`](http://localhost:3001/v2.html) pour V2.

## Structure du projet

```
├── api/            # Entrée Vercel serverless (wrap Express)
├── src/
│   ├── api.ts      # 27 endpoints Express (dual-mode DB/JSON)
│   ├── db/         # Schema Drizzle + queries + migrations + audits
│   ├── ai/         # Embeddings, hybrid search, RAG, quiz adaptatif, analytics
│   ├── scrape-*.ts # 5 scrapers (episodes, media, bios, deep, RSS)
│   └── types.ts    # Types partagés + moteur de recommandation
├── public/         # Front-ends statiques (index.html = V1, v2.html = V2)
├── scripts/        # Outils Python (clustering UMAP) + build livrables
└── docs/           # Documentation
```

## Production

| Env | URL | Projet Vercel |
|---|---|---|
| V1 (dark mode, D3.js graph) | <https://lamartingale.vercel.app> | `lamartingale` |
| V2 (brand #004cff, Poppins) | <https://lamartingale-v2.vercel.app> | `lamartingale-v2` |

Les deux partagent le même backend serverless (`api/index.ts`) et la même BDD Neon.

## Documentation

- [**Architecture**](docs/ARCHITECTURE.md) — vue d'ensemble, god nodes, décisions techniques (ADR), dette
- [**API Reference**](docs/API.md) — les 27 endpoints, paramètres, réponses, exemples curl
- [**Data Dictionary**](docs/DATA.md) — schéma relationnel, fill rates, extensions Postgres
- [**Data Pipeline**](docs/PIPELINE.md) — scrapers, enrichissement, embeddings, ordre d'exécution
- [**Deployment**](docs/DEPLOYMENT.md) — env vars, procédure deploy, troubleshooting
- [**Contributing**](docs/CONTRIBUTING.md) — setup dev, conventions, workflow
- [**Feedback Orso Media**](docs/orso-media-feedback.md) — retour qualité données (sendable à Matthieu Stefani)

## Crédits

Podcast La Martingale © **Matthieu Stefani / Orso Media**. Cette plateforme est un projet indépendant non-commercial, à but éducatif et personnel.

## Licence

_À définir._
