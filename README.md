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

## Deploy
- Pages serves `docs/` on `main`.
- Security rules: `firestore.rules` (paste into Firebase console → Firestore → Rules, or `firebase deploy --only firestore:rules`).
