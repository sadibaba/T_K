/**
 * Booking store. In-memory by default so the demo runs with zero setup.
 * Set BOOKINGS_FILE (local dev) or SUPABASE_URL + SUPABASE_SERVICE_KEY
 * (production) to persist. See docs/ANSWERS.md for the Supabase table SQL.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const memory = new Map(); // slotId -> booking

const hasSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);

function supabaseHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

const filePath = process.env.BOOKINGS_FILE ? path.resolve(process.env.BOOKINGS_FILE) : null;
let fileLoaded = false;

async function loadFile() {
  if (!filePath || fileLoaded) return;
  fileLoaded = true;
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    for (const row of JSON.parse(raw)) memory.set(row.slotId, row);
  } catch {
    /* first run — no file yet */
  }
}

async function persistFile() {
  if (!filePath) return;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify([...memory.values()], null, 2), 'utf8');
}

/**
 * Slot ids already taken. `from`/`to` are YYYY-MM-DD; slot ids are ISO strings,
 * so a lexical range filter maps directly onto PostgREST's gte/lt operators.
 */
export async function bookedSlotIds({ from, to } = {}) {
  await loadFile();
  if (!hasSupabase) {
    return new Set([...memory.values()].filter((b) => b.status !== 'cancelled').map((b) => b.slotId));
  }

  const range = from && to ? `&slot_id=gte.${from}T00:00&slot_id=lt.${to}T23:59` : '';
  const res = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/bookings?select=slot_id&status=eq.confirmed${range}`,
    { headers: supabaseHeaders() },
  );
  if (!res.ok) throw new Error(`supabase select failed: ${res.status}`);
  const rows = await res.json();
  return new Set(rows.map((r) => r.slot_id));
}

export async function isSlotBooked(slotId) {
  await loadFile();
  if (!hasSupabase) {
    const booking = memory.get(slotId);
    return Boolean(booking && booking.status !== 'cancelled');
  }
  const res = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/bookings?select=id&slot_id=eq.${encodeURIComponent(slotId)}&status=eq.confirmed`,
    { headers: supabaseHeaders() },
  );
  if (!res.ok) throw new Error(`supabase select failed: ${res.status}`);
  return (await res.json()).length > 0;
}

export async function saveBooking({ name, phone, treatment, slotId, notes = '', language = 'ur' }) {
  const booking = {
    id: randomUUID().slice(0, 8).toUpperCase(),
    slotId,
    name,
    phone,
    treatment,
    notes,
    language,
    status: 'confirmed',
    createdAt: new Date().toISOString(),
    source: 'ai-receptionist',
  };

  await loadFile();
  if (hasSupabase) {
    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/bookings`, {
      method: 'POST',
      headers: { ...supabaseHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({
        slot_id: slotId,
        name,
        phone,
        treatment,
        notes,
        language,
        status: 'confirmed',
        source: 'ai-receptionist',
      }),
    });
    if (!res.ok) throw new Error(`supabase insert failed: ${res.status} ${await res.text()}`);
    const [row] = await res.json();
    return { ...booking, id: String(row.id).slice(0, 8).toUpperCase() };
  }

  memory.set(slotId, booking);
  await persistFile();
  return booking;
}

/** Cancel a booking by reference. Returns the updated row, or null. */
export async function cancelBooking(ref) {
  await loadFile();

  if (hasSupabase) {
    const res = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(ref)}`,
      {
        method: 'PATCH',
        headers: { ...supabaseHeaders(), Prefer: 'return=representation' },
        body: JSON.stringify({ status: 'cancelled' }),
      },
    );
    if (!res.ok) throw new Error(`supabase update failed: ${res.status}`);
    const [row] = await res.json();
    return row ?? null;
  }

  for (const [slotId, booking] of memory) {
    if (booking.id === ref) {
      const updated = { ...booking, status: 'cancelled' };
      memory.set(slotId, updated);
      await persistFile();
      return updated;
    }
  }
  return null;
}

/** Every booking, newest first — used by the clinic's admin page. */
export async function listBookings(limit = 100) {
  await loadFile();

  if (hasSupabase) {
    const res = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/bookings?select=*&order=created_at.desc&limit=${limit}`,
      { headers: supabaseHeaders() },
    );
    if (!res.ok) throw new Error(`supabase select failed: ${res.status}`);
    return res.json();
  }

  return [...memory.values()]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit);
}

/** Only for tests/local — wipes the in-memory store. */
export function _reset() {
  memory.clear();
}
