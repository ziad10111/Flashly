# Flashly Demo MVP Runbook

Flashly is an AI-powered flashcard learning app. This runbook is for the current demo MVP only: text/markdown uploads, backend-only AI generation, local generated deck persistence, and review.

## Environment Modes

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

`FLASHLY_AI_API_KEY` and `FLASHLY_OCR_API_KEY` must never be named with `EXPO_PUBLIC_`. Expo public env vars can be bundled into frontend code, so AI keys, OCR keys, and other service secrets must stay server-only.

The backend AI demo supports `.txt`, `.md`, text-based `.pdf`, `.jpg`, and `.png` files. Image OCR requires the server-only OCR provider settings above. Scanned PDF OCR, slides, and guaranteed handwritten note OCR are future work.

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

Use `docs/demo-sample-material.md` as a neutral study-focused sample if you need a quick `.md` file.

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

- Backend mode disabled: set `EXPO_PUBLIC_USE_BACKEND=true` before starting Expo for the AI demo.
- AI env vars missing: set `FLASHLY_AI_PROVIDER=openai` or `FLASHLY_AI_PROVIDER=gemini`, plus `FLASHLY_AI_API_KEY` and `FLASHLY_AI_MODEL` on the server side.
- Unsupported file type: choose `.txt`, `.md`, text PDF, JPG, or PNG.
- Scanned PDF: use a text-based PDF for now, or upload a clear JPG/PNG if image OCR is configured.
- OCR provider missing: set `FLASHLY_OCR_PROVIDER=ocrspace` and `FLASHLY_OCR_API_KEY` as server-only variables.
- Text too short: use at least 40 useful characters.
- File too large: keep demo text/markdown under `64 KB`, PDFs under `4 MB`, and JPG/PNG images under `3 MB`.
- Generated deck not appearing: wait for generation to finish, then reopen Decks after local persistence hydrates.
- Stale local generated deck data: clear app storage/AsyncStorage or reinstall the dev app before a clean repeat demo.
- Provider failure or invalid AI output: verify model access and provider configuration. Flashly should show a safe error without exposing raw provider details.

## Final Verification

Run:

```bash
npm run typecheck
npm run lint
```

Latest focused QA result from 2026-06-02:

```text
[FINAL CERTIFICATION BLOCKED] Android AVD Resizable_Experimental booted, but no Expo Go/development build was installed and Expo Android launch timed out
[FINAL CERTIFICATION BLOCKED] .env did not include server-only OpenAI or OCR.space keys, so real provider calls were not run
[PASS] no AI/OCR provider secret used an EXPO_PUBLIC_ prefix
[NOT RUN] .txt real device flow
[NOT RUN] .md real device flow
[NOT RUN] text PDF real device flow
[NOT RUN] JPG OCR real provider flow
[NOT RUN] PNG OCR real provider flow
[NOT RUN] restart persistence on simulator/device
[PASS] local backend .txt extraction
[PASS] local backend .md extraction
[PASS] local backend text PDF extraction
[EXPECTED LIMITATION] scanned PDF returned a clear limitation
[PASS] missing OCR.space config returned a safe OCR error
[PASS] missing OpenAI config returned a safe AI error
[NOT RUN] real JPG/PNG OCR without OCR.space key
[NOT RUN] simulator/device persistence and restart flow
```

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
