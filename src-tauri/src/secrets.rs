// Persisted, per-install secrets for the bundled Next.js server. Generated
// once on first launch and re-used on every subsequent boot. Stored at
// `<app_data>/secrets.env` in plain `KEY=VALUE` form (the surrounding directory
// is OS-protected and the contents never leave the machine).

use base64::Engine;
use rand::RngCore;
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::Path;

const SECRETS_FILE: &str = "secrets.env";
const REQUIRED_KEYS: &[&str] = &["AUTH_SECRET", "ENCRYPTION_KEY"];

pub fn load_or_generate(data_root: &Path) -> HashMap<String, String> {
    let path = data_root.join(SECRETS_FILE);
    let mut map = HashMap::new();

    if let Ok(text) = fs::read_to_string(&path) {
        for line in text.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                continue;
            }
            if let Some((k, v)) = trimmed.split_once('=') {
                map.insert(k.trim().to_string(), v.trim().to_string());
            }
        }
    }

    let mut changed = false;
    for &key in REQUIRED_KEYS {
        if !map.contains_key(key) {
            map.insert(key.to_string(), generate());
            changed = true;
        }
    }

    if changed {
        if let Ok(mut file) = fs::File::create(&path) {
            for (k, v) in &map {
                let _ = writeln!(file, "{k}={v}");
            }
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
            }
        }
    }

    map
}

fn generate() -> String {
    let mut buf = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut buf);
    base64::engine::general_purpose::STANDARD.encode(buf)
}
