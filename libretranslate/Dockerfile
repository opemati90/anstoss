# Self-hosted LibreTranslate for Anstoss chat translation.
# Pre-loads the language pairs we ship in the app (de/en/fr/pt/it/tr/ar).
# Deployed on Railway as a separate service alongside the API; the API
# reaches it via the Railway internal network at LIBRETRANSLATE_URL.
FROM libretranslate/libretranslate:latest

# LT_LOAD_ONLY restricts the Argos models downloaded at first boot — keeps
# the image to ~2 GB instead of ~12 GB and makes cold start tolerable.
ENV LT_LOAD_ONLY=de,en,fr,pt,it,tr,ar
ENV LT_DISABLE_FILES_TRANSLATION=true
ENV LT_DISABLE_WEB_UI=true
ENV LT_CHAR_LIMIT=2000
ENV LT_HOST=0.0.0.0
ENV LT_PORT=5000

EXPOSE 5000

# Optional API key (set LT_API_KEYS in Railway env to require keys; the
# Anstoss API passes it via the Authorization header).
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD curl -fsS http://localhost:5000/languages || exit 1
