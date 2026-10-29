import { createClient } from 'npm:@supabase/supabase-js@2';
import { analyze, formatReceipt } from './ai.js';
import { keywordPattern } from './search.mjs';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const CRON_SECRET = Deno.env.get('GROWTH_TREE_CRON_SECRET') || '';
const ORIGIN = Deno.env.get('GROWTH_TREE_ORIGIN') || '*';
const ALLOWED_EMAILS = new Set((Deno.env.get('GROWTH_TREE_ALLOWED_EMAILS') || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
const env = {
  DEEPSEEK_KEY: Deno.env.get('DEEPSEEK_KEY') || '',
  AI_BASE: Deno.env.get('AI_BASE') || 'https://api.deepseek.com/v1',
  AI_MODEL: Deno.env.get('AI_MODEL') || 'deepseek-chat',
};
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store',
  } });
}
function dayNow() {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function pretty(day: string) {
  const [, month, date] = day.split('-');
  return `${Number(month)}月${Number(date)}日`;
}
function time(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}
function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
async function allRows(query: (from: number, to: number) => PromiseLike<{ data: Record<string, any>[] | null; error: { message: string } | null }>) {
  const rows: Record<string, any>[] = [];
  const pageSize = 500;
  while (true) {
    const page = check(await query(rows.length, rows.length + pageSize - 1)) || [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
function userClient(token: string) {
  return createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
}
function streak(days: string[], today: string) {
  const present = new Set(days);
  let cursor = new Date(`${today}T00:00:00Z`);
  if (!present.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let count = 0;
  while (present.has(cursor.toISOString().slice(0, 10))) {
    count++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return count;
}

async function tree(client: ReturnType<typeof createClient>, userId: string, email: string) {
  const day = dayNow();
  const entries = await allRows((from, to) => client.from('growth_entries').select('id,day,diary,branches,warmth,one_line')
    .eq('user_id', userId).order('day').order('id').range(from, to));
  const notes = await allRows((from, to) => client.from('growth_notes').select('day,analyzed')
    .eq('user_id', userId).order('id').range(from, to));
  const today = await allRows((from, to) => client.from('growth_notes').select('id,text,created_at,analyzed')
    .eq('user_id', userId).eq('day', day).order('id').range(from, to));
  const days = [...new Set(notes.map((n) => n.day))];
  return { ok: true, username: email, analyzeTime: '21:30',
    entries: entries.map((e) => ({ id: `e${e.id}`, day: e.day, date: pretty(e.day), text: e.diary,
      branches: e.branches, warmth: e.warmth, oneLine: e.one_line })),
    todayNotes: today.map((n) => ({ id: n.id, time: time(n.created_at), text: n.text, analyzed: n.analyzed })),
    stats: { totalNotes: notes.length, todayNotes: today.length, pending: notes.filter((n) => !n.analyzed).length,
      entries: entries.length, days: days.length, streak: streak(days, day) },
  };
}

async function analyzeDay(userId: string, day: string) {
  const notes = await allRows((from, to) => admin.from('growth_notes').select('id,text,created_at,analyzed')
    .eq('user_id', userId).eq('day', day).order('id').range(from, to));
  const pending = notes.filter((n) => !n.analyzed);
  if (!pending.length) return null;
  const diary = notes.map((n) => `[${time(n.created_at)}] ${n.text}`).join('\n');
  if (diary.length > 12000) throw new Error('待分析文字过长，请分段整理后再分析');
  const historyRows = check(await admin.from('growth_entries').select('day,branches').eq('user_id', userId)
    .order('day', { ascending: false }).limit(4));
  const history = historyRows.reverse().map((e) => ({ date: pretty(e.day), branches: e.branches }));
  const data = await analyze(env, diary, history);
  check(await admin.rpc('complete_growth_analysis', { p_user_id: userId, p_day: day,
    p_note_ids: pending.map((n) => n.id), p_diary: diary, p_branches: data.branches,
    p_warmth: data.warmth || '', p_one_line: data.oneLine || '' }));
  return { ok: true, day, receipt: formatReceipt(pretty(day), notes.length, data, day !== dayNow()) };
}

async function analyzePending(userId: string) {
  const pending = check(await admin.from('growth_notes').select('day').eq('user_id', userId)
    .eq('analyzed', false).order('day').limit(1));
  if (!pending.length) return { ok: false, msg: '没有待分析的记录' };
  return await analyzeDay(userId, pending[0].day) || { ok: false, msg: '没有待分析的记录' };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return response({ ok: true });
  const path = new URL(request.url).pathname.replace(/.*\/growth-tree/, '');
  try {
    if (path === '/api/cron' && request.method === 'POST') {
      if (!CRON_SECRET || request.headers.get('x-cron-secret') !== CRON_SECRET) return response({ ok: false, msg: 'Unauthorized' }, 401);
      const pending = check(await admin.from('growth_notes').select('user_id').eq('analyzed', false).limit(500));
      const users = [...new Set(pending.map((n) => n.user_id))].slice(0, 10);
      const result = [];
      for (const userId of users) {
        try {
          const { data: { user } } = await admin.auth.admin.getUserById(userId);
          if (user?.email && ALLOWED_EMAILS.has(user.email.toLowerCase())) result.push(await analyzePending(userId));
        }
        catch (error) { console.error('Scheduled analysis failed', userId, error); }
      }
      return response({ ok: true, processed: result.length });
    }
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return response({ ok: false, msg: '请登录' }, 401);
    const client = userClient(token);
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user) return response({ ok: false, msg: '登录已失效，请重新登录' }, 401);
    if (!user.email || !ALLOWED_EMAILS.has(user.email.toLowerCase())) return response({ ok: false, msg: '此邮箱尚未获准使用成长树' }, 403);
    if (path === '/api/me' && request.method === 'GET') return response({ ok: true, username: user.email });
    if (path === '/api/tree' && request.method === 'GET') return response(await tree(client, user.id, user.email || ''));
    if (path === '/api/notes' && request.method === 'GET') {
      const params = new URL(request.url).searchParams;
      const day = params.get('day') || '';
      const keyword = (params.get('q') || '').trim();
      const page = Number(params.get('page') || '1');
      if (day && (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`)) ||
        new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day)) {
        return response({ ok: false, msg: '日期格式不正确' }, 400);
      }
      if (keyword.length > 100 || !Number.isSafeInteger(page) || page < 1 || page > 10000) {
        return response({ ok: false, msg: '搜索条件不正确' }, 400);
      }
      const pageSize = 20;
      let query = client.from('growth_notes').select('id,day,text,created_at,analyzed', { count: 'exact' })
        .eq('user_id', user.id);
      if (day) query = query.eq('day', day);
      if (keyword) query = query.ilike('text', keywordPattern(keyword));
      const result = await query.order('day', { ascending: false }).order('created_at', { ascending: false })
        .order('id', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
      if (result.error) throw new Error(result.error.message);
      return response({ ok: true, page, pageSize, total: result.count || 0,
        notes: (result.data || []).map((n) => ({ id: n.id, day: n.day, time: time(n.created_at),
          text: n.text, analyzed: n.analyzed })) });
    }
    if (path === '/api/note' && request.method === 'POST') {
      const body = await request.json();
      const text = String(body.text || '').trim();
      if (!text || text.length > 5000) return response({ ok: false, msg: '每条记录须为 1 到 5000 字' }, 400);
      check(await client.from('growth_notes').insert({ user_id: user.id, day: dayNow(), text }));
      const result = await client.from('growth_notes').select('id', { count: 'exact', head: true })
        .eq('day', dayNow());
      if (result.error) throw new Error(result.error.message);
      return response({ ok: true, todayCount: result.count || 0 });
    }
    if (path === '/api/analyze' && request.method === 'POST') return response(await analyzePending(user.id));
    return response({ ok: false, msg: '未知接口' }, 404);
  } catch (error) {
    console.error(error);
    return response({ ok: false, msg: error instanceof Error ? error.message : '服务暂时不可用' }, 500);
  }
});
