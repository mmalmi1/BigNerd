FROM node
WORKDIR ./
COPY package*.json ./
RUN npm install
copy . .
EXPOSE 5000
CMD ["npm", "run", "start"]
