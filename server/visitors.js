const purposes = new Set([
  'Delivery',
  'Admissions appointment',
  'Library research',
  'Faculty meeting',
  'Campus tour',
  'Facilities maintenance',
  'Guest lecture',
]);

export function formatVisitor(row) {
  return {
    id: String(row.id),
    name: row.full_name,
    contact: row.contact_number,
    purpose: row.purpose,
    entryTime: row.entry_time,
    status: 'Inside',
  };
}

export function validateVisitor(body) {
  const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : '';
  const contact = typeof body?.contact === 'string' ? body.contact.trim() : '';
  const purpose = typeof body?.purpose === 'string' ? body.purpose : '';

  if (!fullName || fullName.length > 120) {
    const error = new Error('Enter a full name of no more than 120 characters.');
    error.statusCode = 400;
    throw error;
  }
  if (contact.length > 50 || contact.replace(/\D/g, '').length < 8) {
    const error = new Error('Enter a valid contact number.');
    error.statusCode = 400;
    throw error;
  }
  if (!purposes.has(purpose)) {
    const error = new Error('Select a valid visit purpose.');
    error.statusCode = 400;
    throw error;
  }

  return { fullName, contact, purpose };
}
