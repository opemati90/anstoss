# Use an official Python runtime as a parent image
FROM python:3.13-slim

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container at /app
COPY requirements.txt .

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application's code from the host to the container at /app
COPY ./fussball_api /app/fussball_api

# Create runtime directories: logos for cached club logos, examples
# preserved as an empty dir so anyone running locally with the
# upstream's docker-compose mounts it cleanly.
RUN mkdir -p /app/logos /app/examples /app/cache

# Expose default port. Railway/Fly inject $PORT — the CMD honours it.
EXPOSE 8000

# Shell-form CMD so $PORT is expanded at runtime by Railway/Fly. Falls
# back to 8000 for plain `docker run` and the upstream docker-compose.
CMD uvicorn fussball_api.main:app --host 0.0.0.0 --port ${PORT:-8000}
