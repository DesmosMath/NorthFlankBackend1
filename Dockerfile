# Use an official Node.js 18 image (which includes built-in fetch)
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json first to cache dependencies
COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Copy the rest of your application code
COPY . .

# Tell Northflank which port the app will run on
EXPOSE 8080

# The command to start the application
CMD [ "npm", "start" ]
