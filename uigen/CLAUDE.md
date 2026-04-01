# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run setup       # First-time setup: install deps, generate Prisma client, run migrations
npm run dev         # Start dev server (Next.js with Turbopack)
npm run build       # Production build
npm run lint        # ESLint
npm run test        # Run Vitest suite
npm run db:reset    # Force reset SQLite database
```

Run a single test file:
```bash
npx vitest run src/lib/__tests__/file-system.test.ts
```

## Environment

Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY`. The app falls back to a mock language model provider when the key is absent, so it runs without an API key during development.

## Architecture

This is an AI-powered React component generator. Users describe UI in chat; Claude generates code using structured tools; the result renders live in a sandboxed iframe.

### Key data flow

1. User message → `POST /api/chat` (`src/app/api/chat/route.ts`)
2. Vercel AI SDK streams Claude's response with two tools: `str_replace_editor` (create/edit files) and `file_manager` (rename/delete)
3. Tool calls update the `VirtualFileSystem` — an in-memory tree (no disk I/O)
4. `FileSystemContext` (`src/lib/contexts/file-system-context.tsx`) propagates state changes
5. `PreviewFrame` (`src/components/preview/`) re-renders: Babel transforms JSX, builds an import map pointing to `esm.sh`, injects into a sandboxed `<iframe>`

### Core modules

| Path | Purpose |
|------|---------|
| `src/lib/file-system.ts` | Virtual file system (in-memory, serializable to JSON for DB storage) |
| `src/lib/provider.ts` | Language model provider — real Anthropic or mock fallback |
| `src/lib/tools/str-replace.ts` | AI tool: create and edit files |
| `src/lib/tools/file-manager.ts` | AI tool: rename and delete files |
| `src/lib/transform/jsx-transformer.ts` | Babel-based JSX→JS compilation + import map generation |
| `src/lib/contexts/chat-context.tsx` | Chat state, AI SDK `useChat` integration |
| `src/lib/contexts/file-system-context.tsx` | File system state and dispatch |
| `src/lib/auth.ts` | JWT session management (httpOnly cookies) |
| `src/actions/` | Server actions for auth and project CRUD |

### Database

SQLite via Prisma. Two models: `User` (email + bcrypt password) and `Project` (name, userId, `messages` JSON, `data` JSON). The `data` field stores the serialized `VirtualFileSystem`.

### UI layout

The main workspace (`src/app/main-content.tsx`) is a three-panel layout: chat on the left, live preview and Monaco code editor on the right (tab-switched). Auth is JWT-based with an optional sign-in/sign-up dialog; unauthenticated users can still use the generator but cannot persist projects.

### Testing

Tests live in `__tests__` directories co-located with source. Vitest + Testing Library. Component tests mock the React contexts; utility tests exercise the file system and JSX transformer directly.

## Code Comments

Only comment code where the logic isn't self-evident. Skip comments on straightforward or self-explanatory code.
