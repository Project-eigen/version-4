FROM python:3.11-slim

WORKDIR /app

# Install system dependencies needed for compiling psycopg2 and Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY . .

# Create uploads directory with correct permissions
RUN mkdir -p /app/uploads

EXPOSE 5000

# Run with Gunicorn using WSGI app factory
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "3", "--threads", "2", "--timeout", "120", "app:create_app()"]
