#!/bin/sh

# Set default port if not provided
PORT=${PORT:-8080}

# Replace the PORT placeholder in nginx config
sed -i "s/\${PORT:-8080}/$PORT/g" /etc/nginx/nginx.conf.template

# Move the config to the correct location
mv /etc/nginx/nginx.conf.template /etc/nginx/nginx.conf

# Start nginx
nginx -g 'daemon off;'