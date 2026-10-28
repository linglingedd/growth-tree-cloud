// 六维觉察的 AI 层：提示词与 Python 版 ai.py 保持一致，调用 DeepSeek 兼容接口。
export const BRANCHES = [
  { key: 'value',    name: '价值与需要', desc: '我真正看重什么、渴望被满足什么' },
  { key: 'emotion',  name: '情绪与身体', desc: '情绪起伏与身体信号在替我说什么' },
  { key: 'relation', name: '关系',       desc: '我与他人的连接、我在关系里的位置' },
  { key: 'thinking', name: '思维习惯',   desc: '我如何解释事情、有哪些自动化念头' },
  { key: 'action',   name: '行动与选择', desc: '我做了什么、回避了什么、真实动力是什么' },
  { key: 'meaning',  name: '成长与意义', desc: '它把我带向哪里、我看见自己哪一面' },
];

export function buildPrompt(text, history) {
  var head = [
    '# 角色',
    '你是一位温和、敏锐、不说教的自我觉察教练。你擅长从一个人朴素、零散的日常记录里，看见他自己还没看见的那一面。',
    '',
    '# 任务',
    '下面是我今天的「自我觉察打卡」记录（由我随时随地的碎片速记拼成，可能零散、口语化）。' +
      '请你从六个维度提炼关于「我」的洞察，并找出那个可能被我自己忽略、微小却动人的瞬间。',
    '',
  ];

  if (history && history.length) {
    var lines = [];
    for (var i = 0; i < history.length; i++) {
      var e = history[i];
      for (var k = 0; k < BRANCHES.length; k++) {
        var b = BRANCHES[k];
        var it = (e.branches || {})[b.key];
        if (it && it.insight) {
          var s = String(it.insight);
          if (s.length > 42) s = s.slice(0, 42) + '…';
          lines.push('- ' + e.date + ' · ' + b.name + (it.keyword ? '（' + it.keyword + '）' : '') + '：' + s);
        }
      }
    }
    if (lines.length) {
      head = head.concat([
        '# 关于我，你此前已经看见过这些（由旧到新）',
        lines.join('\n'),
        '',
        '请特别留意：如果今天的发现和上面某一条形成了**重复出现的模式**，' +
          '请在对应维度的 insight 里温和地指出来（例如「这和你上次……很像」）。' +
          '看见自己的循环，比看见单件事重要得多。',
        '',
      ]);
    }
  }

  head.push('# 六个维度');
  for (var n = 0; n < BRANCHES.length; n++) {
    var bb = BRANCHES[n];
    head.push((n + 1) + '. ' + bb.key + ' ' + bb.name + ' —— ' + bb.desc);
  }

  head = head.concat([
    '',
    '# 写作要求',
    '- 每个维度用第二人称「你」，一句话，30-60 字。具体、克制，必须从记录的细节出发，不要泛泛而谈。',
    '- 不评判、不给建议、不灌鸡汤。你是一面清晰而温柔的镜子。',
    '- 每个维度额外配一个 2-5 字的关键词（keyword），作为这根树枝上的叶子。',
    '- 如果今天在某个维度上确实没什么可说的，该维度的 insight 填 null，不要硬编。',
    '',
    '# 额外的寻找',
    '再从记录里找出一个「被写下来、却可能被我自己忽略的、微小但动人的瞬间」——' +
      '可能是一句别人的话、一个动作、一点天气、一个念头。用 warmth 字段记录，一两句话。没有就填 null。',
    '',
    '# 最后',
    '给一句 oneLine：写给今天的一句话，不超过 20 字，温柔、有力量。',
    '',
    '# 输出格式',
    '只输出如下 JSON，不要任何解释、不要 markdown 代码块：',
    '{"branches":{"value":{"insight":"","keyword":""},"emotion":{"insight":null,"keyword":null},' +
      '"relation":{"insight":"","keyword":""},"thinking":{"insight":"","keyword":""},' +
      '"action":{"insight":"","keyword":""},"meaning":{"insight":"","keyword":""}},"warmth":"","oneLine":""}',
    '',
    '# 我今天的记录',
    text,
  ]);

  return head.join('\n');
}

export function extractJson(s) {
  var t = String(s || '').trim();
  ['```json', '```JSON', '```'].forEach(function (f) {
    if (t.indexOf(f) === 0) t = t.slice(f.length).trim();
  });
  if (t.slice(-3) === '```') t = t.slice(0, -3).trim();
  var a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  return JSON.parse(t);
}

export function normalize(obj) {
  if (!obj) return null;
  var bs = obj && typeof obj === 'object' ? obj.branches : null;
  if (!bs || typeof bs !== 'object') bs = obj && typeof obj === 'object' ? obj : {};
  var out = { branches: {}, warmth: null, oneLine: '' };
  var got = false;
  for (var i = 0; i < BRANCHES.length; i++) {
    var key = BRANCHES[i].key;
    var it = bs[key];
    var ins = '', kw = '';
    if (typeof it === 'string') ins = it;
    else if (it && typeof it === 'object') {
      ins = it.insight || it.text || '';
      kw = it.keyword || it.kw || '';
    }
    if (ins && String(ins).trim()) {
      got = true;
      out.branches[key] = { insight: String(ins).trim(), keyword: String(kw || '').trim() };
    }
  }
  if (!got) return null;
  var w = obj && obj.warmth;
  out.warmth = w && String(w).trim() ? String(w).trim() : null;
  out.oneLine = obj && obj.oneLine ? String(obj.oneLine).trim() : '';
  return out;
}

export async function analyze(env, text, history) {
  var key = env.DEEPSEEK_KEY;
  if (!key) throw new Error('服务端未配置 DEEPSEEK_KEY');
  var base = (env.AI_BASE || 'https://api.deepseek.com/v1').replace(/\/$/, '');
  var payload = {
    model: env.AI_MODEL || 'deepseek-chat',
    temperature: 0.7,
    messages: [{ role: 'user', content: buildPrompt(text, history) }],
    response_format: { type: 'json_object' },
  };

  var r = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    var t = await r.text();
    throw new Error('AI 接口返回 ' + r.status + '：' + t.slice(0, 200));
  }

  var j = await r.json();
  var content = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  if (!content) throw new Error('AI 返回结构异常');

  var parsed;
  try {
    parsed = normalize(extractJson(content));
  } catch (e) {
    throw new Error('AI 返回的不是合法 JSON：' + String(content).slice(0, 200));
  }
  if (!parsed) throw new Error('AI 没给出任何维度的洞察');
  return parsed;
}

export function formatReceipt(dayText, noteCount, data, isBacklog) {
  var lines = ['🌳 **' + dayText + ' 的觉察' + (isBacklog ? '（补分析）' : '') + ' · 来自 ' + noteCount + ' 条速记**', ''];
  for (var i = 0; i < BRANCHES.length; i++) {
    var b = BRANCHES[i];
    var it = (data.branches || {})[b.key];
    if (it && it.insight) {
      lines.push('**' + b.name + '**' + (it.keyword ? '· ' + it.keyword : '') + ' ' + it.insight);
    } else {
      lines.push('**' + b.name + '** ——（今天没什么）');
    }
  }
  if (data.warmth) lines.push('', '💌 ' + data.warmth);
  if (data.oneLine) lines.push('', '—— ' + data.oneLine);
  return lines.join('\n');
}
