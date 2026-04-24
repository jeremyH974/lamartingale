# Phase E — Auth créateur · Synthèse de livraison

**Livré les 24 avril 2026** (Rails 4a + 4b).
**Statut** : 2 commits sur `master`, hub déployé, 214/214 tests green, tsc clean. **En attente de configuration Resend prod + smoke test admin externe.**

---

## TL;DR

Le hub créateur `https://ms-hub.vercel.app` est désormais **privé**. Un accès se crée en insérant une ligne dans `podcast_access` (email × tenant_id × role). L'authentification est passwordless via magic-link email (Resend en prod, noop en dev). La session est un cookie HMAC-SHA256 stateless (pas de table `sessions`). Le filtrage est serveur-side : le hub ne montre que les podcasts auxquels l'admin a accès.

Scope Phase E :
- ✅ Back-end auth complet (2 tables, 4 endpoints, middleware, 28 nouveaux tests).
- ✅ Front-end login + header session + logout + gestion erreurs.
- ✅ Filtrage `/api/universe` per-session.
- ⏳ Config Resend prod + seed admins externes (actions hors Claude Code).

---

## Commits + deploy

| Rail | Commit | Description |
|---|---|---|
| 4a (back-end) | `ba2dc50` | `feat(auth): passwordless email via magic link + podcast_access scoping (Rail 4a)` |
| 4b (front-end) | `2a7b80d` | `feat(hub): login UI + 401 handling + session header (Rail 4b)` |

Deploy Vercel prod hub (Rail 4b) : `dpl_AcDzJ1GxBYerKDRsGVMiTpXx6JwW` → https://ms-hub.vercel.app

---

## Architecture

### Schéma DB (2 tables, migration idempotente)

```sql
CREATE TABLE podcast_access (
  id         serial PRIMARY KEY,
  email      text NOT NULL,
  tenant_id  text NOT NULL,           -- '*' pour root
  role       text NOT NULL DEFAULT 'viewer',  -- 'viewer' | 'root'
  created_at timestamp DEFAULT now(),
  UNIQUE (email, tenant_id)
);
CREATE INDEX idx_podcast_access_email ON podcast_access(email);

CREATE TABLE magic_link (
  token       text PRIMARY KEY,       -- hex 64 chars (crypto.randomBytes)
  email       text NOT NULL,
  expires_at  timestamp NOT NULL,     -- +15 min à la création
  consumed    boolean NOT NULL DEFAULT false,
  created_at  timestamp DEFAULT now()
);
CREATE INDEX idx_magic_link_email ON magic_link(email);
```

**Convention root** : une ligne avec `tenant_id='*'` et `role='root'` → bypass du filtre, accès à tous les tenants présents + futurs.

### Flow authentification

```
┌──────────┐    POST /api/auth/request-link  ┌────────┐
│ /login   │─── body { email }──────────────▶│  API   │
└──────────┘                                 └───┬────┘
                                                 │
                                  1. createMagicLink(email)
                                     → INSERT magic_link (token, expires_at=now+15min)
                                  2. sendMagicLink({email, token, baseUrl})
                                     → Resend ou noop (log console)
                                  3. Réponse neutre {ok:true, sent, provider}
                                     (PAS d'énumération : même réponse si email unknown)
                                                 │
┌──────────┐   GET /api/auth/consume?token=X    │
│  email   │──────────────────────────────────▶ │
└──────────┘                                    │
                                  1. UPDATE magic_link SET consumed=true
                                     WHERE token=X AND NOT consumed AND expires_at>now()
                                     RETURNING email   (atomic, one-shot)
                                  2. getAccessScope(email) → {isRoot, tenantIds}
                                  3. Si 0 accès → 403 no_access
                                  4. signSession(email) → cookie HMAC-SHA256
                                  5. Set-Cookie hub_session=... + 302 redirect `next` (/)
                                                 │
┌──────────┐        GET /api/universe           │
│  /hub    │──── Cookie: hub_session=...──────▶ │
└──────────┘                                    │
                                  1. requireHubAuth middleware :
                                     - readCookie → verify HMAC + expiration
                                     - getAccessScope → {isRoot, tenantIds}
                                     - Si pas session → 401
                                     - Si session mais 0 accès → 403
                                  2. getCached('universe', 3600, ...) → full universe
                                  3. Si isRoot → renvoie full
                                     Sinon filterUniverseByTenants(full, allowed)
                                     → pure function, filtre podcasts/pairs/refs/guests
                                     → recompute totals
```

### Endpoints

| Méthode | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/request-link` | public | Génère + envoie magic-link. Réponse neutre. |
| GET | `/api/auth/consume?token=...` | public | Consomme token (one-shot), set cookie, redirect. Accept: application/json pour JSON. |
| POST | `/api/auth/logout` | public | Set-Cookie Max-Age=0. |
| GET | `/api/auth/me` | optional | Renvoie `{authenticated, email, isRoot, tenantIds}` ou `{authenticated:false}`. |
| GET | `/api/universe` | required | Protégé par `requireHubAuth`. Filtré per-session. |

### Middleware

```ts
// engine/auth/middleware.ts
export async function requireHubAuth(req, res, next) {
  const session = verify(readCookie(req.headers.cookie));
  if (!session) return res.status(401).json({ error: 'unauthenticated' });
  const scope = await getAccessScope(session.email);
  if (!scope.isRoot && scope.tenantIds.length === 0)
    return res.status(403).json({ error: 'no_access' });
  req.session = session;
  req.accessScope = scope;
  next();
}
```

### Filtrage serveur-side (`filterUniverseByTenants`)

Pure function dans `engine/api.ts`, testée par `auth-universe-filter.test.ts` (5 tests) :
- `podcasts` : filtre simple sur `p.id ∈ allowed`.
- `cross.pairStats` : garde les paires où `from ∈ allowed ET to ∈ allowed`.
- `cross.episodeRefs` : garde les refs où `from.podcast ∈ allowed ET to.podcast ∈ allowed`.
- `cross.guests` : garde les guests avec ≥1 `appearance` dans un tenant autorisé, et **drop les appearances hors scope** (pas de fuite d'info sur les tenants non-autorisés).
- `universe.totals` : **recalculé** depuis les podcasts filtrés (pas de fuite sur le total réel).

Le cache `getCached('universe', 3600, ...)` stocke l'univers brut (non filtré) partagé entre toutes les sessions. Le filtrage est appliqué à la sortie, en mémoire, négligeable en CPU (< 5ms observé).

---

## Décisions d'architecture (choix non-évidents)

### 1. Stateless session cookie (pas de table `sessions`)
**Format** : `base64url(email) . expEpochSec . hex(hmac-sha256(email+'.'+exp, SESSION_SECRET))`

**Pourquoi** : évite un roundtrip DB à chaque requête, alignement avec le reste de l'archi (tout stateless côté API). Logout = clear cookie côté client (Max-Age=0), pas de "session invalidation" côté serveur.

**Contrepartie** : on ne peut pas révoquer une session individuellement sans régénérer `SESSION_SECRET` (qui invalide toutes les sessions). Acceptable pour le volume visé (N<50 admins).

### 2. One-shot magic-link via atomic UPDATE
```sql
UPDATE magic_link SET consumed = true
WHERE token = $1 AND consumed = false AND expires_at > now()
RETURNING email
```

**Pourquoi** : empêche replay d'un lien intercepté. L'atomicité postgres garantit que deux consume simultanés ne passent pas les deux (le 2e verra `consumed=true` et ne match pas le `WHERE`).

**Contrepartie** : si l'admin clique 2× sur le lien par erreur (UX Gmail qui prefetch), le 2e hit donne erreur `invalid_or_expired_token`. On a accepté ce trade-off (mieux vaut bloquer un double-click légitime que laisser un replay passer). Un admin qui tombe dans ce cas peut juste redemander un lien.

### 3. Cookie HttpOnly + SameSite=Lax + Secure (prod only)
- **HttpOnly** : pas d'accès JS côté client → protection XSS.
- **SameSite=Lax** : cookie envoyé sur navigations top-level même cross-site (link email → hub), mais pas sur requêtes third-party → protection CSRF pour les endpoints POST.
- **Secure** : en prod (`NODE_ENV=production`) uniquement, HTTPS requis. En dev/local, off pour permettre http://localhost.
- **Path=/** : cookie envoyé sur tous les paths du hub.

### 4. Filtrage serveur-side exclusif (pas côté client)
Le client ne reçoit **jamais** la liste complète des podcasts s'il n'y a pas accès. `filterUniverseByTenants` tourne côté API avant sérialisation. Pas de risque de fuite via DevTools ou inspection réseau.

**Alternative écartée** : renvoyer full universe + flag `allowed[]`, laisser le client filtrer. Rejeté : fuite d'info sur les tenants non-autorisés (noms, tagline, counts d'épisodes), même si CSS masqué.

### 5. Convention root `tenant_id='*'`
**Pourquoi pas `role='admin'` global** : une seule colonne à inspecter pour le bypass, compatible avec la structure table existante, pas de "role hierarchy" à gérer.

**Bénéfice** : un admin root qu'on ajoute aujourd'hui voit automatiquement les futurs podcasts ajoutés (pas de backfill d'accès à faire).

### 6. Noop Resend en dev + fallback log console
Si `RESEND_API_KEY` absent, `sendMagicLink()` renvoie `{sent:false, provider:"noop", link}` et logue le lien en console. Réponse API expose aussi `dev_link` (uniquement en `NODE_ENV !== 'production'`) pour accélérer les tests locaux.

**Bénéfice** : tests d'intégration tournent sans compte Resend. CI sans dépendance externe payante.

### 7. Neutral response anti-enumeration sur `/api/auth/request-link`
La réponse est toujours `{ok:true}` même si l'email n'a aucun accès (et même si l'email n'existe pas dans `podcast_access`). L'autorisation est vérifiée au moment du `consume` (403 `no_access` si l'email n'a pas d'accès).

**Pourquoi** : évite qu'un attaquant ne puisse énumérer les emails ayant un accès au hub en probant l'endpoint request-link.

**Contrepartie** : un admin qui se trompe d'email reçoit silencieusement 0 mail, sans feedback. UX acceptable vu que le hub est privé (pas une app grand public). Mitigation : message neutre "Si cet email a un accès, un lien a été envoyé" côté front.

### 8. Email lowercased+trimmed partout
`email.toLowerCase().trim()` est appliqué à `sign()`, `grantAccess()`, `getAccessScope()`, `createMagicLink()`. Tests explicites dans `auth-session.test.ts` ("normalise email lowercase+trim at sign") et `auth-integration.test.ts` ("email lowercased+trimmed at grant + lookup").

**Pourquoi** : Gmail et la plupart des providers sont case-insensitive. "JEREMY@Example.COM" et "jeremy@example.com" doivent matcher. Évite les surprises.

### 9. TTL magic-link 15 min / session 30 jours
- **Magic-link** : `now() + 15 minutes` côté DB (`interval '15 minutes'`). Magic-link = UX one-shot, pas un token long-lived.
- **Session** : 30 jours via `SESSION_TTL_DAYS` (défaut). Confortable pour un usage créateur (login une fois par mois max).

**Override** : `SESSION_TTL_DAYS` env var (testé par `respects SESSION_TTL_DAYS env var when set`).

### 10. Fallback SESSION_SECRET dérivé de DATABASE_URL en dev
Si `SESSION_SECRET` absent ou < 16 chars :
```ts
const fallback = process.env.DATABASE_URL || 'dev-fallback-secret-not-for-prod';
return crypto.createHash('sha256').update(`session:${fallback}`).digest('hex');
```

**Pourquoi** : évite le random-at-restart en dev (qui invaliderait toutes les sessions à chaque reload `nodemon`). En prod, `SESSION_SECRET` **doit** être défini (>= 32 chars random, `openssl rand -hex 32`).

### 11. HMAC avec `crypto.timingSafeEqual` (pas `===`)
```ts
if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
```
**Pourquoi** : empêche timing attacks sur la comparaison de signature (même si marginal sur HMAC, c'est l'habitude correcte).

### 12. Bug NaN corrigé en cours de Rail 4a
Premier draft avait `const days = ttlDays ?? Number(process.env.SESSION_TTL_DAYS) ?? DEFAULT_TTL_DAYS;`. Problème : `Number(undefined) = NaN` et `NaN ?? DEFAULT` ne coalesce pas (nullish coalescing n'agit que sur `null`/`undefined`, pas `NaN`). Résultat : `Max-Age=NaN` dans le cookie, rejeté par le browser, logout silencieux au reload.

**Fix** :
```ts
const envDays = Number(process.env.SESSION_TTL_DAYS);
const days = ttlDays ?? (Number.isFinite(envDays) && envDays > 0 ? envDays : DEFAULT_TTL_DAYS);
```

**Regression guard** : test `expiresAt is a finite number (no NaN leak) — regression guard` dans `auth-session.test.ts`.

---

## Fichiers livrés

### Nouveaux (Phase E)
- `engine/db/migrate-auth.ts` — migration idempotente (CREATE TABLE IF NOT EXISTS)
- `engine/auth/session.ts` — sign/verify + cookie headers (HMAC-SHA256)
- `engine/auth/magic-link.ts` — createMagicLink + consumeMagicLink (atomic one-shot)
- `engine/auth/access.ts` — getAccessScope, grantAccess, revokeAccess, listAccess
- `engine/auth/resend.ts` — sendMagicLink wrapper Resend avec noop fallback
- `engine/auth/middleware.ts` — requireHubAuth + optionalHubAuth (Express)
- `scripts/seed-auth.ts` — seed initial (`--dry` / `--write` / `--list`)
- `engine/__tests__/auth-session.test.ts` — 10 tests HMAC + cookie + NaN regression
- `engine/__tests__/auth-universe-filter.test.ts` — 5 tests pure function scope
- `engine/__tests__/auth-integration.test.ts` — 13 tests DB (magic-link lifecycle + access scope)
- `frontend/login.html` — UI login magic-link + gestion `?error=`
- `docs/ONBOARDING_EXTERNE.md` — procédure onboarding admin externe
- `docs/PHASE_E_RESULTS.md` — ce document

### Modifiés (Phase E)
- `engine/db/schema.ts` — ajout `podcastAccess` + `magicLink`
- `engine/api.ts` — 4 endpoints auth + protection `/api/universe` + `filterUniverseByTenants`
- `frontend/hub.html` — détection 401/403, header session, logout, edge case 0 podcasts
- `vercel-configs/vercel-hub.json` — `/login` → `frontend/login.html`
- `.env.example` — RESEND_API_KEY, AUTH_FROM_EMAIL, AUTH_BASE_URL, SESSION_SECRET, SESSION_TTL_DAYS
- `docs/DETTE.md` — section Phase E (scope produit + absorption dashboards P2)

---

## Tests (28 nouveaux, 214/214 total green)

### `auth-session.test.ts` (10, pure unit, sans DB)
- sign → verify roundtrip
- verify rejects tampered signature
- verify rejects tampered email (signature OK mais email différent)
- verify rejects expired session
- verify rejects malformed cookie (undefined, empty, wrong part count)
- readCookie extrait `hub_session` depuis header Cookie
- cookieSetHeader / cookieClearHeader format
- normalise email lowercase+trim at sign
- expiresAt is a finite number (no NaN leak) — regression guard
- respects SESSION_TTL_DAYS env var when set

### `auth-universe-filter.test.ts` (5, pure function)
- keeps all tenants when allowed=all
- filters to 1 tenant (appearances autres tenants retirées)
- filters to 2 tenants (pairStats gardées seulement si from+to dans set)
- returns empty podcasts when 0 allowed
- recomputes totals after filter

### `auth-integration.test.ts` (13, skippé si DATABASE_URL absent)
- magic-link : create → consume roundtrip
- magic-link : refuse already-consumed token (one-shot)
- magic-link : refuse unknown token
- magic-link : refuse expired token
- magic-link : refuse malformed token
- magic-link : email lowercased+trimmed at creation
- access : returns empty tenantIds for unknown email
- access : returns 1 tenant for email with 1 grant
- access : returns N tenants for email with N grants
- access : detects root via tenant_id='*' + role='root'
- access : grantAccess idempotent (UPSERT on conflict)
- access : revokeAccess removes the row
- access : email lowercased+trimmed at grant + lookup

### Smoke test prod (12/12, manuel post-deploy Rail 4b)
Scénarios testés sur https://ms-hub.vercel.app le 24/04/26 après deploy `dpl_AcDzJ1GxBYerKDRsGVMiTpXx6JwW` :
1. `/api/universe` sans cookie → 401 ✅
2. `/login` → HTML login.html ✅
3. `/` → hub.html 200 ✅
4. `/api/auth/me` sans cookie → `{authenticated:false}` ✅
5. POST `/api/auth/request-link` → `{provider:"noop"}` (RESEND_API_KEY pas encore set) ✅
6. GET `/api/auth/consume?token=...` → `{ok, isRoot:true}` ✅
7. Cookie `hub_session` Set-Cookie HttpOnly + Secure ✅
8. `/api/universe` avec cookie → 200 ✅
9. `/api/auth/me` avec cookie → authenticated:true ✅
10. POST `/api/auth/logout` → 200 + Max-Age=0 ✅
11. `/api/universe` après logout → 401 ✅
12. Consume 2e fois même token → 400 `invalid_or_expired_token` (one-shot) ✅

---

## Ce qui manque (pré-go external)

1. **Configurer `RESEND_API_KEY`** + `SESSION_SECRET` + `AUTH_BASE_URL` + `AUTH_FROM_EMAIL` sur Vercel projet `ms-hub`.
2. **Redeploy hub** pour picker les env vars (`npm run deploy:hub`).
3. **Smoke test admin** end-to-end : reception email Gmail réel, consume via link, atterrissage hub, logout.
4. **Décider scope Matthieu Stefani** : root (visibilité univers complet) ou scoped `[lamartingale, gdiy]` (2 podcasts qu'il anime). Documenté dans `DETTE.md`.
5. **Seed initial admins externes** via `scripts/seed-auth.ts --write` (étape `scripts/seed-auth.ts` a la note "seed uniquement l'admin root en Phase 4a").

Une fois ces 5 étapes validées, Phase E est close end-to-end en prod et on peut notifier Orso/Matthieu.

---

## Rappel aux futurs utilisateurs

### Invalider toutes les sessions en un coup
Régénérer `SESSION_SECRET` sur Vercel + redeploy. **Nuke scenario uniquement** (incident sécu, leak de secret).

### Rotation périodique du SESSION_SECRET
Pas requis par défaut (cookie HMAC-SHA256 solide). Si souhaité : prévoir un grace period (double-secret avec fallback) — **non implémenté**, à coder en Phase F si besoin.

### Monitoring
Aucun en place en Phase E. À prévoir si volumes montent :
- Log des consume réussis / failed
- Alerte si > N failed consumes sur un email (bruteforce)
- Métrique latence Resend

### Future Phase F+ post-4b
- Absorption dashboards per-tenant dans le hub (Option Beta, DETTE P2)
- Page admin UI pour gérer `podcast_access` sans toucher à SQL (nice-to-have)
- Rate limiting sur `/api/auth/request-link` (anti-spam)
- Double-secret grace period pour SESSION_SECRET rotation
