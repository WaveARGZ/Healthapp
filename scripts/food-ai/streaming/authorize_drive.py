"""One-time, explicit Drive OAuth setup. Persists credentials only, never data.

Uses Google's installed-app OAuth library, with loopback + PKCE. This avoids
gcloud versions that require cloud-platform scope even for a Drive-only client.
Run with python -B. No auto-install, API activation, or existing-ADC overwrite.
"""
import argparse
import json
import logging
import os
from pathlib import Path
import sys

SCOPE = "https://www.googleapis.com/auth/drive"


def validate_client(config):
    client = config.get("installed", {})
    if (
        not client.get("client_id", "").endswith(".apps.googleusercontent.com")
        or not client.get("client_secret")
        or client.get("auth_uri") != "https://accounts.google.com/o/oauth2/auth"
        or client.get("token_uri") != "https://oauth2.googleapis.com/token"
        or "web" in config
    ):
        raise ValueError("Expected Google desktop OAuth client")


def credential_record(credentials, token):
    scope_value = token.get("scope", [])
    granted = set(scope_value.split() if isinstance(scope_value, str) else scope_value)
    if granted != {SCOPE} or not credentials.refresh_token:
        raise ValueError("Expected Drive-only offline authorization")
    return {
        "type": "authorized_user",
        "client_id": credentials.client_id,
        "client_secret": credentials.client_secret,
        "refresh_token": credentials.refresh_token,
        "scopes": [SCOPE],
    }


def save_new_credentials(destination, record):
    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    # Refuse even a dangling symlink and never replace credentials from another app.
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        json.dump(record, handle, indent=2)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())


def main():
    parser = argparse.ArgumentParser(description="Authorize only Google Drive for BodyMake training")
    parser.add_argument("--client-file", required=True, type=Path)
    parser.add_argument("--google-sdk-third-party", type=Path)
    args = parser.parse_args()
    logging.disable(logging.CRITICAL)  # OAuth redirect codes must not enter logs.
    if os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") or os.environ.get("CLOUDSDK_CONFIG"):
        raise ValueError("Custom credential location needs explicit review")
    destination = Path.home() / ".config/gcloud/application_default_credentials.json"
    if destination.exists() or destination.is_symlink():
        raise FileExistsError("Existing credentials must be preserved")
    config = json.loads(args.client_file.read_text(encoding="utf-8"))
    validate_client(config)
    if args.google_sdk_third_party:
        sys.path.insert(0, str(args.google_sdk_third_party.resolve(strict=True)))
    from google_auth_oauthlib.flow import InstalledAppFlow

    flow = InstalledAppFlow.from_client_config(config, [SCOPE], autogenerate_code_verifier=True)
    credentials = flow.run_local_server(
        host="127.0.0.1", port=0, open_browser=True, timeout_seconds=600,
        prompt="consent", access_type="offline",
        authorization_prompt_message="Google認証画面を開きました。ログインしてDriveへのアクセスを許可してください。",
        success_message="Authorization received. Return to BodyMake / Codex for the connection check.",
    )
    save_new_credentials(destination, credential_record(credentials, flow.oauth2session.token))
    print("Drive専用の認証設定を保存しました。次にfoodDBへの接続を確認します。", flush=True)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("認証を中断しました。", file=sys.stderr)
        sys.exit(130)
    except Exception as error:
        # Do not print OAuth error bodies, redirect URLs, codes, or credential values.
        print(f"認証設定は完了していません（{type(error).__name__}）。", file=sys.stderr)
        sys.exit(1)
