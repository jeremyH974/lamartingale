/**
 * Test léger MEDIUM-3 : la route static `/guest-brief/:slug` sert bien le HTML
 * de la page kit invité. Pas de tests visuels (Playwright hors scope) — on
 * vérifie juste le contrat HTTP : statut 200, content-type HTML, présence du
 * <title> attendu et du script de bootstrap qui lit le slug côté client.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import app from '../api';

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('server not bound');
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('GET /guest-brief/:slug — route static', () => {
  it('retourne 200 + HTML avec <title> attendu', async () => {
    const res = await fetch(`${baseUrl}/guest-brief/eric-larcheveque`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const body = await res.text();
    expect(body).toContain('<title>Brief invité — Univers MS</title>');
    // Le slug est lu côté JS depuis window.location — on vérifie que le
    // bootstrap est bien présent.
    expect(body).toContain('window.location.pathname');
    expect(body).toContain('/api/cross/guests/');
  });
});
