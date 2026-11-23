# Crude Awakening — colleague trial

Daily oil & gas trivia: 10 questions, 20 seconds each, new set at midnight London.
Play: https://badernooruddin.github.io/crude-awakening/

This is a trial copy of the Claude-hosted game. Scores live in Firebase
(project `crude-awakening-trial`): players sign in anonymously (name + team only),
the organiser signs in with Google (link at the bottom of the page).

## Build
The page is built from the main game source (`src/`, plus `dbq.js` made by the main repo's `rebuild.py`):

    python3 build_gh.py          # -> docs/index.html  (TRIAL_LAUNCH=YYYY-MM-DD to change Day 1)
    npm i jsdom && node test-gh.js

## New questions
The daily top-up (a Claude scheduled task) commits each new batch as `docs/bank/bYYYYMMDD.json`
(`{"id", "added", "items": [...]}`) and adds the file name to `docs/bank/index.json`.
The page loads every listed batch on open; batches are appended after the built-in questions, so
sets already played never change.

## Deploy
- Pages serves `docs/` on `main`.
- Security rules: `firestore.rules` (paste into Firebase console → Firestore → Rules, or `firebase deploy --only firestore:rules`).
