from pathlib import Path

controller = Path('backend/src/main/java/com/javanavi/api/SchemaSyncCompatibilityController.java')
service = Path('backend/src/main/java/com/javanavi/sync/SchemaSyncCompatibilityService.java')
rate_limit = Path('backend/src/main/java/com/javanavi/security/ApiRateLimitFilter.java').read_text()

assert controller.exists(), 'SchemaSyncCompatibilityController.java is missing'
assert service.exists(), 'SchemaSyncCompatibilityService.java is missing'
controller_text = controller.read_text()
service_text = service.read_text()

for token in [
    '@RequestMapping("/api/v1/schema-sync")',
    '@PostMapping("/analyze")',
    '@PostMapping("/preview")',
    '@PostMapping("/run")',
    '@PostMapping("/cancel")',
]:
    assert token in controller_text, f'missing controller token: {token}'

for token in ['analyze(', 'preview(', 'run(', 'cancel(']:
    assert token in service_text, f'missing service method token: {token}'

assert '/api/v1/schema-sync/' in rate_limit, 'schema sync path is not rate limited'
print('ok')
