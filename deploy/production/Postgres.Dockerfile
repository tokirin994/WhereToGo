# The official PGDG repository supplies PostGIS for both amd64 and arm64.
# Do not force linux/amd64 or use an x86-only PostGIS image on an Oracle A1 VM.
FROM postgres:16-bookworm
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-16-postgis-3 postgresql-16-postgis-3-scripts \
 && rm -rf /var/lib/apt/lists/*
