# Onboarding admin externe — Hub créateur Univers MS

Procédure pour ajouter un accès créateur (Matthieu Stefani, équipes Orso Media / Cosa Vostra / Gokyo, ou tout autre admin externe) au hub `https://ms-hub.vercel.app` après Phase E (Rails 4a + 4b).

**Statut actuel (24/04/26)** : seul `jeremyhenry974@gmail.com` est seedé (`role=root`). Aucune décision n'a encore été prise sur la granularité à donner aux admins externes (cf. DETTE.md section "Scope produit à trancher avant onboarding externe").

---

## Prérequis

### Infrastructure (one-shot, fait une seule fois avant le premier onboarding)

1. **Compte Resend créé + domaine DNS vérifié**
   - Compte sur https://resend.com (free tier : 3 000 emails/mois, largement suffisant pour des magic-links créateur).
   - Si on reste sur `AUTH_FROM_EMAIL=onboarding@resend.dev` : aucune config DNS, le mail part du domaine par défaut de Resend (watermark visible dans Gmail mais fonctionnel).
   - Si on passe sur un domaine perso (ex: `auth@universe-ms.io`) : ajouter SPF + DKIM dans le DNS du domaine, vérifier dans Resend → "Domains", attendre propagation (~5 min).

2. **Env vars Vercel configurées sur `ms-hub`** (dashboard Vercel → Settings → Environment Variables, scope "Production" au minimum) :
   - `RESEND_API_KEY=re_xxxxxxxxxxxx` — requis pour passer du mode `noop` à envoi réel.
   - `SESSION_SECRET=<32+ chars random>` — `openssl rand -hex 32`. **Ne jamais le régénérer en prod** sans prévenir : ça invalide toutes les sessions actives.
   - `AUTH_BASE_URL=https://ms-hub.vercel.app` — embarqué dans les magic-links. Garantit HTTPS en prod (autodetect headers sinon).
   - `AUTH_FROM_EMAIL=onboarding@resend.dev` (ou domaine perso vérifié).
   - Optionnel : `SESSION_TTL_DAYS=30` (défaut 30j).

3. **Redeploy hub après ajout des env vars** :
   ```bash
   npm run deploy:hub
   ```
   Les env vars Vercel ne sont pas picker par les deploys existants — redeploy obligatoire.

### Check de validation pré-onboarding

Avant chaque ajout d'admin externe, vérifier que l'infra est opérationnelle :

```bash
# 1. Resend vivant (pas en noop) — check via l'API hub
curl -s -X POST https://ms-hub.vercel.app/api/auth/request-link \
  -H "Content-Type: application/json" \
  -d '{"email":"jeremyhenry974@gmail.com"}'
# Attendu : {"ok":true,"sent":true,"provider":"resend"}
# Si "provider":"noop" → RESEND_API_KEY manquant côté Vercel.

# 2. Ton propre flow marche end-to-end (tu reçois le mail, consume, atterris sur hub).
```

---

## Scénarios d'onboarding

### Scénario A — Admin root (accès tous tenants)

Usage : personne de confiance qui doit voir l'univers complet (Matthieu Stefani si on tranche "root", toi-même, un futur co-owner).

```sql
-- Convention root : tenant_id='*' + role='root'
INSERT INTO podcast_access (email, tenant_id, role)
VALUES ('matthieu@exemple.fr', '*', 'root')
ON CONFLICT (email, tenant_id) DO UPDATE SET role = EXCLUDED.role;
```

Ou via helper TypeScript :

```bash
# Ajouter la ligne dans scripts/seed-auth.ts SEED[], puis :
npx tsx scripts/seed-auth.ts --list    # état actuel
npx tsx scripts/seed-auth.ts --write   # applique les inserts (idempotent)
```

### Scénario B — Admin scoped (liste explicite de tenants)

Usage : créateur/producteur qui n'a vocation à voir qu'un sous-ensemble de podcasts (ex: équipe Cosa Vostra qui gère GDIY uniquement).

```sql
-- Un INSERT par tenant autorisé.
INSERT INTO podcast_access (email, tenant_id, role) VALUES
  ('team@cosavostra.com', 'gdiy',         'viewer'),
  ('team@cosavostra.com', 'lamartingale', 'viewer')
ON CONFLICT (email, tenant_id) DO UPDATE SET role = EXCLUDED.role;
```

Le filtrage est serveur-side via `filterUniverseByTenants()` dans `engine/api.ts` : le hub ne renverra que les 2 podcasts autorisés dans la liste `podcasts`, les `pairStats` ne conserveront que les paires où `from` ET `to` sont dans le scope, les `episodeRefs` idem, et les `guests` cross-podcast ne garderont que les `appearances` matchant.

### Scénario C — Email équipe générique

Usage : label/agence qui partage un seul email de connexion (décision produit à valider avant usage, cf. DETTE).

Identique à Scénario B, avec un email `team@<label>.com` qui sert plusieurs personnes. Inconvénient : 1 cookie partagé, pas de tracking par personne. Avantage : onboarding simple.

---

## Procédure standard (checklist)

Pour chaque nouvel admin à onboarder :

1. **Recueillir l'email** du créateur (demander explicitement une adresse qu'il consulte, pas un alias abandonné).
2. **Décider scope** : root (Scénario A), scoped (B) ou équipe (C).
3. **Exécuter l'INSERT** via `scripts/seed-auth.ts` (recommandé pour audit) ou SQL direct sur Neon.
4. **Vérifier la ligne** :
   ```bash
   npx tsx scripts/seed-auth.ts --list
   ```
5. **Prévenir le créateur** par canal externe (SMS/WhatsApp/message direct) avec le lien `https://ms-hub.vercel.app/login` + 1-2 phrases :
   > Bonjour {name}, tu as désormais accès au hub de suivi cross-podcasts. Connexion magic-link (pas de mot de passe) : https://ms-hub.vercel.app/login — entre ton email, clique le lien reçu, tu atterris sur ton dashboard. Si tu ne reçois rien sous 2 min, vérifie tes spams.
6. **Smoke test à distance** (optionnel mais recommandé) : demander confirmation que le flow a marché de son côté avant de passer au suivant.

---

## Scénarios de test post-ajout

Avant de notifier l'admin externe, run ces 5 checks pour être sûr que son compte fonctionne :

### T1 — Magic link envoyé + reçu
```bash
curl -s -X POST https://ms-hub.vercel.app/api/auth/request-link \
  -H "Content-Type: application/json" \
  -d '{"email":"<email-admin>"}'
# Attendu : {"ok":true,"sent":true,"provider":"resend"}
```
Vérifier dans la boîte mail de l'admin (ou demander à l'admin de confirmer). Si `sent:false, provider:"noop"` → RESEND_API_KEY manquant.

### T2 — Callback consume → set-cookie
Ouvrir le lien reçu en mail dans un navigateur incognito. Attendu : redirect 302 vers `https://ms-hub.vercel.app/` avec Cookie `hub_session` HttpOnly + Secure + SameSite=Lax.

### T3 — Hub rendu avec son scope
Sur `ms-hub.vercel.app`, vérifier :
- Badge email en haut à droite affiche son email
- Badge ★ vert si `role=root`, sinon sans étoile
- Nombre de cards correspond au scope (N=6 si root, N=taille liste sinon)
- Pas d'erreur console JS

### T4 — Logout
Cliquer "Déconnexion" en haut à droite. Attendu : POST /api/auth/logout 200 → redirect `/login`. Reload `/` → redirect `/login` (plus de session).

### T5 — One-shot du magic link
Copier le lien reçu, le consommer 1ère fois (T2), puis re-cliquer le même lien. Attendu : 302 redirect vers `/login?error=invalid_or_expired_token` avec la bannière d'erreur visible côté page login.

---

## Rollback / révocation

### Révoquer un accès unique
```sql
-- Retire un tenant précis
DELETE FROM podcast_access WHERE email = 'admin@exemple.com' AND tenant_id = 'gdiy';
```

### Révoquer tous les accès d'un admin
```sql
DELETE FROM podcast_access WHERE email = 'admin@exemple.com';
```

L'admin sera redirigé vers `/login?error=no_access` à sa prochaine tentative (la session cookie reste valide côté client jusqu'à expiration, mais `/api/universe` renverra 403 avec 0 tenants scoped). Il peut forcer un logout immédiat en cliquant le bouton "Déconnexion".

### Révoquer une session active (nuke scenario)
Régénérer `SESSION_SECRET` sur Vercel + redeploy hub. **Invalide toutes les sessions actives** (tous les admins doivent se reconnecter). À utiliser uniquement en cas d'incident sécu (leak du secret).

### Lister l'état actuel
```bash
npx tsx scripts/seed-auth.ts --list
```
Ou SQL direct :
```sql
SELECT email, tenant_id, role, created_at FROM podcast_access ORDER BY email, tenant_id;
```

---

## Debugging

| Symptôme | Cause probable | Fix |
|---|---|---|
| `provider:"noop"` dans `/api/auth/request-link` | `RESEND_API_KEY` absent | Ajouter env var Vercel + redeploy |
| Email reçu mais lien donne 404 | `AUTH_BASE_URL` wrong ou manquant | Vérifier env var = `https://ms-hub.vercel.app` |
| Consume OK mais cookie pas set côté browser | Cookie bloqué par navigateur | Vérifier HTTPS actif, domaine match, pas d'extension anti-tracking agressive |
| `/api/universe` → 401 après consume | Cookie pas envoyé par le client | Vérifier `SameSite=Lax`, pas de fetch cross-origin |
| Hub affiche 0 podcasts malgré scope B | Scope email lowercase mismatch | DB stocke `lower(trim(email))` — re-check INSERT |
| Mail Resend atterrit en spam | Domaine `onboarding@resend.dev` ou DNS non vérifié | Passer sur domaine perso vérifié SPF+DKIM |

---

## Références

- Schema : `engine/db/schema.ts` (tables `podcast_access`, `magic_link`)
- Migration : `engine/db/migrate-auth.ts`
- Helpers accès : `engine/auth/access.ts` (`grantAccess`, `revokeAccess`, `getAccessScope`, `listAccess`)
- Seed : `scripts/seed-auth.ts`
- Middleware : `engine/auth/middleware.ts` (`requireHubAuth`, `optionalHubAuth`)
- Endpoints : `engine/api.ts` (`/api/auth/request-link`, `/api/auth/consume`, `/api/auth/logout`, `/api/auth/me`)
- Front : `frontend/login.html`, `frontend/hub.html`
- Synthèse Phase E : `docs/PHASE_E_RESULTS.md`
