#!/usr/bin/env bash
set -euo pipefail

# This hook ensures critical test files contain REAL integration tests, not mocks.
# If tests are reverted to use vi.mock or vi.fn mocking patterns, this check fails.

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null)"
if [[ -z "$ROOT_DIR" ]]; then
  ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi

# List of test files that MUST NOT contain mocking
PROTECTED_TESTS=(
  "tests/web/api/admin/endpoints.test.ts"
  "tests/web/api/humans/endpoints.test.ts"
  "tests/web/api/bookings/fund-escrow.test.ts"
  "tests/web/api/bookings/complete.test.ts"
  "tests/web/api/bookings/proof.test.ts"
  "tests/web/api/webhooks/stripe.test.ts"
  "tests/web/api/webhooks/coinbase.test.ts"
)

MOCK_PATTERNS=(
  "vi\.mock\("
  "vi\.fn\(\)"
  "mockResolvedValue"
  "mockReturnValue"
  "vi\.mocked\("
)

FORBIDDEN_LOCAL_PATTERNS=(
  "http://localhost"
  "127\\.0\\.0\\.1"
  "new NextRequest\\("
  "from ['\"]@/app/api/"
)

REQUIRED_REMOTE_HINTS=(
  "API_BASE_URL"
  "buildUrl\\("
  "fetch\\(buildUrl\\("
)

exit_code=0

for test_file in "${PROTECTED_TESTS[@]}"; do
  full_path="$ROOT_DIR/$test_file"

  if [[ ! -f "$full_path" ]]; then
    echo "ERROR: Protected test file missing: $test_file"
    exit_code=1
    continue
  fi

  for pattern in "${MOCK_PATTERNS[@]}"; do
    if grep -qE "$pattern" "$full_path"; then
      echo "ERROR: $test_file contains forbidden mock pattern: $pattern"
      echo "  This is PRODUCTION. Tests MUST be real integration tests."
      echo "  Do NOT use vi.mock, vi.fn, or mockResolvedValue."
      exit_code=1
    fi
  done

  for pattern in "${FORBIDDEN_LOCAL_PATTERNS[@]}"; do
    if grep -qE "$pattern" "$full_path"; then
      echo "ERROR: $test_file contains local-only integration pattern: $pattern"
      echo "  Protected integration tests must exercise deployed API URLs, not local route handlers."
      exit_code=1
    fi
  done

  for pattern in "${REQUIRED_REMOTE_HINTS[@]}"; do
    if ! grep -qE "$pattern" "$full_path"; then
      echo "ERROR: $test_file is missing required remote integration hint: $pattern"
      echo "  Protected integration tests must define API_BASE_URL + buildUrl() and use fetch(buildUrl(...))."
      exit_code=1
    fi
  done
done

if [[ $exit_code -eq 0 ]]; then
  echo "check-real-tests: PASS (no mocking patterns in protected tests)"
fi

exit $exit_code
