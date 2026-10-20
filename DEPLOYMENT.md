## Docker build performance

The Dockerfiles use Next.js `output: standalone` and `COPY --chown` so the runner image does not copy full `node_modules` and does not run `chown -R /app`. If a build appears stuck on a `chown -R` step, you are building an older package. Rebuild from this package.

Build on your build machine:

```bash
cd lumapa-landing
docker build --no-cache -t lumapa-landing:latest .
docker save -o lumapa-landing.tar lumapa-landing:latest

cd ../lumapa-wallet
docker build --no-cache -t lumapa-wallet:latest .
docker save -o lumapa-wallet.tar lumapa-wallet:latest
```

On the server:

```bash
docker load -i lumapa-landing.tar
docker load -i lumapa-wallet.tar
docker compose -f docker-compose.prod.yml up -d
```

