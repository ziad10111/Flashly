# Flashly MVP QA Checklist

Use this checklist for the current demo-ready flow:

```text
.txt/.md/text PDF/JPG/PNG upload -> extract text -> generate flashcards -> persist deck -> review deck
```

## Demo Environment

Safe mock-only mode:

```env
EXPO_PUBLIC_USE_BACKEND=false
EXPO_PUBLIC_FLASHLY_AUTH_MODE=mock
FLASHLY_DATA_MODE=mock
FLASHLY_STORAGE_MODE=mock
FLASHLY_EXTRACTION_MODE=mock
FLASHLY_GENERATION_MODE=mock
```

Backend AI demo mode:

```env
EXPO_PUBLIC_USE_BACKEND=true
EXPO_PUBLIC_FLASHLY_AUTH_MODE=mock
FLASHLY_DATA_MODE=mock
FLASHLY_STORAGE_MODE=mock
FLASHLY_EXTRACTION_MODE=external
FLASHLY_GENERATION_MODE=external
# Use openai or gemini.
FLASHLY_AI_PROVIDER=openai
FLASHLY_AI_API_KEY=your_server_only_key_here
# For example: gpt-4.1-mini or gemini-2.5-flash.
FLASHLY_AI_MODEL=your_model_here
FLASHLY_PDF_EXTRACTION_PROVIDER=local
# Optional for JPG/PNG OCR:
FLASHLY_OCR_PROVIDER=ocrspace
FLASHLY_OCR_API_KEY=your_server_only_ocr_key_here
```

`FLASHLY_AI_API_KEY` and `FLASHLY_OCR_API_KEY` must never use the `EXPO_PUBLIC_` prefix. Public Expo variables can be exposed to frontend code, so provider keys, OCR keys, backend tokens, storage credentials, and database URLs must stay server-only.

The backend AI demo supports `.txt`, `.md`, text-based PDF, JPG, and PNG uploads. Image OCR requires server-only OCR configuration. Scanned PDF OCR, slide parsing, and guaranteed handwritten note processing are future work.

## Demo Script

1. Start the app with backend mode enabled.
2. Sign in or use the current mock-compatible auth flow.
3. Open the upload flow.
4. Select a valid `.txt`, `.md`, text PDF, JPG, or PNG study material file.
5. Confirm extraction starts.
6. Confirm AI generation starts.
7. Confirm the generated deck is saved.
8. Open the generated deck.
9. Review cards.
10. Restart the app.
11. Confirm the generated deck still appears and opens.

Optional sample material:

```text
docs/demo-sample-material.md
```

## Pass/Fail Checks

- [ ] App starts in mock mode.
- [ ] App starts in backend demo mode.
- [ ] Valid `.txt` file generates a deck.
- [ ] Valid `.md` file generates a deck.
- [ ] Text-based PDF generates a deck, if tested with a compatible PDF.
- [ ] JPG/PNG image OCR generates a deck when OCR provider config is present.
- [ ] Scanned PDF returns a clear limitation message.
- [ ] No-text image returns a friendly OCR error.
- [ ] Generated deck appears in Decks.
- [ ] Generated deck opens in Deck Detail.
- [ ] Review works for a generated deck.
- [ ] Restart preserves the generated deck.
- [ ] Too-short file shows a friendly error.
- [ ] Too-large file shows a friendly error.
- [ ] Unsupported image/slide upload shows an unsupported demo message.
- [ ] Missing OCR config shows a safe error.
- [ ] Missing AI config shows a safe error.
- [ ] Invalid AI output is handled safely and no broken deck is saved.
- [ ] No API key is exposed through frontend `EXPO_PUBLIC_` env vars.
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.

## Latest Focused QA Results

Run date: 2026-06-02, final certification attempt

Environment used: Android AVD `Resizable_Experimental` was booted through the local Android SDK. No physical device was connected. No Expo Go or Flashly development build was installed on the emulator, and `npx expo start --android --host localhost --port 8091` timed out before a usable app session was available. `.env` did not contain server-only `FLASHLY_AI_API_KEY` or `FLASHLY_OCR_API_KEY`, so real OpenAI and OCR.space provider calls could not be run.

Secret check:

```text
[PASS] No OpenAI/OCR provider secret was present with an EXPO_PUBLIC_ prefix
[PASS] Existing .env only contained public Clerk/PostHog values
```

Final certification matrix:

```text
[NOT RUN] .txt real device flow
[NOT RUN] .md real device flow
[NOT RUN] text PDF real device flow
[NOT RUN] JPG OCR real provider flow
[NOT RUN] PNG OCR real provider flow
[NOT RUN] no-text image friendly error through real OCR provider
[NOT RUN] scanned PDF through actual app picker
[NOT RUN] unsupported file type through actual app picker
[NOT RUN] too-large files through actual app picker
[NOT RUN] restart persistence on simulator/device
[BLOCKED] real provider/device certification requires server-only OpenAI/OCR.space keys and an installed Expo Go or development build
```

Run date: 2026-06-02

Environment used: local backend/service QA from the project shell. No simulator/device session was available in this pass, and no server-only OpenAI or OCR.space keys were present in `.env`.

```text
[PASS] .txt extraction service
[PASS] .md extraction service
[PASS] text PDF extraction service with a minimal selectable-text PDF fixture
[EXPECTED LIMITATION] scanned/image-only PDF returned a clear selectable-text limitation
[PASS] missing OCR.space config returned a safe OCR configuration error
[PASS] too-large PDF extraction validation returned a friendly size error
[PASS] too-large image extraction validation returned a friendly size error
[PASS] missing OpenAI config readiness returned a safe AI configuration error
[NOT RUN] real JPG OCR provider call, because OCR.space key was not available
[NOT RUN] real PNG OCR provider call, because OCR.space key was not available
[NOT RUN] no-text image provider response, because OCR.space key was not available
[NOT RUN] simulator/device upload, deck save, review, and restart persistence flow
```

Device QA still needs to verify the full user flow:

```text
upload
-> extract
-> generate with real OpenAI config
-> save generated deck locally
-> open Deck Detail
-> review
-> restart app
-> generated deck/cards still open
```

## Known Limitations

Demo MVP supports:

- text/markdown uploads
- text-based PDF extraction
- JPG/PNG OCR when configured
- backend AI flashcard generation
- local generated deck persistence
- review flow

Not supported yet:

- real database persistence
- multi-device sync
- real storage uploads
- scanned PDF OCR
- guaranteed handwritten OCR
- slide extraction
- server-side generated deck persistence
- embeddings/RAG
- assistant citations
- production Clerk backend verification

## Troubleshooting

- Backend mode disabled: confirm `EXPO_PUBLIC_USE_BACKEND=true` for the AI demo path.
- AI env vars missing: set `FLASHLY_AI_PROVIDER=openai` or `FLASHLY_AI_PROVIDER=gemini`, plus `FLASHLY_AI_API_KEY` and `FLASHLY_AI_MODEL` as server-only variables.
- Unsupported file type: use `.txt`, `.md`, text PDF, JPG, or PNG for the demo.
- Scanned PDF: expect a clear limitation message until scanned PDF OCR is implemented.
- OCR provider missing: set `FLASHLY_OCR_PROVIDER=ocrspace` and server-only `FLASHLY_OCR_API_KEY`.
- Text too short: use study material with at least 40 useful characters.
- File too large: keep text/markdown under `64 KB`, PDFs under `4 MB`, and JPG/PNG images under `3 MB`.
- Generated deck not appearing: confirm generation completed successfully, then check Decks after local persistence has hydrated.
- Stale local generated deck data: clear the app's local storage/AsyncStorage or reinstall the dev app before repeating a clean demo.
- Provider failure or invalid AI output: check server-only AI config, model access, and provider status. The UI should show a safe error instead of raw provider details.

## Final Demo Path

Manually verify:

```text
valid .txt/.md/text PDF/JPG/PNG
-> extract
-> generate
-> save
-> open deck
-> review
-> restart
-> deck still opens
```
