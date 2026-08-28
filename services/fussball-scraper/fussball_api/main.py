"""Retired compatibility service.

Anstoss displays user-supplied official federation team pages as references.
It does not crawl, parse, prewarm, cache, proxy, or expose federation data.
The Railway service remains as an inert tombstone so existing infrastructure
can be rolled back safely without leaving a live scraper endpoint.
"""

from fastapi import FastAPI, HTTPException, Request, status


app = FastAPI(
    title="Anstoss official-page reference service",
    description="Automated federation data ingestion is permanently disabled.",
    version="2.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


@app.get("/")
async def read_root():
    return {
        "status": "disabled",
        "message": "Official team pages are reference-only; scraping and imports are disabled.",
    }


@app.api_route(
    "/api/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
)
async def retired_api(_request: Request, path: str):
    del path
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Automated federation data ingestion is disabled.",
    )
