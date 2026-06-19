# Server Schema Types

These TypeScript types describe future persistence-facing rows for Flashly backend data.

They are not a database client, ORM schema, migration, or runtime persistence layer. API contracts in `src/api/contracts` remain the transport-facing DTOs used by frontend repositories and API routes.

Future DB-backed server repositories should map:

- schema rows to API DTOs before returning route responses
- API request DTOs to validated schema writes
- server-derived Clerk user ids to `userId` ownership fields

No database is currently connected.
