import test from 'node:test';
import assert from 'node:assert/strict';
import { formatVisitor, validateVisitor } from './visitors.js';

test('validates and normalizes visitor check-in details', () => {
  assert.deepEqual(validateVisitor({
    fullName: '  Alex Morgan  ',
    contact: '  +1 555 123 4567 ',
    purpose: 'Campus tour',
  }), {
    fullName: 'Alex Morgan',
    contact: '+1 555 123 4567',
    purpose: 'Campus tour',
  });
});

test('rejects invalid check-in details with client errors', () => {
  for (const [body, message] of [
    [{ fullName: ' ', contact: '12345678', purpose: 'Delivery' }, 'Enter a full name of no more than 120 characters.'],
    [{ fullName: 'A'.repeat(121), contact: '12345678', purpose: 'Delivery' }, 'Enter a full name of no more than 120 characters.'],
    [{ fullName: 'Alex Morgan', contact: '123', purpose: 'Delivery' }, 'Enter a valid contact number.'],
    [{ fullName: 'Alex Morgan', contact: '12345678', purpose: 'Other' }, 'Select a valid visit purpose.'],
  ]) {
    assert.throws(() => validateVisitor(body), (error) => error.statusCode === 400 && error.message === message);
  }
});

test('formats visitor IDs consistently for the client', () => {
  assert.deepEqual(formatVisitor({
    id: 42,
    full_name: 'Alex Morgan',
    contact_number: '+1 555 123 4567',
    purpose: 'Campus tour',
    entry_time: '06 Nov 2026 - 10:30 AM',
  }), {
    id: '42',
    name: 'Alex Morgan',
    contact: '+1 555 123 4567',
    purpose: 'Campus tour',
    entryTime: '06 Nov 2026 - 10:30 AM',
    status: 'Inside',
  });
});
