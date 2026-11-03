"""Exercise the actual patched deployment functions against an isolated AWS stub."""
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import unittest

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('prepare', ROOT / 'prepare-deploy-script.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DeploymentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source = Path(os.environ['DEPLOY_SCRIPT_SOURCE']).read_text()
        cls.original = source
        cls.patched = module.prepare(source)

    def function(self, name):
        return re.search(r'^' + name + r'\(\) \{\n.*?\n\}', self.patched, re.M | re.S).group()

    def shell(self, code, env=None):
        return subprocess.run(['bash', '-c', 'set -o pipefail\n' + code], text=True, capture_output=True, env={**os.environ, **(env or {})})

    def test_secret_override_keeps_one_reference_per_name(self):
        result = self.shell(self.function('psenvaddition') + '''
        template='{"containerDefinitions":[{}]}'
        psenvcount=0
        psenvaddition AUTH0_AUDIENCE /common/AUTH0_AUDIENCE
        psenvaddition SHARED_ONLY /common/SHARED_ONLY
        psenvaddition AUTH0_AUDIENCE /service/AUTH0_AUDIENCE
        psenvaddition KEYCLOAK_AUDIENCE /common/KEYCLOAK_AUDIENCE
        psenvaddition KEYCLOAK_AUDIENCE /service/KEYCLOAK_AUDIENCE
        echo "$template"
        ''')
        self.assertEqual(result.returncode, 0, result.stderr)
        secrets = json.loads(result.stdout)['containerDefinitions'][0]['secrets']
        self.assertEqual(len(secrets), 3)
        self.assertEqual({s['name']: s['valueFrom'] for s in secrets}, {
            'AUTH0_AUDIENCE': '/service/AUTH0_AUDIENCE',
            'KEYCLOAK_AUDIENCE': '/service/KEYCLOAK_AUDIENCE',
            'SHARED_ONLY': '/common/SHARED_ONLY',
        })

    def test_registration_rejects_aws_failure_empty_and_null_results(self):
        block = re.search(r'            if REVISION=.*?\n        fi', self.patched, re.S).group()
        for response, exit_code in [('', 255), ('', 0), ('{}', 0), ('{"taskDefinition":{"taskDefinitionArn":"null"}}', 0), ('{"taskDefinition":{"taskDefinitionArn":"arn:aws:ecs:us-east-1:123:task-definition/test:2"}}', 255)]:
            with self.subTest(response=response, exit_code=exit_code):
                result = self.shell('''
                aws() { printf '%s' "$RESPONSE"; return "$AWS_EXIT"; }
                log() { :; }
                track_error() { exit "$1"; }
                JQ='jq --raw-output --exit-status'
                register() {
                ''' + block + '\n}\nregister\n', {'RESPONSE': response, 'AWS_EXIT': str(exit_code)})
                self.assertNotEqual(result.returncode, 0)

    def test_registration_accepts_task_definition_arn(self):
        block = re.search(r'            if REVISION=.*?\n        fi', self.patched, re.S).group()
        result = self.shell('''
        aws() { echo '{"taskDefinition":{"taskDefinitionArn":"arn:aws:ecs:us-east-1:123:task-definition/test:2"}}'; }
        log() { :; }
        track_error() { exit "$1"; }
        JQ='jq --raw-output --exit-status'
        register() {
        ''' + block + '\n}\nregister\n')
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_update_failure_is_not_reported_as_success(self):
        result = self.shell('''
        aws() {
          case "$2" in
            describe-clusters) echo '{"clusters":[{"clusterName":"test"}]}' ;;
            describe-services) echo '{"services":[{"status":"ACTIVE"}]}' ;;
            update-service) return 255 ;;
          esac
        }
        AWS_ECS_CLUSTER=test
        REVISION=arn:aws:ecs:us-east-1:123:task-definition/test:2
        ''' + self.function('ECS_deploy_cluster') + '\nECS_deploy_cluster test\n')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('intialised successfully', result.stdout)

    def test_stability_requires_exact_revision_running_count_and_completed_rollout(self):
        revision = 'arn:aws:ecs:us-east-1:123:task-definition/test:2'
        service = {'taskDefinition': revision, 'desiredCount': 1, 'runningCount': 1, 'pendingCount': 0,
                   'deployments': [{'taskDefinition': revision, 'rolloutState': 'COMPLETED'}]}
        cases = [(service, 0), ({**service, 'taskDefinition': revision[:-1] + '1'}, 1),
                 ({**service, 'runningCount': 0}, 1), ({**service, 'pendingCount': 1}, 1),
                 ({**service, 'desiredCount': 0, 'runningCount': 0}, 1),
                 ({**service, 'deployments': [{**service['deployments'][0], 'rolloutState': 'IN_PROGRESS'}]}, 1),
                 ({**service, 'deployments': service['deployments'] * 2}, 1)]
        for state, expected in cases:
            with self.subTest(state=state):
                result = self.shell('''
                aws() { if [ "$2" = wait ]; then return 0; fi; printf '%s' "$RESPONSE"; }
                AWS_ECS_CLUSTER=test
                ''' + self.function('check_service_status') + '\ncheck_service_status test',
                    {'REVISION': revision, 'RESPONSE': json.dumps({'services': [state]})})
                self.assertEqual(result.returncode, expected, result.stderr)

    def test_waiter_failure_propagates(self):
        result = self.shell('aws() { return 255; }\n' + self.function('check_service_status') + '\ncheck_service_status test')
        self.assertNotEqual(result.returncode, 0)

    def test_main_stops_after_registration_update_or_verification_failure(self):
        main = re.search(r'^main\(\)\s*\{\n.*?\n\}', self.patched, re.M | re.S).group()
        for failed in ['ECS_template_create_register', 'ECS_deploy_cluster', 'check_service_status']:
            with self.subTest(failed=failed):
                setup = """
                input_parsing_validation() { DEPLOYMENT_TYPE=ECS; DEPLOYCATEGORY=AWSCLI; AWS_ECS_SERVICE=test; }
                validate_update_loggroup() { :; }
                ECS_push_ecr_image() { :; }
                ECS_template_create_register() { echo REGISTER; }
                ECS_deploy_cluster() { echo UPDATE; }
                check_service_status() { echo VERIFIED; }
                log() { :; }
                """
                result = self.shell(setup + f'\n{failed}() {{ return 7; }}\n' + main + '\nmain\necho FALSE_SUCCESS\n')
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn('FALSE_SUCCESS', result.stdout)
                if failed == 'ECS_template_create_register':
                    self.assertNotIn('UPDATE', result.stdout)
                if failed != 'check_service_status':
                    self.assertNotIn('VERIFIED', result.stdout)

    def test_refuses_upstream_drift_before_writing(self):
        with self.assertRaises(ValueError):
            module.prepare(self.original.replace(module.SECRET_MERGE, 'different implementation'))
        with self.assertRaises(ValueError):
            module.prepare(self.patched)

    def test_patched_script_parses(self):
        result = subprocess.run(['bash', '-n'], input=self.patched, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main()
