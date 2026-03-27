# 📚 Class Library Tracker

A mobile-friendly book tracker for a small classroom library. Scan ISBN barcodes with your phone camera to check books in and out, powered by the [ISBNdb](https://isbndb.com) book database.

## Features

- **ISBN barcode scanning** — uses the phone/tablet camera (rear-facing)
- **Automatic book lookup** — title, author, cover image, and synopsis from ISBNdb
- **Check-out & Check-in** — log which student has which book, with a 2-week due date
- **Overdue alerts** — dashboard highlights books past their due date
- **Local storage** — all data is saved in the browser (no server needed)
- **Works offline** — once books are added, the library view works without internet

## Getting Started

### 1. Get an ISBNdb API Key

Sign up for a free account at [isbndb.com](https://isbndb.com) and copy your API key from the dashboard.

### 2. Install and Run

```bash
npm install
npm run dev
```

The app will start at `http://localhost:5173` and is also accessible from other devices on your local Wi-Fi network (the terminal will show the network URL, e.g. `http://192.168.x.x:5173`).

### 3. Enter Your API Key

Open the app in your browser, tap the ⚙️ icon in the top-right corner, and paste your ISBNdb API key.

### 4. Scan Books

- Tap **Scan** (camera icon) to open the barcode scanner
- Point the camera at the ISBN barcode on the back of a book
- The book details will appear automatically
- **First scan:** tap **Add to Library** to add the book
- **Subsequent scans:** tap **Check Out** to lend it, or **Return** to check it back in

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
- **ISBNdb REST API v2** — book data
- Browser `localStorage` — data persistence (no database)
