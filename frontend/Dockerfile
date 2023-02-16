# Make new build
FROM node
WORKDIR ./
COPY package*.json ./
COPY vite.config.js ./
COPY index.html ./
COPY public ./public/
COPY src ./src/
RUN npm install
CMD ["npm", "run", "build"]

# Start nginx web server
FROM nginx
#WORKDIR ./
# Copy nginx conf
RUN rm /etc/nginx/conf.d/default.conf
COPY default /etc/nginx/conf.d/default.conf
COPY localhost.decrypted.key ./
COPY localhost.crt ./
COPY dist /var/www/B1gNerd

# Expose ports
EXPOSE 443
EXPOSE 80
