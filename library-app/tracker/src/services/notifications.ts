import { supabase } from './supabase';

interface RegisterReservationContactInput {
  reservationId: string;
  studentCardId: string;
  studentName: string;
  studentCardNumber: string;
  bookTitle: string;
  email?: string;
}

interface SaveStudentEmailInput {
  studentCardId: string;
  studentCardNumber: string;
  studentName: string;
  email: string;
}

interface GetStudentEmailResult {
  email: string | null;
}

interface RegisterReservationContactResult {
  contactId: string | null;
  error: string | null;
}

interface SendBookAvailableNoticeInput {
  contactId: string;
  studentName: string;
  bookTitle: string;
}

interface SendCheckoutNoticeInput {
  contactId: string;
  studentName: string;
  bookTitle: string;
}

interface SendNoticeResult {
  ok: boolean;
  error: string | null;
}

export async function registerReservationContact(
  input: RegisterReservationContactInput
): Promise<RegisterReservationContactResult> {
  const { data, error } = await supabase.functions.invoke('library-notifications', {
    body: {
      action: 'register_reservation_contact',
      payload: input,
    },
  });

  if (error) {
    return {
      contactId: null,
      error: error.message,
    };
  }

  const contactId = typeof data?.contactId === 'string' ? data.contactId : null;
  return {
    contactId,
    error: contactId ? null : 'No contact ID returned from notification service.',
  };
}

export async function sendBookAvailableNotice(input: SendBookAvailableNoticeInput): Promise<SendNoticeResult> {
  const { error } = await supabase.functions.invoke('library-notifications', {
    body: {
      action: 'send_book_available_notice',
      payload: input,
    },
  });

  if (error) {
    return {
      ok: false,
      error: error.message,
    };
  }

  return {
    ok: true,
    error: null,
  };
}

export async function sendCheckoutNotice(input: SendCheckoutNoticeInput): Promise<SendNoticeResult> {
  const { error } = await supabase.functions.invoke('library-notifications', {
    body: {
      action: 'send_checkout_notice',
      payload: input,
    },
  });

  if (error) {
    return {
      ok: false,
      error: error.message,
    };
  }

  return {
    ok: true,
    error: null,
  };
}

export async function checkAndSendDueReminders(): Promise<SendNoticeResult> {
  const { error } = await supabase.functions.invoke('library-notifications', {
    body: {
      action: 'check_and_send_due_reminders',
      payload: {},
    },
  });

  if (error) {
    return {
      ok: false,
      error: error.message,
    };
  }

  return {
    ok: true,
    error: null,
  };
}

export async function saveStudentEmail(input: SaveStudentEmailInput): Promise<SendNoticeResult> {
  const { error } = await supabase.functions.invoke('library-notifications', {
    body: {
      action: 'save_student_email',
      payload: input,
    },
  });

  if (error) {
    return {
      ok: false,
      error: error.message,
    };
  }

  return {
    ok: true,
    error: null,
  };
}

export async function getStudentEmail(studentCardId: string): Promise<GetStudentEmailResult> {
  const { data, error } = await supabase.functions.invoke('library-notifications', {
    body: {
      action: 'get_student_email',
      payload: { studentCardId },
    },
  });

  if (error) {
    return {
      email: null,
    };
  }

  return {
    email: typeof data?.email === 'string' ? data.email : null,
  };
}

// Deprecated: Use sendBookAvailableNotice instead
export async function sendReadyNotice(input: {
  contactId: string;
  studentName: string;
  bookTitle: string;
}): Promise<SendNoticeResult> {
  return sendBookAvailableNotice(input);
}
