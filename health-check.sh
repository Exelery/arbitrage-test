#!/bin/bash
if ! docker ps | grep -q spread-bot; then
    echo "Bot container is down. Restarting..."
    docker-compose -f /path/to/spread-bot/docker-compose.yml restart
    curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=Bot was down and has been restarted"
fi 