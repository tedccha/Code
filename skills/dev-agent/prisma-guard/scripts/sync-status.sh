#!/bin/bash

# Prisma Sync Status Checker
# Compares schema modification time with generated client

SCHEMA_PATH="prisma/schema.prisma"
CLIENT_PATH="node_modules/.prisma/client/schema.prisma"

if [ ! -f "$SCHEMA_PATH" ]; then
    echo "Error: $SCHEMA_PATH not found."
    exit 1
fi

if [ ! -f "$CLIENT_PATH" ]; then
    echo "Warning: Generated client schema not found. Needs generation."
    exit 2
fi

SCHEMA_TIME=$(stat -f %m "$SCHEMA_PATH")
CLIENT_TIME=$(stat -f %m "$CLIENT_PATH")

if [ "$SCHEMA_TIME" -gt "$CLIENT_TIME" ]; then
    echo "OUT_OF_SYNC: Schema is newer than generated client."
    exit 10
else
    echo "SYNCED: Client matches schema."
    exit 0
fi
