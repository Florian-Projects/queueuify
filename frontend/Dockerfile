# Use the official Node.js image as the base image
FROM node:20.5.1 as build

# Set the working directory in the container
WORKDIR /app

COPY . .

# Install Angular CLI and the project's dependencies
RUN npm install -g @angular/cli && npm install

# Build the Angular app for production
RUN ng build --configuration production

# Use the official NGINX image to serve the Angular app
FROM nginx:alpine

# Copy the built Angular app from the previous stage to the NGINX container
COPY --from=build /app/dist/frontend /etc/srv/www/queueify
COPY nginx.conf /etc/nginx/config.d/default.conf

# Expose port 80
EXPOSE 80 443

# Start NGINX
CMD ["nginx", "-g", "daemon off;"]
