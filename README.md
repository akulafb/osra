# Osra: 3D Family Tree Visualization

**Osra** is an interactive 3D & 2D family tree visualisation that transforms complex genealogical relationships into an immersive, explorable 3D space. Built with React, TypeScript, and Three.js, this app combines sexy real-time 3D graphics with Supabase-powered authentication and permission controls.

## Overview

My goal was to create a collaborative family tree platform where multiple family clusters can coexist and interconnect through marriage links, while ensuring each user can only view and edit their immediate family network (self, parents, children, siblings, and spouse). With a little bit of fun.

## System Architecture

![System Architecture](./docs/system-architecture-flowchart.svg)

The system architecture diagram above illustrates the complete flow from the browser-based React frontend through authentication, data management, and backend services to the 3D visualization and AI chat components.

<!-- markdownlint-disable MD033 -->
<div style="display: flex; justify-content: center; gap: 1rem; flex-wrap: wrap;">
  <img src="./docs/onboarding-flowchart.svg" alt="Osra Onboarding Flow" width="400" height="400" style="object-fit: contain;" />
  <img src="./docs/UX2.svg" alt="Visual World, Navigation, Permissions & AI Chat" width="420" height="420" style="object-fit: contain;" />
</div>
<!-- markdownlint-enable MD033 -->

### The Flow

This project was built progressively, with each step unlocking the next capability.

1. **Visualization**: Family trees are networks, not hierarchies—added **force-directed graphs** so physics naturally clusters related nodes.

2. **Third dimension**: Clusters overlapped in 2D—added **3D with react-force-graph-3d**, giving each cluster its own region and marriage links as bridges.

3. **Collaboration**: Integrated **Supabase + Google OAuth** for sign-in and shared data storage.

4. **User identity**: Built the **node binding system** so each account connects to exactly one family node.

5. **Edit permissions**: Implemented the **1-degree network rule**—users view/edit only self, parents, children, siblings, and spouse.

6. **Database enforcement**: Added **PostgreSQL RLS policies** with custom functions to validate graph relationships.

7. **Controlled growth**: Built the **invite token system** so existing members invite new ones to claim specific nodes.

8. **Visual clarity**: **Color-coded links**—parent (blue), sibling (green), marriage (red)—for instant readability.

9. **Starship navigation**: Developed **FPS-style controls**—WASD thrust, mouse steering—so exploration feels like flying through space.

10. **2D presets**: Added **Family Presets** with orthogonal elbow connectors for clean hierarchical views.

11. **AI chatbot**: Implemented a **person-centric AI** that understands relationships and supports cloud/local LLMs.

12. **Visual upgrade**: Added **planetary nodes**, 3D starfield, nebulae, and a cinematic intro fly-in.

13. **Osra rebrand**: Renamed the app, added **regional background grouping**, and personalized the chatbot for signed-in users.

14. **Security hardening**: Added **one-time invites**, identity verification ("Is this you?"), and chatbot gating inside auth.

15. **Landing page**: Built the osra.cc marketing page with scroll-driven 3D hero and How It Works.

Each solution unlocked the next challenge, building from a simple graph into a fully collaborative, permission-controlled family tree platform.

## Features

### Family Chatbot

- **Floating assistant (🤖)**: Now with **User Identification**—the bot knows who is signed in and can answer personal questions like "Who is my father?". Uses person-centric context from your tree. BE EXTREMELY CONCISE responses.

### Core Functionality

- **3D Force-Directed Graph**: Physics-based layout using react-force-graph-3d.
- **Regional Background Grouping**: In Family Presets, connected background sub-trees are automatically grouped behind their anchors using a Z-axis spiral spread to prevent collisions.
- **Multi-Cluster Architecture**: Multiple family clusters spatially separated in 3D space.
- **Marriage Links**: Visual bridges connecting different family clusters.
- **Starship FPS Navigation**: Immersive mouse steering and WASD movement with fixed zoom/trackpad responsiveness.
- **Dynamic Node Interaction**: Click-to-focus and Tab-based node cycling with a glowing aura.
- **Planetary Textures**: Realistic 3D planet skins for nodes with continuous rotation and dynamic lighting.
- **Multi-Style Rendering**: Toggle between Planets, futuristic metallic Spheres, or simple Labels.
- **True 3D Starfield**: Immersive 8K backdrop with multi-layered parallax stars and galactic dust core.
- **Procedural Nebulae**: High-detail, volumetric gaseous clouds (Trifid and Helix styles) with organic motion.
- **Cinematic Intro Zoom**: Dramatic 30,000-unit "fly-in" from deep space upon app entry.
- **Ambient Cosmic Music**: Immersive background audio synced with the cinematic entry (default ON).
- **Celestial Body Mode**: Toggle links visibility to see family members as floating stars in deep space.
- **Clean UI**: Centralized selection panel and settings gear (⚙️) for an unobstructed view across 3D and 2D modes.
- **Landing (osra.cc)**: Scroll-driven 3D node graph hero, Meet Osra copy, 3-step How It Works, CTA.

### Navigation Controls

- **E**: Toggle Steering Engine (Enable/Disable Mouse Look)
- **WASD / Arrows**: Forward/Backward thrust and Strafe Left/Right
- **Shift**: Speed Boost
- **Tab / Shift-Tab**: Cycle through family members
- **Enter / Space**: Precision warp to selected node
- **Esc**: Deselect / Reset orientation
- **Mouse**: Directional steering (when engine is ON)

### Authentication & Permissions

- **Google OAuth Integration**: Seamless sign-in via Supabase Auth
- **Node Binding System**: Users bind to specific family tree nodes via invite tokens
- **Hardened 1-Degree Model**: Rebuilt security layer (RLS) that supports relatives and siblings
- **Atomic Operations**: Secure RPC functions (`create_relative_secure`) for data integrity
- **Role-Based Access**: Admin role for full tree management

### Relationship Types

- **Parent Links**: Vertical family structure
- **Sibling Links**: Horizontal connections within generations
- **Marriage Links**: Cross-cluster connections with distinct visual styling

## Tech Stack

### Frontend

- **React 18** + **TypeScript**: Type-safe component architecture
- **Material UI (MUI)**: Buttons, Switches, theme (`src/theme/osraTheme.ts`). Tree app UI uses MUI + react-spring for expandable panels.
- **react-force-graph-3d**: Three.js wrapper for 3D force-directed graphs
- **Three.js/WebGL**: Hardware-accelerated 3D rendering
- **Framer Motion**: Smooth UI animations for chat and landing page
- **React Markdown**: Rendering structured AI responses
- **React Router**: Client-side routing for invite links and pages
- **Vite**: Fast development server and optimized builds

### AI & LLM

- **OpenRouter**: Cloud-based LLM access (Grok-4-Fast)
- **Ollama**: Local LLM support (Qwen 2.5 Coder)
- **Custom Reasoning Engine**: Person-centric context generation from graph data

### Backend & Database

- **Supabase**: PostgreSQL database with real-time subscriptions
- **Supabase Auth**: Google OAuth provider integration
- **Row-Level Security (RLS)**: Postgres policies enforcing 1-degree permissions
- **Custom Functions**: `is_within_1_degree()` and `is_admin()` helpers

### Deployment

- **Vercel**: Automatic deployment from main branch

## Project Structure

```text
src/
├── components/
│   ├── FamilyTree3D.tsx          # Main 3D visualization component
│   ├── FamilyChat.tsx            # AI Chatbot UI component
│   ├── modals/                   # AddRelative, EditNode, BulkInvite modals
│   └── landing/                  # Landing page (osra.cc)
│       ├── LandingPage.tsx       # Orchestrator, hero track, spacers
│       ├── MeetOsraHero.tsx      # Scroll-driven 3D node graph
│       ├── HowItWorks.tsx        # 3-step section
│       └── HangarTransition.tsx  # CTA
├── contexts/
│   └── AuthContext.tsx           # Authentication state management
├── hooks/
│   ├── useFamilyData.ts          # Family tree data fetching logic
│   └── useFamilyChat.ts          # Chatbot logic and LLM orchestration
├── lib/
│   ├── supabase.ts               # Supabase client configuration
│   └── permissions.ts            # 1-degree permission helpers
├── utils/
│   ├── llmClient.ts              # OpenRouter/Ollama dual-mode client
│   └── familyContext.ts          # Graph-to-profile context generator
├── pages/
│   ├── HomePage.tsx              # Landing or tree (auth-gated)
│   └── InvitePage.tsx            # Invite token claim page
├── types/
│   ├── database.ts               # Supabase generated types
│   └── graph.ts                  # Graph data structures
├── App.tsx                       # Route definitions
└── main.tsx                      # Application entry point
supabase/
│   ├── migrations/               # Single schema migration
│   ├── seed/                     # Seed data (run in SQL Editor)
│   └── reference/                # Reference SQL (not run directly)
│       ├── policies.sql          # RLS policies
│       └── public-metrics.sql    # get_public_metrics RPC
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm
- Supabase account with Google OAuth configured

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd osra
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env.local` file with your **development** Supabase credentials (copy from `.env.example`):

```bash
VITE_SUPABASE_URL=https://your-dev-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_dev_anon_key
```

   **Important:** Use your dev project credentials for local development so `npm run dev` does not write to production. See [docs/DEV_VS_PROD_DATABASE.md](docs/DEV_VS_PROD_DATABASE.md) for full setup.

4. Run the development server:

```bash
npm run dev
```

### Database Setup

1. Create a Supabase project at [supabase.com](https://supabase.com) (or use an existing one).

2. Link the project (requires [Supabase CLI](https://supabase.com/docs/guides/cli)):

   ```bash
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```

3. Apply the schema (one command):

   ```bash
   npx supabase db push
   ```

4. Configure Google OAuth in Supabase Dashboard:
   - Authentication → Providers → Google → Enable and add OAuth credentials
   - Add redirect URLs: `http://localhost:5173`, `http://127.0.0.1:5173`

**Alternative:** Run `supabase/migrations/20260101_initial_schema.sql` in the Supabase SQL Editor if you prefer not to use the CLI.

## Development Workflow

### Local Development

```bash
npm run dev              # Start dev server at http://localhost:5173
npm run build            # Production build
npm run preview          # Preview production build locally
npm run lint             # Run ESLint
```

### Working with Supabase

The project uses Supabase for authentication, data storage, and real-time updates. Key database tables:

- **users**: OAuth user profiles with role and node_id binding
- **nodes**: Family tree nodes (people) with metadata
- **links**: Relationships between nodes (parent, sibling, marriage)
- **node_invites**: Invite tokens for node binding

### Permission Model

The 1-degree network model ensures users can only interact with:

- **Self**: Their own bound node
- **Parents**: Direct parent links
- **Children**: Direct child links
- **Siblings**: Nodes sharing at least one parent
- **Spouse**: Marriage link connections

This is enforced through:

1. RLS policies on tables (database-level)
2. `is_within_1_degree()` helper function (validates node access)
3. Frontend guards (prevents UI exposure of unauthorized data)

## Vercel Deployment

The project is configured for automatic deployment on Vercel:

1. Push to the `main` branch
2. Vercel automatically builds and deploys
3. Environment variables are configured in Vercel dashboard

## Key Concepts

### Force-Directed Layout

The graph uses physics simulation to position nodes—connected nodes attract, while all nodes repel each other slightly. This creates natural clustering of family groups while maintaining readability.

### Starship Navigation

The app uses a frame-based movement loop. The camera's "look direction" is driven by mouse position (steering), and movement is relative to that view. This allows users to "fly" through the clusters, maintaining a constant sense of presence in the family network.

### Node Binding

Users must be "bound" to a specific node in the tree to gain access. This binding:

1. Establishes the user's identity within the family tree
2. Determines which nodes/links they can access (1-degree network)
3. Enables personalized navigation (e.g., "center on my node")

### Invite System

The tree follows a "distributed ownership" model - you can only "grow" the parts you're actually related to.

Admins or existing family members can generate invite tokens for specific nodes. New users claim these tokens to bind their account, ensuring controlled onboarding and maintaining data integrity.
