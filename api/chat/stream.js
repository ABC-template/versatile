// api /chat /stream.js 
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { messages, userId, chatId } = await req.json();

    const result = await streamText({
      model: openai('gpt-4o'),
      messages,
      async onFinish({ text }) {
        if (chatId && userId) {
          const SUPABASE_URL = process.env.SUPABASE_URL;
          const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

          await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              chat_id: chatId,
              user_id: userId,
              role: 'assistant',
              content: text,
              created_at: new Date().toISOString()
            })
          }).catch(err => console.error('Failed to save assistant message:', err));
        }
      }
    });

    return result.toDataStreamResponse();
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
