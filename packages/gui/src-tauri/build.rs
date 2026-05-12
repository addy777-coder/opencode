use std::{env, fs, path::PathBuf};

fn main() {
    println!("cargo:rerun-if-env-changed=TAURI_UPDATER_PUBKEY");
    ensure_dev_sidecar_placeholder();
    tauri_build::build()
}

fn ensure_dev_sidecar_placeholder() {
    if env::var("PROFILE").as_deref() == Ok("release") {
        return;
    }

    let Ok(target) = env::var("TARGET") else {
        return;
    };
    if target.trim().is_empty() {
        return;
    }

    let extension = if target.contains("windows") {
        ".exe"
    } else {
        ""
    };
    let path = PathBuf::from("binaries").join(format!("opencode-server-{target}{extension}"));
    if path.exists() {
        return;
    }

    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(path, []);
}
