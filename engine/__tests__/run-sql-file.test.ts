import { describe, it, expect } from 'vitest';
import { parseSqlStatements } from '@engine/db/run-sql-file';

describe('parseSqlStatements', () => {
  it('parses a simple CREATE TABLE statement', () => {
    const sql = `CREATE TABLE foo (id INT);`;
    expect(parseSqlStatements(sql)).toEqual(['CREATE TABLE foo (id INT)']);
  });

  it('strips full-line comments before splitting (regression: migrate-entities bug)', () => {
    const sql = `-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : 2026-04-27 — Create entities
-- ─────────────────────────────────────────────────────────────────────────────
--
-- CONTEXTE blah blah
--

CREATE TABLE IF NOT EXISTS entities (
  id BIGSERIAL PRIMARY KEY
);

CREATE INDEX IF NOT EXISTS entities_idx ON entities (id);`;
    const result = parseSqlStatements(sql);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatch(/^CREATE TABLE IF NOT EXISTS entities/);
    expect(result[1]).toMatch(/^CREATE INDEX IF NOT EXISTS entities_idx/);
  });

  it('strips block comments /* ... */', () => {
    const sql = `/* leading block comment */
CREATE TABLE foo (id INT);
/* between */
CREATE INDEX foo_idx ON foo (id);`;
    const result = parseSqlStatements(sql);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatch(/^CREATE TABLE foo/);
    expect(result[1]).toMatch(/^CREATE INDEX foo_idx/);
  });

  it('handles trailing semicolons and blank lines', () => {
    const sql = `CREATE TABLE foo (id INT);


CREATE INDEX foo_idx ON foo (id);

`;
    expect(parseSqlStatements(sql)).toHaveLength(2);
  });

  it('handles missing trailing semicolon on the last statement', () => {
    const sql = `CREATE TABLE foo (id INT);
CREATE INDEX foo_idx ON foo (id)`;
    expect(parseSqlStatements(sql)).toHaveLength(2);
  });

  it('returns empty array for whitespace-only input', () => {
    expect(parseSqlStatements('\n\n\t')).toEqual([]);
  });

  it('returns empty array for comments-only input', () => {
    expect(parseSqlStatements('-- only a comment\n-- and another')).toEqual([]);
  });

  it('preserves multi-line statement content', () => {
    const sql = `CREATE TABLE editorial_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);`;
    const result = parseSqlStatements(sql);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('editorial_events');
    expect(result[0]).toContain('JSONB NOT NULL');
  });

  it('regression: real migrate-entities content yields 3 statements', () => {
    // Reproduces the structure of 2026-04-27-create-entities.sql to confirm
    // the wrapper was indeed dropping statement 1 before the fix.
    const sql = `-- header comment block 1
-- header comment block 2
--
-- CONTEXTE
-- ────

CREATE TABLE IF NOT EXISTS entities (
  id              BIGSERIAL PRIMARY KEY,
  entity_type     TEXT NOT NULL,
  CONSTRAINT entities_type_check CHECK (entity_type IN ('person', 'organization'))
);

CREATE INDEX IF NOT EXISTS entities_type_idx ON entities (entity_type);
CREATE INDEX IF NOT EXISTS entities_slug_idx ON entities (canonical_slug);`;
    const result = parseSqlStatements(sql);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatch(/^CREATE TABLE/);
    expect(result[1]).toMatch(/entities_type_idx/);
    expect(result[2]).toMatch(/entities_slug_idx/);
  });

  it('legacy ad-hoc parser would have dropped statement 1 (witness)', () => {
    // Prove that the OLD parser (split on ;\n then filter startsWith('--'))
    // would drop the first statement on this content. Witness test only —
    // does not run the broken parser, just demonstrates that our new
    // parser correctly handles a case that broke before.
    const sql = `-- header
CREATE TABLE foo (id INT);
CREATE INDEX foo_idx ON foo (id);`;

    // Simulate broken parser
    const broken = sql
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));
    expect(broken).toHaveLength(1); // ← only CREATE INDEX survives, CREATE TABLE dropped

    // New parser: both statements survive
    const fixed = parseSqlStatements(sql);
    expect(fixed).toHaveLength(2);
  });
});
