"""Harden the pinned deployment suite without reading secret values.

Load common parameters first, then service parameters: the last reference for
each name wins. Reject upstream drift rather than applying a partial patch.
"""
from pathlib import Path
import re
import sys


SECRET_MERGE = ".containerDefinitions[0].secrets[$psenvcount |tonumber] |= .+ { name: $name, valueFrom: $value  }"
UNIQUE_SECRETS = ".containerDefinitions[0].secrets = ((.containerDefinitions[0].secrets // []) | map(select(.name != $name)) + [{name: $name, valueFrom: $value}])"
REGISTER = "if REVISION=$(aws ecs register-task-definition --cli-input-json \"$template\" | $JQ '.taskDefinition.taskDefinitionArn'); then"
REGISTER_CHECKED = "if REVISION=$(aws ecs register-task-definition --cli-input-json \"$template\" | $JQ '.taskDefinition.taskDefinitionArn') && [[ \"$REVISION\" == arn:*:ecs:*:task-definition/*:* ]]; then"
VERIFY_SERVICE = '''check_service_status() {
    local service_name="$1"
    local service_status
    aws ecs wait services-stable --cluster "$AWS_ECS_CLUSTER" --services "$service_name" || return 1
    service_status=$(aws ecs describe-services --cluster "$AWS_ECS_CLUSTER" --services "$service_name") || return 1
    if ! jq -e --arg revision "$REVISION" '
        (.failures // [] | length) == 0 and
        (.services | length) == 1 and
        (.services[0] |
          .taskDefinition == $revision and .desiredCount > 0 and
          .runningCount == .desiredCount and .pendingCount == 0 and
          (.deployments | length) == 1 and
          .deployments[0].taskDefinition == $revision and
          .deployments[0].rolloutState == "COMPLETED")
      ' <<<"$service_status" >/dev/null; then
        echo "ECS did not stabilize on the requested task definition: $REVISION" >&2
        return 1
    fi
    echo "ECS service $service_name is running $REVISION"
}
'''


def prepare(source):
    """Patch only the exact known suite; every required change must match once."""
    replacements = [
        ("#!/bin/bash\n", "#!/bin/bash\nset -o pipefail\n"),
        (SECRET_MERGE, UNIQUE_SECRETS),
        (REGISTER, REGISTER_CHECKED),
        ('update_result=$(aws ecs update-service --cluster $AWS_ECS_CLUSTER --service $AWS_ECS_SERVICE --task-definition $REVISION )',
         'update_result=$(aws ecs update-service --cluster "$AWS_ECS_CLUSTER" --service "$AWS_ECS_SERVICE" --task-definition "$REVISION") || return 1'),
        ("            ECS_template_create_register\n", "            ECS_template_create_register || exit 1\n"),
        ('                    ECS_deploy_cluster "$AWS_ECS_SERVICE_NAME"\n', '                    ECS_deploy_cluster "$AWS_ECS_SERVICE_NAME" || exit 1\n'),
        ('                    check_service_status "$AWS_ECS_SERVICE_NAME"\n', '                    check_service_status "$AWS_ECS_SERVICE_NAME" || exit 1\n'),
    ]
    for original, replacement in replacements:
        if source.count(original) != 1:
            raise ValueError("Unexpected deployment script; review upstream before deploying")
        source = source.replace(original, replacement)
    parameter_fetch = 'aws ssm get-parameters-by-path --path $k --query "Parameters[*].{Name:Name}" > paramnames.json'
    if source.count(parameter_fetch) != 2:
        raise ValueError("Unexpected parameter reference lookup")
    source = source.replace(parameter_fetch, parameter_fetch + " || return 1")
    source, count = re.subn(r"check_service_status\(\) \{\n.*?\n\}\n", lambda _: VERIFY_SERVICE, source, flags=re.S)
    if count != 1:
        raise ValueError("Unexpected deployment status check")
    return source


if __name__ == "__main__":
    target = Path(sys.argv[1])
    target.write_text(prepare(target.read_text()))
