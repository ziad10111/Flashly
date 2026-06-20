# Final Staging Validation Result

**Validation date:** 2026-06-20  
**GitHub commit:** `eb0cf84`  
**Command:** `npm run verify:staging`  
**Result:** PASS  
**Exit code:** 0

## Validation Results

| Phase                               | Result |  Duration |
| ----------------------------------- | -----: | --------: |
| Health                              |   PASS |    587 ms |
| Readiness                           |   PASS |  3,020 ms |
| Authentication                      |   PASS |         — |
| Direct upload                       |   PASS |  3,682 ms |
| Invalid upload rejection            |   PASS |    250 ms |
| Oversized upload rejection          |   PASS |    256 ms |
| Chunk upload                        |   PASS |  2,383 ms |
| Upload persistence                  |   PASS |    818 ms |
| Cloud extraction from storageKey    |   PASS |  2,969 ms |
| NVIDIA MCQ generation               |   PASS | 28,315 ms |
| Deck and flashcard persistence      |   PASS |  1,358 ms |
| Ownership isolation                 |   PASS |  1,174 ms |
| Review session and progress         |   PASS |  4,791 ms |
| RevenueCat webhook and subscription |   PASS |  2,098 ms |
| Malformed JSON rejection            |   PASS |    253 ms |
| Rate limiting                       |   PASS | 29,313 ms |
| Security                            |   PASS |         — |
| Overall                             |   PASS |         — |

## Release Decision

The full real staging end-to-end validation passed successfully.

Validated functionality includes:

- Railway health and readiness
- Clerk authentication
- Direct and multipart uploads
- Backblaze B2 cloud storage
- Extraction using persisted `storageKey`
- NVIDIA MCQ generation
- PostgreSQL deck and flashcard persistence
- Cross-user ownership protection
- Review-session and progress persistence
- RevenueCat webhook authentication and subscription persistence
- Malformed JSON rejection
- Rate limiting
- Security behavior

Flashly is now ready to proceed with Google Play Internal Testing preparation.
