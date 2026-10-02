# Stage 1: Build React PWA
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
# Set production API URL to relative /api or custom domain
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# Stage 2: Serve with lightweight Nginx
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
