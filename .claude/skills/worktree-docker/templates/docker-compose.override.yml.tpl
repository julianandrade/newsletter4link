# Override layer for the {{tx-id-display}} worktree stack.
# Merged on top of each project's setup/local/docker-compose.yml via:
#
#   docker compose -p {{tx-id-lower}} {{compose-args}} \
#     -f ./docker-compose.override.yml \
#     --env-file ./.env \
#     up -d --build
#
# Purpose:
#  - rename every hard-coded container_name with a {{tx-id-lower}}_ prefix
#  - remap every host-side port by +{{port-offset}}
#  - replace the external myapp_shared network with a project-local {{tx-id-lower}}_shared net
#  - pin every build.context, volume, and bind-mount to an absolute WSL path
#    (relative paths in any -f file are resolved against the FIRST -f file's
#    directory — the backend root in this layout — so they land in the wrong
#    project tree if not pinned)
#  - tag every overridden list (ports, volumes) with `!override` so the merge
#    REPLACES the base list rather than UNION-ing it (otherwise the base ports
#    like 9092:9092 survive next to the override's 9192:9092)
{{frontend-config-comment}}

services:
{{services-block}}

networks:
  # Replace the external myapp_shared net with a project-local one so the
  # {{tx-id-display}} stack does not collide with the main workspace stack.
  myapp_shared:
    external: false
    name: {{tx-id-lower}}_shared
