# Anstoss internal admin console - static HTML/CSS/JS served by nginx.
# Deploy as a separate protected internal Railway service.

FROM nginx:1.27-alpine

RUN rm /etc/nginx/conf.d/default.conf

COPY docker-entrypoint.d/10-admin-basic-auth.sh /docker-entrypoint.d/10-admin-basic-auth.sh
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY src/ /usr/share/nginx/html/

ENV PORT=8080
ENV API_UPSTREAM=https://anstoss-api-production.up.railway.app
ENV NGINX_ENVSUBST_FILTER="^(PORT|API_UPSTREAM)$"
EXPOSE 8080
