// netlify/functions/notion-proxy.js
// Proxy entre o HTML e a API do Notion — resolve o problema de CORS

exports.handler = async function(event, context) {
  const NOTION_TOKEN = process.env.NOTION_TOKEN;

  if (!NOTION_TOKEN) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "NOTION_TOKEN não configurado nas variáveis de ambiente do Netlify" })
    };
  }

  // Monta o path da API do Notion a partir da URL chamada
  // Ex: /notion/databases/xxx/query → https://api.notion.com/v1/databases/xxx/query
  const notionPath = event.path.replace('/.netlify/functions/notion-proxy', '').replace('/notion', '');

  const notionUrl = `https://api.notion.com/v1${notionPath}`;

  try {
    const response = await fetch(notionUrl, {
      method: event.httpMethod,
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: event.body || undefined
    });

    const data = await response.json();

    return {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
