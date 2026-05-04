// netlify/functions/notion-proxy.js
const COLABS_DB  = '3140d85775f7808cb7a2fbf080bd2df2';
const EVENTOS_DB = '25c0d85775f7805d864ae1f46e8dea82';
const BANCO_DB   = 'b6607b1caa7f4769af94f538170d6094';

exports.handler = async function(event) {
  const TOKEN = process.env.NOTION_TOKEN;

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return resp(200, {});
  }

  if (!TOKEN) {
    return resp(500, { error: 'NOTION_TOKEN não configurado no Netlify' });
  }

  // Aceita path via query string OU via body JSON
  let path = event.queryStringParameters?.path || '';
  if (!path && event.body) {
    try {
      const body = JSON.parse(event.body);
      path = body.path || '';
    } catch(e) {}
  }
  path = path.replace(/^\//, '').trim();

  console.log('notion-proxy chamado com path:', path);

  try {
    // ── GET_COLABORADORES ──────────────────────────
    if (path === 'get_colaboradores') {
      const data = await nPost(TOKEN, `databases/${COLABS_DB}/query`, {
        filter: { and: [
          { property: 'Status do Colaborador', select: { equals: 'Ativo' } },
          { property: 'Departamento', select: { equals: 'Operacional' } }
        ]},
        sorts: [{ property: 'Nome', direction: 'ascending' }],
        page_size: 100
      });
      const colaboradores = (data.results || []).map(p => {
        const pr = p.properties || {};
        return {
          nome:   pr['Nome']?.title?.[0]?.plain_text || '',
          funcao: pr['Função']?.select?.name || '—',
          dept:   pr['Departamento']?.select?.name || 'Operacional'
        };
      }).filter(c => c.nome);
      return resp(200, { colaboradores, total: colaboradores.length });
    }

    // ── GET_EVENTOS ────────────────────────────────
    if (path === 'get_eventos') {
      const data = await nPost(TOKEN, `databases/${EVENTOS_DB}/query`, {
        filter: { or: [
          { property: 'Status do Evento', select: { equals: 'Confirmado' } },
          { property: 'Status do Evento', select: { equals: 'Em Andamento - Produtora' } }
        ]},
        sorts: [{ property: 'Data do Evento', direction: 'ascending' }],
        page_size: 50
      });
      const eventos = (data.results || []).map(p => {
        const pr = p.properties || {};
        return {
          nome:        pr['Evento']?.title?.[0]?.plain_text || '—',
          data:        pr['Data do Evento']?.date?.start || null,
          montagem:    pr['Montagem']?.date?.start || null,
          desmontagem: pr['Desmontagem']?.date?.start || null,
          status:      pr['Status do Evento']?.select?.name || '—'
        };
      });
      return resp(200, { eventos, total: eventos.length });
    }

    // ── GRAVAR_LANCAMENTO ──────────────────────────
    if (path === 'gravar_lancamento') {
      let b = {};
      try { b = JSON.parse(event.body || '{}'); } catch(e) {}
      await nPost(TOKEN, 'pages', {
        parent: { database_id: BANCO_DB },
        properties: {
          'Colaborador':        { title: [{ text: { content: b.colab || '' } }] },
          'Tipo':               { select: { name: b.tipo === 'folga' ? 'Folga' : 'Horas Trabalhadas' } },
          'Horas':              { number: Math.abs(b.delta || 0) },
          'Evento':             { rich_text: [{ text: { content: b.desc || '' } }] },
          'Data':               { date: { start: new Date().toISOString().split('T')[0] } },
          'Gestor Responsável': { rich_text: [{ text: { content: b.gestor || '—' } }] }
        }
      });
      return resp(200, { ok: true });
    }

    // ── PING (teste de conexão) ────────────────────
    if (path === 'ping' || path === '') {
      return resp(200, { ok: true, message: 'Proxy funcionando!', token_ok: !!TOKEN });
    }

    return resp(404, { error: `Rota desconhecida: "${path}". Rotas válidas: get_colaboradores, get_eventos, gravar_lancamento, ping` });

  } catch(err) {
    console.error('Erro no proxy:', err.message);
    return resp(500, { error: err.message });
  }
};

async function nPost(token, path, body) {
  const url = `https://api.notion.com/v1/${path}`;
  console.log('Chamando Notion:', url);
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Notion ${r.status}: ${text}`);
  return JSON.parse(text);
}

function resp(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    },
    body: JSON.stringify(body)
  };
}
