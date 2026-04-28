/**
 * Auth middleware — requireHubAuth + optionalHubAuth.
 *
 * Protège les endpoints du hub (/api/universe + futurs endpoints admin).
 * Les sous-sites auditeur (/api/episodes, /api/chat, etc.) restent publics.
 *
 * Flux :
 *   1. Lire cookie `hub_session` → vérifier signature HMAC
 *   2. Si invalide/absent → 401 (requireHubAuth) ou req.session=null (optionalHubAuth)
 *   3. Si valide → req.session = { email, expiresAt }
 *      puis fetch getAccessScope(email) → req.accessScope = { isRoot, tenantIds }
 */

import type { Request, Response, NextFunction } from 'express';
import { verify, readCookie, type Session } from './session';
import { getAccessScope, type AccessScope } from './access';

// Augment Express Request (module augmentation sans modifier express types globaux).
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: Session | null;
      accessScope?: AccessScope | null;
    }
  }
}

function extractSession(req: Request): Session | null {
  const cookieHeader = req.headers.cookie;
  const raw = readCookie(cookieHeader);
  return verify(raw);
}

/**
 * Endpoint protégé : 401 si pas de session valide.
 * Les endpoints avec scoping par tenant appellent getAccessScope côté handler.
 */
export async function requireHubAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Phase Scénario B M1 validation (2026-04-28) — bypass auth hub temporaire
  // sur preview Vercel pour itérer le visuel sans flow magic-link à chaque
  // redeploy. Set env var AUTH_BYPASS_PREVIEW=true SEULEMENT sur Preview.
  // À RETIRER post-validation (commit séparé). Ne PAS setter en Production.
  if (process.env.AUTH_BYPASS_PREVIEW === 'true') {
    req.session = { email: 'preview-bypass@scenario-b.local' } as any;
    req.accessScope = { isRoot: true, tenantIds: [] } as any;
    return next();
  }
  const sess = extractSession(req);
  if (!sess) {
    res.status(401).json({ error: 'auth_required', message: 'Connexion requise' });
    return;
  }
  req.session = sess;
  try {
    req.accessScope = await getAccessScope(sess.email);
  } catch (e: any) {
    console.error('[auth] getAccessScope failed:', e.message);
    res.status(500).json({ error: 'auth_backend_error' });
    return;
  }
  // Si 0 accès + pas root → 403 (authentifié mais pas d'accès).
  if (!req.accessScope.isRoot && req.accessScope.tenantIds.length === 0) {
    res.status(403).json({ error: 'no_access', message: 'Aucun podcast autorisé pour ce compte' });
    return;
  }
  next();
}

/**
 * Endpoint admin-only : exige une session valide ET role=root (tenant_id='*').
 *
 * Pattern de composition : on ré-applique la logique de `requireHubAuth` plutôt
 * que de l'invoquer (Express ne permet pas de chaîner deux middlewares en un seul
 * sans router intermédiaire), puis on filtre sur `accessScope.isRoot`.
 *
 * 401 si pas de session, 403 si session valide mais pas root.
 * Réservé aux endpoints sensibles : POST /api/cache/clear, futur /api/admin/*.
 */
export async function requireRoot(req: Request, res: Response, next: NextFunction): Promise<void> {
  const sess = extractSession(req);
  if (!sess) {
    res.status(401).json({ error: 'auth_required', message: 'Connexion requise' });
    return;
  }
  req.session = sess;
  try {
    req.accessScope = await getAccessScope(sess.email);
  } catch (e: any) {
    console.error('[auth] getAccessScope (requireRoot) failed:', e.message);
    res.status(500).json({ error: 'auth_backend_error' });
    return;
  }
  if (!req.accessScope?.isRoot) {
    res.status(403).json({ error: 'root_required', message: 'Accès admin requis' });
    return;
  }
  next();
}

/**
 * Endpoint optionnellement authentifié : req.session=null si pas de cookie
 * (utilisé par /api/auth/me qui doit fonctionner même déconnecté).
 */
export async function optionalHubAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const sess = extractSession(req);
  req.session = sess;
  if (sess) {
    try {
      req.accessScope = await getAccessScope(sess.email);
    } catch (e: any) {
      console.error('[auth] getAccessScope (optional) failed:', e.message);
      req.accessScope = null;
    }
  } else {
    req.accessScope = null;
  }
  next();
}
