PROJECT_NAME={{tx-id-lower}}
IMAGE_TAG={{tx-id-lower}}

# Host ports (offset +{{port-offset}} from defaults to coexist with main stack and other worktree stacks)
API_PORT={{api-port}}
APP_PORT={{app-port}}
MONGO_GUI_PORT={{mongo-gui-port}}
REDIS_GUI_PORT={{redis-gui-port}}
KAFKA_GUI_PORT={{kafka-gui-port}}

# Mongo admin creds (defaults from base compose)
API_DB_ADMIN_USER=admin
API_DB_ADMIN_PW=pw
