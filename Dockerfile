# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1 as base
WORKDIR /usr/src/app

# install dependencies into temp directory
# this will cache them and speed up future builds
FROM base AS install
RUN mkdir -p /temp/dev && mkdir /temp/prod
WORKDIR /temp/dev
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# install with --production (exclude devDependencies)
WORKDIR /temp/prod
COPY package.json bun.lockb ./
RUN  bun install --frozen-lockfile --production

# copy node_modules from temp directory
# then copy all (non-ignored) project files into the image
FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

# build
ENV NODE_ENV=production
RUN bun run build

# copy production dependencies and source code into final image
FROM nginx:alpine AS runtime
COPY ./nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=prerelease /usr/src/app/dist /usr/share/nginx/html
EXPOSE 8080
