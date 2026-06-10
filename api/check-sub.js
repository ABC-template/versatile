//import { validateTelegramInitData } from './_lib/telegram-auth.js';
export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return new Response(JSON.stringify({ error: 'Missing userId' }), { status: 400 });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&select=*&limit=1`, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ active: false, reason: 'Database check failed' }), { status: 200 });
    }

    const data = await response.json();
    const subscription = data[0];

    if (!subscription) {
      return new Response(JSON.stringify({ active: false, msg: 'No subscription found' }), { status: 200 });
    }

    const now = new Date();
    const isExpired = subscription.expires_at ? new Date(subscription.expires_at) < now : false;

    return new Response(JSON.stringify({
      active: subscription.status === 'active' && !isExpired,
      subscription
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
