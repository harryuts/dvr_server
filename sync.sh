#!/bin/bash

# Default values
DEFAULT_DEV="192.168.1.225"
DEFAULT_PROD="mammampos.mammam.com.au"
DEFAULT_PHUONG18="phuong18pos.mammam.com.au"

echo "Select target server:"
echo "1) dev_server ($DEFAULT_DEV)"
echo "2) mammam_prod ($DEFAULT_PROD)"
echo "3) phuong18_prod ($DEFAULT_PHUONG18)"
read -p "Enter choice [1]: " choice

# Default to 1 if empty
choice=${choice:-1}

case $choice in
    1)
        export REMOTE_HOST="$DEFAULT_DEV"
        ;;
    2)
        export REMOTE_HOST="$DEFAULT_PROD"
        ;;
    3)
        export REMOTE_HOST="$DEFAULT_PHUONG18"
        export REMOTE_USER="khoa"
        export REMOTE_PATH="/home/khoa/dvr_server"
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo "Syncing to $REMOTE_HOST..."
node scripts/sync-to-remote.js
