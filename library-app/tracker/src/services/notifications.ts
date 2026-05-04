import { supabase } from './supabase';

interface RegisterReservationContactInput {
	reservationId: string;
	studentCardId: string;
	studentName: string;
	studentCardNumber: string;
	bookTitle: string;
	phoneNumber: string;
}

interface RegisterReservationContactResult {
	contactId: string | null;
	error: string | null;
}

interface SendReadyNoticeInput {
	contactId: string;
	reservationId: string;
	studentName: string;
	bookTitle: string;
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

export async function sendReadyNotice(input: SendReadyNoticeInput): Promise<{ ok: boolean; error: string | null }> {
	const { error } = await supabase.functions.invoke('library-notifications', {
		body: {
			action: 'send_ready_notice',
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

