# Use the official Node.js image as the base image
FROM node:20.5.1 as build

# Set the working directory in the container
WORKDIR /app


COPY ./package.json .
COPY ./package-lock.json .
# Install Angular CLI and the project's dependencies
RUN npm install -g @angular/cli && npm install

COPY . .
# Build the Angular app for production
RUN ng build --configuration production --source-map=true

# Use the official NGINX image to serve the Angular app
FROM nginx:alpine

# Copy the built Angular app from the previous stage to the NGINX container
COPY --from=build /app/dist/frontend /srv/www/queueify
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN chmod -R 777 /etc/nginx
RUN chmod -R 777 /srv/www
# Expose port 80
EXPOSE 80 443

# Start NGINX
CMD ["nginx", "-g", "daemon off;"]
