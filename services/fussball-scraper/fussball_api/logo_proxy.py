import hashlib
import logging
from pathlib import Path
from typing import Optional

import httpx

from .config import settings

logger = logging.getLogger(__name__)


def _logo_filename(url: str) -> str:
    """
    Generates a deterministic filename from a logo URL using MD5 hash.

    :param url: The original logo URL.
    :return: A filename like 'a1b2c3d4.png'.
    """
    url_hash = hashlib.md5(url.encode("utf-8")).hexdigest()
    return f"{url_hash}.png"


def download_and_rewrite_logo(original_url: str) -> str:
    """
    Downloads a logo from fussball.de and stores it locally.
    Returns a local path suitable for Nginx serving.

    If the file already exists, skips the download.
    On failure, returns the original URL as fallback.

    :param original_url: The original fussball.de logo URL.
    :return: A local path like '/logos/a1b2c3d4.png' or the original URL on error.
    """
    if not original_url:
        return original_url

    filename = _logo_filename(original_url)
    file_path = settings.LOGOS_DIR / filename

    if file_path.exists():
        return f"{settings.LOGO_BASE_URL}/logos/{filename}"

    try:
        with httpx.Client(follow_redirects=True, timeout=10.0) as client:
            resp = client.get(original_url)

        if resp.status_code != 200:
            logger.warning(
                f"Failed to download logo from {original_url}: HTTP {resp.status_code}"
            )
            return original_url

        settings.LOGOS_DIR.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(resp.content)
        logger.info(f"Downloaded logo: {original_url} -> {filename}")
        return f"{settings.LOGO_BASE_URL}/logos/{filename}"

    except httpx.RequestError as e:
        logger.error(f"Error downloading logo from {original_url}: {e}")
        return original_url
