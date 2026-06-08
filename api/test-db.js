export const config = { runtime: 'edge' };

export default async function handler(request) {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey = process.env.SUPABASE_ANON_KEY?.trim();
  const botToken = process.env.BOT_TOKEN?.trim();
  
  // Попробуем вставить тестового пользователя (замените telegram_id на свой)
  const testUserId = 1541531808; // ваш ID
  
  const rpcUrl = `${supabaseUrl}/rest/v1/rpc/set_app_user_id`;
  await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ uid: testUserId })
  });
  
  // Попробуем создать чат
  const chatId = 'test_' + Date.now();
  const createChat = await fetch(`${supabaseUrl}/rest/v1/chats`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: chatId,
      user_id: testUserId,
      topic_id: 'test',
      title: 'Test Chat',
      max_context: 15,
      user_renamed: false,
    })
  });
  const chatResult = await createChat.text();
  
  return new Response(JSON.stringify({ chatResult, status: createChat.status }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
