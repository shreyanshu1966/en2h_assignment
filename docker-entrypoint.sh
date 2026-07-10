#!/bin/sh
set -e

npm run migration:run:prod
exec node dist/main
