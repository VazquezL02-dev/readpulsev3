# ReadPulse v3

A clean ReadPulse rebuild for NSW Stage 2 and Stage 3 reading assignment and live progress.

## Included

- Stage 2 and Stage 3
- Support, Core and Extension levels
- 18 text types
- 9 curriculum/theme banks with more than 100 topic choices
- Custom topic entry and Surprise Me
- Teacher generation, review and assignment
- Student view with reliable iPad typing
- Local draft saving while students type
- Supabase live progress
- Gemini generation through a protected Vercel API route

## Upload to GitHub

Create a new repository named `readpulse-v3`, then upload the contents of this folder. Keep the `api` folder intact.

The repository root must look like:

```
readpulse-v3/
├── api/
│   └── generate.js
├── index.html
├── package.json
├── vercel.json
├── supabase_v3_setup.sql
└── README.md
```

## Supabase

Open Supabase → SQL Editor → New query. Paste and run `supabase_v3_setup.sql`.

Your existing `students` table is reused. The script preserves existing ReadPulse tables and records.

## Vercel

Import the new GitHub repository into Vercel. In Settings → Environment Variables add:

- `GEMINI_API_KEY`: your Gemini API key
- Optional `GEMINI_MODEL`: defaults to `gemini-3.5-flash`

Add the variable to Production and Preview, then deploy.

## Student link

Teacher view:

```
https://YOUR-APP.vercel.app/
```

Student view:

```
https://YOUR-APP.vercel.app/?mode=student
```

## Important privacy note

This classroom prototype uses open anonymous Supabase policies so shared student devices can work without accounts. Do not store sensitive student information. Before using it beyond your own controlled class, add proper authentication and restricted Row Level Security policies.
Deployment refresh

## August 2026 fixes

- Student answer boxes no longer remount after every keystroke, so the iPad keyboard stays focused.
- The Gemini structured-output request now sends the MIME type enum expected by the current `generateContent` endpoint.
- The browser now accepts the API's `{ data: ... }` response directly.

## Public access from Google Sites

ReadPulse itself does not require a student account. In Vercel, open **Project → Settings → Deployment Protection** and ensure the production domain is public. In Google Sites, embed the stable production domain shown under **Project → Settings → Domains**, not a generated deployment or preview URL containing a commit/branch suffix.
