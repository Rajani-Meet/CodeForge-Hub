# ⚛️ Code Forge Hub - Frontend

This is the Next.js-powered Frontend for the Code Forge Hub Cloud IDE. It handles the user interface, real-time collaboration canvas, PTY terminal rendering, and the Monaco code editor.

## 🌟 Key Features

- **Monaco Engine:** Uses `@monaco-editor/react` to replicate the VSCode experience perfectly in the browser.
- **XTerm.js:** Provides a robust, fully-featured Linux terminal experience directly in the browser via WebSockets.
- **Yjs Collaboration:** Uses `yjs`, `y-monaco`, and `y-websocket` to sync real-time user cursors and file changes.
- **Modern Styling:** Built with TailwindCSS v4 and animated using Framer Motion & GSAP for a premium "glassmorphic" feel.
- **State Management:** Fully managed local state using `zustand`.
- **Supabase Integration:** Used for real-time file tree persistence and user authentication via `@supabase/ssr`.

## 🛠️ Setup & Development

Ensure the backend server is running, as the frontend heavily relies on it for container initialization and project tree data.

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create an `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-key
NEXT_PUBLIC_API_URL=http://localhost:4001
```

### 3. Run the Server

```bash
# Starts the frontend server on port 4000
npm run dev
```

Visit `http://localhost:4000` to interact with the application.

## 🌍 Production

To build and run the frontend in a production capacity without using the main project's `docker-compose`:

```bash
# Set production variables
export NODE_ENV=production
export NEXT_PUBLIC_API_URL=https://api.yourdomain.com

# Build the Next.js application
npm run build

# Start the optimized production server
npm run start
```
