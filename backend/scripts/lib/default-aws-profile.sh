#!/usr/bin/env bash
# Medimade default AWS credential profile.
#
# If AWS_PROFILE is already set, do nothing.
# Otherwise, if env/static credentials or CI are already present, do nothing
# (GitHub Actions has no local `mm` profile; AWS SDK v3 prefers AWS_PROFILE over
# AWS_ACCESS_KEY_ID and would fail with "Could not load credentials").
# Otherwise, if --profile NAME / --profile=NAME is on the command line, export
# AWS_PROFILE so post-CDK steps (env sync, seed) share the same credentials.
# Otherwise export AWS_PROFILE=mm.
#
# Usage (from other bash scripts):
#   SCRIPT_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/lib" && pwd)"
#   # shellcheck source=default-aws-profile.sh
#   source "$SCRIPT_LIB/default-aws-profile.sh"
#   medimade_default_aws_profile "$@"
medimade_default_aws_profile() {
  if [[ -n "${AWS_PROFILE:-}" ]]; then
    return 0
  fi
  if [[ -n "${AWS_ACCESS_KEY_ID:-}" ]] || [[ "${GITHUB_ACTIONS:-}" == "true" ]] || [[ "${CI:-}" == "true" ]]; then
    return 0
  fi
  local i
  for ((i = 1; i <= $#; i++)); do
    local a="${!i}"
    if [[ "$a" == "--profile" ]]; then
      local j=$((i + 1))
      local next="${!j:-}"
      if [[ -n "$next" && "$next" != -* ]]; then
        export AWS_PROFILE="$next"
      fi
      return 0
    fi
    if [[ "$a" == --profile=* ]]; then
      export AWS_PROFILE="${a#--profile=}"
      return 0
    fi
  done
  export AWS_PROFILE=mm
}
