FROM denoland/deno:alpine-2.2.12
WORKDIR /app
COPY index.ts deno.json ./
# Fetch pinned dependencies while building, never when serving a request.
RUN deno cache index.ts
USER deno
EXPOSE 8000
CMD ["run", "--cached-only", "--allow-net=0.0.0.0:8000,db:5432", "--allow-env", "index.ts"]
