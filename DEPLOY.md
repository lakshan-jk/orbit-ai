# Deploying Orbit (self-hosted, with Ollama in-stack)

`docker-compose.prod.yml` runs the whole app — Postgres, the model (Ollama +
llama3.2), the API, and the web UI — on a single server. Only the web UI
(port 3000) is exposed; the backend and model stay on the internal network.

## 1. Pick a host

llama3.2 runs on CPU but wants memory and cores. Recommended minimum:

| | RAM | vCPU | Disk |
|---|-----|------|------|
| Workable | 8 GB | 2 | 20 GB |
| Comfortable | 16 GB | 4 | 20 GB |

Any Docker-capable VPS works (Hetzner, DigitalOcean, Fly.io Machines, a home
server, etc.). CPU inference is slower than a GPU — fine for a demo.

## 2. Provision + install Docker

```bash
# On a fresh Ubuntu box, as root:
curl -fsSL https://get.docker.com | sh
```

## 3. Get the code + set a secret

```bash
git clone https://github.com/lakshan-jk/orbit-ai.git
cd orbit-ai
export ORBIT_JWT_SECRET=$(openssl rand -hex 32)   # REQUIRED — 32+ bytes
export POSTGRES_PASSWORD=$(openssl rand -hex 16)   # optional, defaults to "orbit"
```

## 4. Launch

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

First boot pulls the `llama3.2` model (~2 GB) into a named volume — give it a
few minutes. Check progress:

```bash
docker compose -f docker-compose.prod.yml logs -f ollama-pull
```

Once up, open `http://<server-ip>:3000`, register an account, and chat.

## 5. Open the firewall

Allow inbound TCP **3000** (or put a reverse proxy in front — next step).

## 6. (Recommended) Domain + HTTPS with Caddy

Point a domain's A record at the server, then run Caddy for automatic TLS:

```bash
docker run -d --name caddy --network host \
  caddy caddy reverse-proxy --from orbit.example.com --to localhost:3000
```

Now Orbit is live at `https://orbit.example.com`.

## Operations

```bash
# Update to the latest code
git pull && docker compose -f docker-compose.prod.yml up -d --build

# Logs / status
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend

# Stop (data persists in named volumes)
docker compose -f docker-compose.prod.yml down
```

Migrations run automatically on backend boot (`alembic upgrade head`), so
schema changes apply on each deploy. Postgres data and pulled models live in
the `pgdata` and `ollama_models` volumes and survive restarts.

## Notes

- **`ORBIT_JWT_SECRET` is mandatory** in prod — compose refuses to start without
  it. Rotating it invalidates existing sessions.
- The backend isn't published to the host; the web container proxies `/api/*`
  to it over the internal network.
- To use a hosted model instead of in-stack Ollama, point `ORBIT_OLLAMA_URL` at
  any Ollama-compatible endpoint.
