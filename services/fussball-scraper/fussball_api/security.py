from time import monotonic

from fastapi import Header, HTTPException, status

from .config import settings

_rate_limit_state: dict[str, tuple[int, float]] = {}


async def get_api_key(api_key: str = Header(..., alias="X-API-Key")):
    """
    Dependency function to verify the API key from the request header.

    :param api_key: The API key passed in the 'X-API-Key' header.
    :raises HTTPException: If the API key is invalid.
    """
    if api_key != settings.API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API Key",
        )
    enforce_rate_limit(api_key)


def enforce_rate_limit(api_key: str) -> None:
    limit = settings.RATE_LIMIT_REQUESTS
    window_seconds = settings.RATE_LIMIT_WINDOW_SECONDS
    if limit <= 0 or window_seconds <= 0:
        return

    now = monotonic()
    count, window_start = _rate_limit_state.get(api_key, (0, now))
    if now - window_start >= window_seconds:
        count = 0
        window_start = now

    if count >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded",
        )

    _rate_limit_state[api_key] = (count + 1, window_start)
