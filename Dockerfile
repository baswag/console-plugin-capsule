FROM registry.access.redhat.com/hi/nodejs:24.15.0-builder AS build
USER root

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

ADD . /usr/src/app
WORKDIR /usr/src/app

RUN npx yarn install --immutable && npx yarn build

FROM registry.access.redhat.com/hi/nginx:1.30.1

COPY --from=build /usr/src/app/dist /usr/share/nginx/html
USER 1001

ENTRYPOINT ["nginx", "-g", "daemon off;"]
