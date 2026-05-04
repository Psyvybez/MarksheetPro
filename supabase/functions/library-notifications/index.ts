import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RegisterReservationContactPayload {
  reservationId: string;
  studentCardId: string;
  studentName: string;
  studentCardNumber: string;
  bookTitle: string;
  phoneNumber: string;
}

interface SendReadyNoticePayload {
  contactId: string;
  reservationId: string;
  studentName: string;
  bookTitle: string;
}

interface ContactRow {
  id: string;
  phone_hash: string;
  encrypted_phone: string;
  expires_at: string;
  consumed_at: string | null;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  });
}

async function hashPhone(phoneNumber: string): Promise<string> {
  const bytes = new TextEncoder().encode(phoneNumber);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function xorEncrypt(value: string, key: string): string {
  if (!key) {
    throw new Error('Missing ENCRYPTION_KEY in function environment.');
  }

  const input = new TextEncoder().encode(value);
  const secret = new TextEncoder().encode(key);
  const encrypted = input.map((byte, index) => byte ^ secret[index % secret.length]);
  return btoa(String.fromCharCode(...encrypted));
}

function xorDecrypt(value: string, key: string): string {
  if (!key) {
    throw new Error('Missing ENCRYPTION_KEY in function environment.');
  }

  const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  const secret = new TextEncoder().encode(key);
  const decrypted = bytes.map((byte, index) => byte ^ secret[index % secret.length]);
  return new TextDecoder().decode(decrypted);
}

function normalizePhone(phoneNumber: string): string {
  return phoneNumber.replace(/[^\d+]/g, '');
}

async function sendTwilioSms(to: string, message: string): Promise<void> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = Deno.env.get('TWILIO_FROM_NUMBER');

  if (!sid || !token || !from) {
    throw new Error('Missing Twilio configuration in environment variables.');
  }

  const body = new URLSearchParams({
    To: to,
    From: from,
    Body: message,
  });

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Twilio send failed: ${response.status} ${details}`);
  }
}

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  if (request.method !== 'POST') {
    return json(405, {
      error: 'Method not allowed',
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return json(500, {
        error: 'Missing Supabase service credentials.',
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const encryptionKey = Deno.env.get('ENCRYPTION_KEY') ?? '';

    const body = await request.json();
    const action = typeof body?.action === 'string' ? body.action : '';

    if (action === 'register_reservation_contact') {
      const payload = body?.payload as RegisterReservationContactPayload | undefined;
      if (!payload) {
        return json(400, {
          error: 'Missing payload',
        });
      }

      const normalizedPhone = normalizePhone(payload.phoneNumber);
      if (!normalizedPhone) {
        return json(400, {
          error: 'Phone number is required',
        });
      }

      const phoneHash = await hashPhone(normalizedPhone);
      const encryptedPhone = xorEncrypt(normalizedPhone, encryptionKey);
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

      const { data, error } = await supabase
        .from('reservation_notification_contacts')
        .insert({
          reservation_id: payload.reservationId,
          student_card_id: payload.studentCardId,
          student_name: payload.studentName,
          student_card_number: payload.studentCardNumber,
          book_title: payload.bookTitle,
          phone_hash: phoneHash,
          encrypted_phone: encryptedPhone,
          expires_at: expiresAt,
        })
        .select('id')
        .single();

      if (error) {
        return json(500, {
          error: error.message,
        });
      }

      return json(200, {
        contactId: data.id,
      });
    }

    if (action === 'send_ready_notice') {
      const payload = body?.payload as SendReadyNoticePayload | undefined;
      if (!payload) {
        return json(400, {
          error: 'Missing payload',
        });
      }

      const { data, error } = await supabase
        .from('reservation_notification_contacts')
        .select('id, phone_hash, encrypted_phone, expires_at, consumed_at')
        .eq('id', payload.contactId)
        .single<ContactRow>();

      if (error || !data) {
        return json(404, {
          error: 'Contact registration not found',
        });
      }

      if (data.consumed_at) {
        return json(200, {
          ok: true,
          skipped: 'already_consumed',
        });
      }

      if (new Date(data.expires_at).getTime() <= Date.now()) {
        return json(200, {
          ok: true,
          skipped: 'expired',
        });
      }

      const phone = xorDecrypt(data.encrypted_phone, encryptionKey);
      const message = `THE BOOK NOOK: ${payload.studentName}, your reserved book \"${payload.bookTitle}\" is ready for pickup.`;
      await sendTwilioSms(phone, message);

      const { error: consumeError } = await supabase
        .from('reservation_notification_contacts')
        .update({
          consumed_at: new Date().toISOString(),
        })
        .eq('id', payload.contactId)
        .is('consumed_at', null);

      if (consumeError) {
        return json(500, {
          error: consumeError.message,
        });
      }

      return json(200, {
        ok: true,
      });
    }

    return json(400, {
      error: `Unknown action: ${action}`,
    });
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
