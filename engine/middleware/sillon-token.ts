/**
 * Sillon preview token middleware — Phase Alpha T1.3 (29/04/2026).
 *
 * Auth-gate basique pour la preview pilote (avant magic-link Resend
 * en Phase Beta 1). Header `X-Sillon-Token` validé contre la liste CSV
 * `SILLON_PREVIEW_TOKENS` (env var).
 *
 * SÉCURITÉ — le token doit être transmis EXCLUSIVEMENT via le header
 * HTTP `X-Sillon-Token`, JAMAIS en query string. Une transmission
 * en query string fuite le secret dans :
 *   - les logs Vercel/Nginx/CDN (URL loggées en clair),
 *   - le header Referer envoyé aux pages tierces et à Google Fonts,
 *   - l'historique navigateur,
 *   - les bookmarks et le copier-coller d'URL.
 * Aucun fallback query string n'est implémenté ni ne doit l'être.
 *
 * Patterns :
 *  - identifySillonToken : soft-check, set req.sillonToken si valide,
 *    next() inconditionnel. À chaîner AVANT le rate-limit pour
 *    bénéficier du quota trusted.
 *  - requireSillonToken  : hard-gate, 401 si pas de token valide.
 *    À chaîner APRÈS le rate-limit (pour que les bots sans token
 *    consomment quand même le quota IP).
 */

import type { Request, Response, NextFunction } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      sillonToken?: string;
    }
  }
}

function validTokens(): string[] {
  const raw = process.env.SILLON_PREVIEW_TOKENS || '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function readHeader(req: Request): string | null {
  const h = req.headers['x-sillon-token'];
  if (typeof h === 'string') return h;
  if (Array.isArray(h)) return h[0] ?? null;
  return null;
}

export function identifySillonToken(req: Request, _res: Response, next: NextFunction): void {
  const tok = readHeader(req);
  if (tok && validTokens().includes(tok)) {
    req.sillonToken = tok;
  }
  next();
}

export function requireSillonToken(req: Request, res: Response, next: NextFunction): void {
  if (req.sillonToken) return next();
  const tok = readHeader(req);
  if (tok && validTokens().includes(tok)) {
    req.sillonToken = tok;
    return next();
  }
  res.status(401).json({
    error: 'auth_required',
    message: 'Header X-Sillon-Token requis (preview pilote).',
  });
}
