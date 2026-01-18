# 📬 IdeaBox

> AI-powered email intelligence for busy professionals

IdeaBox automatically categorizes your emails, extracts action items, and helps you focus on what matters. Built for professionals managing 200-300+ emails/day across multiple Gmail accounts.

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.local.example .env.local
# Edit .env.local with your API keys

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [Implementation Status](docs/IMPLEMENTATION_STATUS.md) | **Start here** - Current progress and what to build next |
| [Project Overview](docs/PROJECT_OVERVIEW.md) | Vision, goals, and roadmap |
| [Architecture](docs/ARCHITECTURE.md) | Tech stack and system design |
| [Phase 1 Implementation](docs/PHASE_1_IMPLEMENTATION.md) | Detailed page/component specs |
| [Coding Standards](docs/CODING_STANDARDS.md) | Code style and conventions |
| [AI Analyzer System](docs/AI_ANALYZER_SYSTEM.md) | How AI analyzers work |
| [Database Schema](docs/DATABASE_SCHEMA.md) | Supabase/PostgreSQL schema |
| [Decisions](docs/DECISIONS.md) | Architectural decision log |

---

## 🏗️ Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **UI Components:** Custom shadcn-style components
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth + Gmail OAuth
- **AI:** OpenAI GPT-4.1-mini
- **Email:** Gmail API

---

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router pages
├── components/
│   └── ui/                # ✅ UI component library (complete)
├── config/                # ✅ App & analyzer configuration
├── lib/
│   ├── ai/               # ✅ OpenAI client
│   ├── supabase/         # ✅ Database clients
│   └── utils/            # ✅ Logger, utilities
├── types/                 # ✅ TypeScript definitions
├── hooks/                 # ❌ React hooks (not started)
└── services/              # ❌ Business logic (not started)
```

---

## ✅ What's Built

### UI Component Library
All components ready to use via `import { ... } from '@/components/ui'`:

- Button, Input, Label, Card, Badge
- Checkbox, Switch, Select
- Dialog, Toast, Skeleton, Spinner

### Infrastructure
- Enhanced logger with emoji prefixes
- OpenAI client with function calling
- Supabase clients (browser + server)
- Centralized configuration

---

## ❌ What's Next

See [Implementation Status](docs/IMPLEMENTATION_STATUS.md) for the full checklist.

**Priority order:**
1. Layout components (Navbar, Sidebar)
2. Landing page with Gmail OAuth
3. Onboarding flow
4. Inbox view
5. API routes
6. AI analyzers

---

## 🔧 Development

### Commands

```bash
npm run dev      # Start dev server
npm run build    # Build for production
npm run lint     # Run ESLint
npm run start    # Start production server
```

### Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# Gmail OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx

# OpenAI
OPENAI_API_KEY=sk-xxx

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 📝 Code Quality

- **Max 400 lines per file** (see CODING_STANDARDS.md)
- **Emoji logging throughout** (see logger.ts)
- **Type everything** (strict TypeScript)
- **Document with JSDoc** (usage examples in every component)

---

## 🤝 Contributing

1. Read [Coding Standards](docs/CODING_STANDARDS.md)
2. Check [Implementation Status](docs/IMPLEMENTATION_STATUS.md)
3. Pick a task and implement
4. Test thoroughly
5. Submit PR

---

## 📄 License

Private project for Hazel Quimpo.
