FROM node:24-alpine AS build
WORKDIR /app

COPY client/package.json client/package-lock.json client/.npmrc ./
RUN npm ci

COPY client/ .
RUN npx ng build --configuration production

FROM nginx:alpine AS runtime
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/client/browser /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=5s --retries=10 --start-period=15s \
    CMD wget -q -O- http://127.0.0.1:80/ || exit 1
