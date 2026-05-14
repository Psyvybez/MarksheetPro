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
  email?: string;
}

interface SaveStudentEmailPayload {
  studentCardId: string;
  studentCardNumber: string;
  studentName: string;
  email: string;
}

interface GetStudentEmailPayload {
  studentCardId: string;
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
  email_hash: string;
  encrypted_email: string;
  student_name: string;
  book_title: string;
  expires_at: string;
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

async function hashEmail(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(email.toLowerCase().trim());
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

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

async function sendResendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('NOTIFICATION_FROM_EMAIL') ?? 'noreply@thebooknook.app';

  if (!apiKey) {
    throw new Error('Missing RESEND_API_KEY in environment variables.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `The Book Nook <${fromEmail}>`,
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Resend send failed: ${response.status} ${details}`);
  }
}

serve(async (request: Request) => {
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

    if (action === 'save_student_email') {
      const payload = body?.payload as SaveStudentEmailPayload | undefined;
      if (!payload) {
        return json(400, {
          error: 'Missing payload',
        });
      }

      const normalizedEmail = normalizeEmail(payload.email);
      if (!normalizedEmail || !normalizedEmail.includes('@')) {
        return json(400, {
          error: 'A valid email address is required',
        });
      }

      const emailHash = await hashEmail(normalizedEmail);
      const encryptedEmail = xorEncrypt(normalizedEmail, encryptionKey);

      const { error } = await supabase.from('student_notification_emails').upsert({
        student_card_id: payload.studentCardId,
        student_card_number: payload.studentCardNumber,
        student_name: payload.studentName,
        email_hash: emailHash,
        encrypted_email: encryptedEmail,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        return json(500, {
          error: error.message,
        });
      }

      return json(200, {
        ok: true,
      });
    }

    if (action === 'get_student_email') {
      const payload = body?.payload as GetStudentEmailPayload | undefined;
      if (!payload) {
        return json(400, {
          error: 'Missing payload',
        });
      }

      const { data, error } = await supabase
        .from('student_notification_emails')
        .select('encrypted_email')
        .eq('student_card_id', payload.studentCardId)
        .single();

      if (error && error.code !== 'PGRST116') {
        return json(500, {
          error: error.message,
        });
      }

      if (!data) {
        return json(200, {
          email: null,
        });
      }

      const email = xorDecrypt(data.encrypted_email, encryptionKey);
      return json(200, {
        email,
      });
    }

    if (action === 'register_reservation_contact') {
      const payload = body?.payload as RegisterReservationContactPayload | undefined;
      if (!payload) {
        return json(400, {
          error: 'Missing payload',
        });
      }

      let emailToUse = payload.email ? normalizeEmail(payload.email) : null;

      // If no email provided, try to get the student's saved email
      if (!emailToUse) {
        const { data: studentEmailData, error: studentEmailError } = await supabase
          .from('student_notification_emails')
          .select('encrypted_email')
          .eq('student_card_id', payload.studentCardId)
          .single();

        if (!studentEmailError && studentEmailData) {
          emailToUse = xorDecrypt(studentEmailData.encrypted_email, encryptionKey);
        }
      }

      if (!emailToUse || !emailToUse.includes('@')) {
        return json(400, {
          error: 'A valid email address is required. Please provide or save your email first.',
        });
      }

      // If email was provided, save it to student's profile for future use
      if (payload.email) {
        const emailHash = await hashEmail(emailToUse);
        const encryptedEmail = xorEncrypt(emailToUse, encryptionKey);
        await supabase.from('student_notification_emails').upsert({
          student_card_id: payload.studentCardId,
          student_card_number: payload.studentCardNumber,
          student_name: payload.studentName,
          email_hash: emailHash,
          encrypted_email: encryptedEmail,
          updated_at: new Date().toISOString(),
        });
      }

      const emailHash = await hashEmail(emailToUse);
      const encryptedEmail = xorEncrypt(emailToUse, encryptionKey);
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

      const { data, error } = await supabase
        .from('reservation_notification_contacts')
        .insert({
          reservation_id: payload.reservationId,
          student_card_id: payload.studentCardId,
          student_name: payload.studentName,
          student_card_number: payload.studentCardNumber,
          book_title: payload.bookTitle,
          email_hash: emailHash,
          encrypted_email: encryptedEmail,
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

      const { data, error } = (await supabase
        .from('reservation_notification_contacts')
        .select('id, email_hash, encrypted_email, student_name, book_title, expires_at, available_notice_sent_at')
        .eq('id', payload.contactId)
        .single()) as { data: ContactRow | null; error: unknown };

      if (error || !data) {
        return json(404, {
          error: 'Contact registration not found',
        });
      }

      if (data.available_notice_sent_at) {
        return json(200, {
          ok: true,
          skipped: 'already_sent',
        });
      }

      if (new Date(data.expires_at).getTime() <= Date.now()) {
        return json(200, {
          ok: true,
          skipped: 'expired',
        });
      }

      const email = xorDecrypt(data.encrypted_email, encryptionKey);
      const subject = 'Your Reserved Book Is Available — The Book Nook';
      const html = `<p>Hi ${payload.studentName},</p><p>Great news! Your reserved book <strong>&quot;${payload.bookTitle}&quot;</strong> is now available for pickup.</p><p>Please visit the library at your earliest convenience to check it out.</p><p>— The Book Nook</p>`;
      await sendResendEmail(email, subject, html);

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

      const { data, error } = (await supabase
        .from('reservation_notification_contacts')
        .select('id, email_hash, encrypted_email, student_name, book_title, expires_at')
        .eq('id', payload.contactId)
        .single()) as { data: ContactRow | null; error: unknown };

      if (error || !data) {
        return json(404, {
          error: 'Contact registration not found',
        });
      }

      if (new Date(data.expires_at).getTime() <= Date.now()) {
        return json(200, {
          ok: true,
          skipped: 'expired',
        });
      }

      const checkoutDate = new Date();
      const dueDate = new Date(checkoutDate.getTime() + 14 * 24 * 60 * 60 * 1000);

      const emailCo = xorDecrypt(data.encrypted_email, encryptionKey);
      const dueDateStr = dueDate.toLocaleDateString();
      const subjectCo = 'Checkout Confirmation — The Book Nook';
      const htmlCo = `<p>Hi ${payload.studentName},</p><p>You have successfully checked out <strong>&quot;${payload.bookTitle}&quot;</strong>.</p><p><strong>Due date:</strong> ${dueDateStr} by 9:00 AM.</p><p>Please return it on time to avoid late fees.</p><p>— The Book Nook</p>`;
      await sendResendEmail(emailCo, subjectCo, htmlCo);

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
          'id, email_hash, encrypted_email, student_name, book_title, due_date, due_reminder_2days_sent_at, due_reminder_1day_sent_at, due_reminder_dayof_sent_at'
        )
        .not('due_date', 'is', null)
        .order('due_date', { ascending: true });

      if (selectError) {
        return json(500, {
          error: selectError.message,
        });
      }

      const sentReminders = [];

      for (const record of records as ContactRow[]) {
        if (!record.due_date) continue;

        const dueDate = new Date(record.due_date);
        const daysUntilDue = Math.floor((dueDate.getTime() - todayMidnight.getTime()) / (24 * 60 * 60 * 1000));

        const emailDr = xorDecrypt(record.encrypted_email, encryptionKey);
        const updates: Record<string, string> = {};

        // 2 days before due date
        if (daysUntilDue === 2 && !record.due_reminder_2days_sent_at) {
          const sub = `Reminder: "${record.book_title}" Due in 2 Days — The Book Nook`;
          const htm = `<p>Hi ${record.student_name},</p><p>This is a reminder that <strong>&quot;${record.book_title}&quot;</strong> is due back in <strong>2 days</strong>.</p><p>Please return it by 9:00 AM on the due date.</p><p>— The Book Nook</p>`;
          await sendResendEmail(emailDr, sub, htm);
          updates.due_reminder_2days_sent_at = now.toISOString();
          sentReminders.push({ contactId: record.id, type: 'due_reminder_2days' });
        }

        // 1 day before due date
        if (daysUntilDue === 1 && !record.due_reminder_1day_sent_at) {
          const sub = `Reminder: "${record.book_title}" Due Tomorrow — The Book Nook`;
          const htm = `<p>Hi ${record.student_name},</p><p>This is a reminder that <strong>&quot;${record.book_title}&quot;</strong> is due back <strong>tomorrow</strong> by 9:00 AM.</p><p>— The Book Nook</p>`;
          await sendResendEmail(emailDr, sub, htm);
          updates.due_reminder_1day_sent_at = now.toISOString();
          sentReminders.push({ contactId: record.id, type: 'due_reminder_1day' });
        }

        // On the due date
        if (daysUntilDue === 0 && !record.due_reminder_dayof_sent_at) {
          const sub = `"${record.book_title}" Is Due Today — The Book Nook`;
          const htm = `<p>Hi ${record.student_name},</p><p><strong>&quot;${record.book_title}&quot;</strong> is due back <strong>today by 9:00 AM</strong>.</p><p>Please return it as soon as possible to avoid late fees.</p><p>— The Book Nook</p>`;
          await sendResendEmail(emailDr, sub, htm);
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
