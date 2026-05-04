# 🟢 Code Forge Hub - Backend

This is the Express & Node.js Backend for the Code Forge Hub Cloud IDE. It serves as the orchestrator for all underlying user workspaces, manages Docker container lifecycles, and proxies the real-time PTY (Pseudo-Terminal) sessions to the frontend over WebSockets.

## 🌟 Key Features

- **Dockerode Orchestration:** Spawns and manages isolated user development environments dynamically.
- **Real-Time PTY:** Uses `node-pty` and `socket.io` to pipe terminal streams directly to the frontend.
- **Zero-Latency Git-Sync:** Automatically stashes, commits, and pushes to a user's GitHub repository when a container session is gracefully exited.
- **Collaboration Server:** Utilizes `y-websocket` to handle CRDT document synchronization for real-time pair programming.
- **AI Agent API:** Connects to OpenRouter and Gemini to provide context-aware chat and intelligent code completion.

## 🛠️ Setup & Development

The backend requires Docker to be running on the host machine.

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create a `.env` file based on `.env.example` (or similar required fields):

```env
PORT=4001
FRONTEND_URL=http://localhost:4000
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-key
OPENROUTER_API_KEY=your-openrouter-key
GITHUB_CLIENT_ID=your-github-oauth-id
GITHUB_CLIENT_SECRET=your-github-oauth-secret
```

### 3. Run the Server

```bash
# Starts the server using tsx watch
npm run dev
```

The API will be available at `http://localhost:4001`.

## 🌍 Production Deployment

Deploying the backend to production requires careful handling of the Docker socket since it actively spawns and destroys containers. We highly recommend using an **AWS EC2 Instance** (e.g., Ubuntu t3.medium or larger) with Docker installed.

1. **Build the TypeScript application:**
   ```bash
   npm run build
   ```

2. **Start the Production Server:**
   ```bash
   # Run the compiled javascript
   npm run start
   ```

### Notes on Containerization (AWS EC2 / ECS)
If you decide to deploy this backend inside a Docker container itself (Docker-in-Docker) on your EC2 instance, you must mount the host's Docker socket to allow `dockerode` to communicate with the daemon:

```bash
docker run -d \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -p 4001:4001 \
  --env-file .env \
  codeforge-backend
```

### Zombie Container Cleanup
The backend includes a background chron-job that sweeps the host's Docker daemon for orphaned or "zombie" containers to prevent memory leaks and Docker socket exhaustion. Keep the backend running continuously for this to function properly.
