// lib/sms.js — shared helpers for the two places this app sends SMS via
// ClickSend (api/notifications/send.js for manual/practitioner-triggered
// sends, api/bookings/index.js for automatic booking confirmations). Both
// used to have their own copy of this logic, which is exactly how the
// sender-ID length bug only got fixed in one of the two places at first.

// Alphanumeric SMS sender IDs are capped at 11 characters by the underlying
// SMS network standard (not a ClickSend-specific limit) and generally only
// support letters/numbers — spaces and punctuation get rejected too. A
// business name sent as-is fails outright for most real business names
// ("Solful Kinesiology" is 19 characters). This sanitizes whatever sender
// name is provided down to something that will actually be accepted.
export function sanitizeSenderId(name) {
  return (name || 'h_ld').replace(/[^a-zA-Z0-9]/g, '').slice(0, 11) || 'h_ld';
}

// Converts a local Australian number (04xx xxx xxx) to E.164 (+614xxxxxxxx),
// which ClickSend expects for reliable delivery — sending a number without
// a country code is a common, silent cause of a message reporting as
// "sent" while never actually being deliverable at the carrier level.
// Leaves anything already in international format (or anything that
// doesn't look like a plain AU mobile) untouched rather than guessing.
export function normalizePhoneAU(raw) {
  const num = String(raw).trim().replace(/[\s()-]/g, '');
  if (num.startsWith('+')) return num;
  if (num.startsWith('0')) return '+61' + num.slice(1);
  if (num.startsWith('61')) return '+' + num;
  return num;
}
