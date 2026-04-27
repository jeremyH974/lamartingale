/**
 * run-sql-file — Utilitaire commun pour appliquer un fichier SQL idempotent
 * via Neon HTTP. Remplace le parser ad-hoc défaillant qui était dans
 * migrate-entities.ts avant 2026-04-28.
 *
 * Bug corrigé (cf. docs/DETTE.md, section "Phase 2 architecturale") :
 *   L'ancien parser splittait le fichier sur `;\n` puis filtrait
 *   `!stmt.startsWith('--')`. Conséquence : si le premier statement était
 *   précédé d'un en-tête de commentaires (cas standard de toutes nos
 *   migrations), le bloc complet (commentaires + CREATE TABLE) commençait
 *   par `--` et était SKIP. La migration entities est passée à côté du
 *   wrapper et a été appliquée via un one-shot `npx tsx -e`.
 *
 * Le parser corrigé strippe les commentaires LIGNE PAR LIGNE avant le
 * split, puis split sur `;`. Plus robuste, plus simple, plus prévisible.
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

/**
 * Parse un contenu SQL en statements exécutables.
 *
 * Étapes :
 *   1. Strip lignes de commentaires SQL (lignes commençant par `--`).
 *   2. Strip blocs de commentaires `/* ... *​/`.
 *   3. Split sur `;`.
 *   4. Trim + filtre vides.
 *
 * Limites connues (acceptables pour nos migrations DDL idempotentes) :
 *   - Ne gère pas les `;` à l'intérieur de strings PL/pgSQL ($$...$$).
 *     Si un jour une migration utilise des fonctions PL/pgSQL, il faudra
 *     un vrai parser. Aujourd'hui : pas le cas.
 *   - Ne gère pas les commentaires en fin de ligne après code SQL
 *     (`SELECT 1; -- inline`). Acceptable car nos migrations ne mélangent
 *     pas code et commentaires sur la même ligne.
 */
export function parseSqlStatements(sqlContent: string): string[] {
  const linesNoLineComment = sqlContent
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  const noBlockComments = linesNoLineComment.replace(/\/\*[\s\S]*?\*\//g, '');

  return noBlockComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export interface RunSqlFileOptions {
  /** Chemin absolu du fichier SQL à exécuter. */
  sqlPath: string;
  /** Si true, ne fait QUE parser et logger les statements (pas d'exec DB). */
  dryRun?: boolean;
  /** Logger custom (par défaut : console.log). */
  logger?: (msg: string) => void;
}

export interface RunSqlFileResult {
  statementsExecuted: number;
  statementsParsed: number;
  dryRun: boolean;
}

/**
 * Lit un fichier SQL et exécute ses statements via Neon HTTP, séquentiellement.
 *
 * Usage migration idempotente type :
 *   await runSqlFile({ sqlPath: 'engine/db/migrations/2026-XX-create-foo.sql' });
 *
 * Pour un dry-run sans exec :
 *   await runSqlFile({ sqlPath: '...', dryRun: true });
 */
export async function runSqlFile(opts: RunSqlFileOptions): Promise<RunSqlFileResult> {
  const log = opts.logger ?? ((m: string) => console.log(m));
  const dryRun = opts.dryRun ?? false;

  if (!process.env.DATABASE_URL) {
    throw new Error('runSqlFile: DATABASE_URL is not set');
  }

  const content = readFileSync(opts.sqlPath, 'utf-8');
  const statements = parseSqlStatements(content);

  log(`[RUN-SQL-FILE] ${opts.sqlPath}`);
  log(`[RUN-SQL-FILE] Parsed ${statements.length} statement(s)`);

  if (dryRun) {
    statements.forEach((s, i) => {
      const preview = s.replace(/\s+/g, ' ').slice(0, 120);
      log(`  [dry] stmt[${i + 1}] = ${preview}${s.length > 120 ? '…' : ''}`);
    });
    return {
      statementsExecuted: 0,
      statementsParsed: statements.length,
      dryRun: true,
    };
  }

  const sql = neon(process.env.DATABASE_URL);
  let executed = 0;
  for (const stmt of statements) {
    await sql.query(stmt);
    executed++;
    const preview = stmt.replace(/\s+/g, ' ').slice(0, 80);
    log(`  [ok]  stmt[${executed}/${statements.length}] = ${preview}${stmt.length > 80 ? '…' : ''}`);
  }

  return {
    statementsExecuted: executed,
    statementsParsed: statements.length,
    dryRun: false,
  };
}
