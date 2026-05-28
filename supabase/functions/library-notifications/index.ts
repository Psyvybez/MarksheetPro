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

interface SendBookAvailableNoticePayload {
  contactId: string;
  studentName: string;
  bookTitle: string;
}

interface SendCheckoutNoticePayload {
  contactId: string;
  studentName: string;
  bookTitle: string;
}

interface CheckAndSendDueRemindersPayload {
  // No specific payload needed; runs check on all records
}

interface ContactRow {
  id: string;
  phone_hash: string;
  encrypted_phone: string;
  expires_at: string;
  student_name: string;
  book_title: string;
  checkout_date: string | null;
  due_date: string | null;
  available_notice_sent_at: string | null;
  due_reminder_2days_sent_at: string | null;
  due_reminder_1day_sent_at: string | null;
  due_reminder_dayof_sent_at: string | null;
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

    if (action === 'send_book_available_notice') {
      const payload = body?.payload as SendBookAvailableNoticePayload | undefined;
      if (!payload) {
        return json(400, {
          error: 'Missing payload',
        });
      }

      const { data, error } = await supabase
        .from('reservation_notification_contacts')
        .select('id, phone_hash, encrypted_phone, expires_at, available_notice_sent_at')
        .eq('id', payload.contactId)
        .single();

      const contact = data as ContactRow | null;

      if (error || !contact) {
        return json(404, {
          error: 'Contact registration not found',
        });
      }

      if (contact.available_notice_sent_at) {
        return json(200, {
          ok: true,
          skipped: 'already_sent',
        });
      }

      if (new Date(contact.expires_at).getTime() <= Date.now()) {
        return json(200, {
          ok: true,
          skipped: 'expired',
        });
      }

      const phone = xorDecrypt(contact.encrypted_phone, encryptionKey);
      const message = `THE BOOK NOOK: ${payload.studentName}, your reserved book "${payload.bookTitle}" is now available for pickup!`;
      await sendTwilioSms(phone, message);

      const { error: updateError } = await supabase
        .from('reservation_notification_contacts')
        .update({
          available_notice_sent_at: new Date().toISOString(),
        })
        .eq('id', payload.contactId)
        .is('available_notice_sent_at', null);

      if (updateError) {
        return json(500, {
          error: updateError.message,
        });
      }

      return json(200, {
        ok: true,
      });
    }

    if (action === 'send_checkout_notice') {
      const payload = body?.payload as SendCheckoutNoticePayload | undefined;
      if (!payload) {
        return json(400, {
          error: 'Missing payload',
        });
      }

      const { data, error } = await supabase
        .from('reservation_notification_contacts')
        .select('id, phone_hash, encrypted_phone, expires_at')
        .eq('id', payload.contactId)
        .single();

      const contact = data as ContactRow | null;

      if (error || !contact) {
        return json(404, {
          error: 'Contact registration not found',
        });
      }

      if (new Date(contact.expires_at).getTime() <= Date.now()) {
        return json(200, {
          ok: true,
          skipped: 'expired',
        });
      }

      const checkoutDate = new Date();
      const dueDate = new Date(checkoutDate.getTime() + 14 * 24 * 60 * 60 * 1000);

      const phone = xorDecrypt(contact.encrypted_phone, encryptionKey);
      const dueDateStr = dueDate.toLocaleDateString();
      const message = `THE BOOK NOOK: ${payload.studentName}, you checked out "${payload.bookTitle}". Due date: ${dueDateStr}. Return by 9am.`;
      await sendTwilioSms(phone, message);

      const { error: updateError } = await supabase
        .from('reservation_notification_contacts')
        .update({
          checkout_date: checkoutDate.toISOString(),
          due_date: dueDate.toISOString(),
        })
        .eq('id', payload.contactId);

      if (updateError) {
        return json(500, {
          error: updateError.message,
        });
      }

      return json(200, {
        ok: true,
      });
    }

    if (action === 'check_and_send_due_reminders') {
      const now = new Date();
      const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const nineAmUtc = new Date(todayMidnight.getTime() + 9 * 60 * 60 * 1000);

      // Get all records with due dates that need reminders
      const { data: records, error: selectError } = await supabase
        .from('reservation_notification_contacts')
        .select(
          'id, phone_hash, encrypted_phone, student_name, book_title, due_date, due_reminder_2days_sent_at, due_reminder_1day_sent_at, due_reminder_dayof_sent_at'
        )
        .not('due_date', 'is', null)
        .order('due_date', { ascending: true });

      if (selectError) {
        return json(500, {
          error: selectError.message,
        });
      }

      const sentReminders = [];

      for (const record of (records ?? []) as ContactRow[]) {
        if (!record.due_date) {
          continue;
        }

        const dueDate = new Date(record.due_date);
        const daysUntilDue = Math.floor((dueDate.getTime() - todayMidnight.getTime()) / (24 * 60 * 60 * 1000));

        const phone = xorDecrypt(record.encrypted_phone, encryptionKey);
        const updates: Record<string, string> = {};

        // 2 days before due date
        if (daysUntilDue === 2 && !record.due_reminder_2days_sent_at) {
          const message = `THE BOOK NOOK: ${record.student_name}, reminder: "${record.book_title}" is due in 2 days.`;
          await sendTwilioSms(phone, message);
          updates.due_reminder_2days_sent_at = now.toISOString();
          sentReminders.push({ contactId: record.id, type: 'due_reminder_2days' });
        }

        // 1 day before due date
        if (daysUntilDue === 1 && !record.due_reminder_1day_sent_at) {
          const message = `THE BOOK NOOK: ${record.student_name}, reminder: "${record.book_title}" is due tomorrow.`;
          await sendTwilioSms(phone, message);
          updates.due_reminder_1day_sent_at = now.toISOString();
          sentReminders.push({ contactId: record.id, type: 'due_reminder_1day' });
        }

        // On the due date
        if (daysUntilDue === 0 && !record.due_reminder_dayof_sent_at) {
          const message = `THE BOOK NOOK: ${record.student_name}, "${record.book_title}" is due today by 9am.`;
          await sendTwilioSms(phone, message);
          updates.due_reminder_dayof_sent_at = now.toISOString();
          sentReminders.push({ contactId: record.id, type: 'due_reminder_dayof' });
        }

        if (Object.keys(updates).length > 0) {
          const { error: updateError } = await supabase
            .from('reservation_notification_contacts')
            .update(updates)
            .eq('id', record.id);

          if (updateError) {
            console.error(`Failed to update record ${record.id}: ${updateError.message}`);
          }
        }
      }

      return json(200, {
        ok: true,
        sentReminders,
      });
    }

    if (action === 'send_ready_notice') {
      const payload = body?.payload as SendBookAvailableNoticePayload | undefined;
      if (!payload) {
        return json(400, {
          error: 'Missing payload',
        });
      }

      return json(400, {
        error: 'send_ready_notice is deprecated. Use send_book_available_notice instead.',
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
