# Anstoss marketing site — static HTML/CSS/JS served by nginx.
# Deployed on Railway as a separate service; pointed at apps/web/ via railway.toml.

FROM nginx:1.27-alpine

# Drop the default nginx server block and replace with one that listens on
# Railway's $PORT (defaults to 8080) and serves /usr/share/nginx/html.
RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/templates/default.conf.template

# Copy the static site. apps/web/src is the source of truth (the npm `build`
# script just copies src→dist), so we copy src directly to keep the image
# self-contained without needing a node build step.
COPY src/ /usr/share/nginx/html/

ENV PORT=8080
EXPOSE 8080

# nginx:alpine's entrypoint runs envsubst on /etc/nginx/templates/*.template
# and writes the result to /etc/nginx/conf.d/ before launching nginx, so $PORT
# is interpolated at container start.
