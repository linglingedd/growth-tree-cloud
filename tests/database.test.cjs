const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { PGlite } = require('@electric-sql/pglite');

const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '202610280001_growth_tree.sql'), 'utf8');
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';

test('account rows are isolated and analysis completes atomically', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
    `);
    await db.exec(migration);
    await db.query('insert into auth.users(id) values ($1), ($2)', [alice, bob]);
    const inserted = await db.query(
      'insert into public.growth_notes(user_id, day, text) values ($1, $2, $3) returning id',
      [alice, '2026-10-28', 'A private note']
    );
    const noteId = inserted.rows[0].id;

    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [bob]);
    await db.exec('set role authenticated');
    const otherNotes = await db.query('select id from public.growth_notes');
    assert.equal(otherNotes.rows.length, 0);
    await assert.rejects(
      db.query('insert into public.growth_notes(user_id, text) values ($1, $2)', [alice, 'Wrong owner']),
      /row-level security/i
    );

    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [alice]);
    await db.exec('set role authenticated');
    const ownNotes = await db.query('select id from public.growth_notes');
    assert.equal(ownNotes.rows.length, 1);

    await db.exec('reset role');
    const args = [alice, '2026-10-28', [noteId], 'Diary', { value: { insight: 'Insight', keyword: 'Value' } }, 'Warmth', 'One line'];
    await db.query(
      'select public.complete_growth_analysis($1, $2, $3::bigint[], $4, $5::jsonb, $6, $7)',
      [args[0], args[1], args[2], args[3], JSON.stringify(args[4]), args[5], args[6]]
    );
    const result = await db.query('select count(*)::int as n from public.growth_entries where user_id = $1', [alice]);
    const note = await db.query('select analyzed from public.growth_notes where id = $1', [noteId]);
    assert.equal(result.rows[0].n, 1);
    assert.equal(note.rows[0].analyzed, true);
  } finally {
    await db.close();
  }
});

test('history search filters by day and literal keyword within an account', async () => {
  const { keywordPattern } = await import('../supabase/functions/growth-tree/search.mjs');
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
    `);
    await db.exec(migration);
    await db.query('insert into auth.users(id) values ($1), ($2)', [alice, bob]);
    await db.query(`insert into public.growth_notes(user_id, day, text) values
      ($1, '2026-10-28', '工资提高 10%'),
      ($1, '2026-10-28', '普通记录'),
      ($1, '2026-10-29', '工资提高 10%'),
      ($2, '2026-10-28', '工资提高 10%')`, [alice, bob]);

    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [alice]);
    await db.exec('set role authenticated');
    const matches = await db.query(
      `select text from public.growth_notes where user_id = $1 and day = $2 and text ilike $3
       order by id desc limit 20 offset 0`,
      [alice, '2026-10-28', keywordPattern('10%')]
    );
    assert.deepEqual(matches.rows.map((row) => row.text), ['工资提高 10%']);
    const otherAccount = await db.query('select count(*)::int as n from public.growth_notes where user_id = $1', [bob]);
    assert.equal(otherAccount.rows[0].n, 0);
  } finally {
    await db.close();
  }
});
