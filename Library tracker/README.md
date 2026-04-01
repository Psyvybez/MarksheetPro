# 📚 Class Library Tracker

A mobile-friendly book tracker for a small classroom library. Scan ISBN barcodes with your phone camera to check books in and out, powered by a built-in local catalog.

## Features

- **ISBN barcode scanning** — uses the phone/tablet camera (rear-facing)
- **Automatic book lookup** — title and metadata from an in-app catalog (`src/services/catalog.ts`)
- **Check-out & Check-in** — log which student has which book, with a 2-week due date
- **Overdue alerts** — dashboard highlights books past their due date
- **Local storage** — all data is saved in the browser (no server needed)
- **Supabase sync** — when signed in, books/checkouts/cards sync per user to Supabase
- **Works offline** — once books are added, the library view works without internet

## Supabase Setup

This app now supports cloud persistence through Supabase for authenticated users.

### 1. Environment variables

Create a `.env` file in this folder (`Library tracker/`) with:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

If these variables are not set, the app falls back to the existing project values currently used by the parent Marksheet app.

### 2. Create table in Supabase

Run this SQL in your Supabase SQL editor:

```sql
create table if not exists public.library_tracker_state (
	user_id uuid primary key references auth.users(id) on delete cascade,
	books jsonb not null default '[]'::jsonb,
	checkouts jsonb not null default '[]'::jsonb,
	student_cards jsonb not null default '[]'::jsonb,
	updated_at timestamptz not null default now()
);

alter table public.library_tracker_state enable row level security;

drop policy if exists "library_state_select_own" on public.library_tracker_state;
create policy "library_state_select_own"
on public.library_tracker_state
for select
using (auth.uid() = user_id);

drop policy if exists "library_state_insert_own" on public.library_tracker_state;
create policy "library_state_insert_own"
on public.library_tracker_state
for insert
with check (auth.uid() = user_id);

drop policy if exists "library_state_update_own" on public.library_tracker_state;
create policy "library_state_update_own"
on public.library_tracker_state
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

### 3. Behavior

- On load, the app checks Supabase for the signed-in user's library state.
- If cloud data exists, it hydrates local state from Supabase.
- Any changes to books, checkouts, or student cards are synced back to Supabase.
- localStorage is still used as an offline cache and backup path.

## Getting Started

### 1. Install and Run

```bash
npm install
npm run dev
```

The app will start at `http://localhost:5173` and is also accessible from other devices on your local Wi-Fi network (the terminal will show the network URL, e.g. `http://192.168.x.x:5173`).

### 2. Scan Books

- Tap **Scan** (camera icon) to open the barcode scanner
- Point the camera at the ISBN barcode on the back of a book
- If the ISBN exists in `src/services/catalog.ts`, book details appear automatically
- **First scan:** tap **Add to Library** to add the book
- **Subsequent scans:** tap **Check Out** to lend it, or **Return** to check it back in
- If a book is not in the catalog, open the **Library** tab and use **Add Manually**

### 3. Add More Books to the Built-in Catalog

If a scanned ISBN is not found, add it in `src/services/catalog.ts` using the same object shape as the existing entries.

## Using from a Phone

1. Make sure your computer and phone are on the same Wi-Fi network
2. Run `npm run dev:host` (which is the same as `npm run dev` since `host: true` is set)
3. The terminal shows a network URL like `http://192.168.1.x:5173` — open that on your phone
4. Camera access requires either **HTTPS** or **localhost**. On local networks (http://192.168.x.x), Chrome on Android works fine. On iPhone/Safari, you may need to use a tunnel like [ngrok](https://ngrok.com) or deploy to a HTTPS host.

## Deployment

Build a static site and deploy anywhere (Netlify, Vercel, GitHub Pages, etc.):

```bash
npm run build
# Output is in the dist/ folder
```

Camera access requires HTTPS in production. Any free static hosting provider will serve over HTTPS automatically.

## Tech Stack

- **React 18** + TypeScript + Vite
- **@zxing/browser** — barcode scanning via Web APIs
- **Local in-app catalog** — book data (`src/services/catalog.ts`)
- Browser `localStorage` — data persistence (no database)
