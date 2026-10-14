# Frontend image: build the Next.js app, then serve it with `next start`.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# Copy the built app + deps from the build stage.
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "start"]
