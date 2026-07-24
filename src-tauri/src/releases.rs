use crate::{
    app::AppState,
    library,
    types::{GithubRelease, ReleaseInfo},
};
use chrono::Utc;
use tauri::State;

const LATEST_URL: &str =
    "https://api.github.com/repos/Flowseal/zapret-discord-youtube/releases/latest";
#[tauri::command]
pub async fn check_latest_release(state: State<'_, AppState>) -> Result<ReleaseInfo, String> {
    let client = reqwest::Client::builder()
        .user_agent("Zapretyd/0.2")
        .build()
        .map_err(|e| e.to_string())?;
    let response = client
        .get(LATEST_URL)
        .send()
        .await
        .map_err(|e| format!("error.release.fetchFailed|{e}"))?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    let etag = response
        .headers()
        .get("etag")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let release: GithubRelease = response.json().await.map_err(|e| e.to_string())?;
    let asset = select_asset(&release)
        .ok_or_else(|| "error.release.noZipAsset".to_string())?;
    let asset_name = asset.name.clone();
    let download_url = asset.browser_download_url.clone();
    let size = asset.size;
    let installed = state
        .settings
        .lock()
        .map_err(|e| e.to_string())?
        .library_path
        .as_deref()
        .map(library::installed_tags)
        .transpose()?
        .unwrap_or_default();
    let is_newer_than_installed = !installed.iter().any(|tag| tag == &release.tag_name);
    let info = ReleaseInfo {
        tag: release.tag_name,
        name: release
            .name
            .unwrap_or_else(|| "zapret-discord-youtube".into()),
        published_at: release.published_at,
        download_url,
        asset_name,
        size,
        is_newer_than_installed,
    };
    let mut settings = state.settings.lock().map_err(|e| e.to_string())?;
    settings.last_update_check = Some(Utc::now().to_rfc3339());
    settings.latest_etag = etag;
    state.persist(&settings)?;
    Ok(info)
}
pub fn select_asset(release: &GithubRelease) -> Option<&crate::types::GithubAsset> {
    release
        .assets
        .iter()
        .find(|asset| asset.name.to_ascii_lowercase().ends_with(".zip"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{GithubAsset, GithubRelease};
    #[test]
    fn selects_zip_asset() {
        let release = GithubRelease {
            tag_name: "1".into(),
            name: None,
            published_at: "x".into(),
            assets: vec![
                GithubAsset {
                    name: "a.rar".into(),
                    browser_download_url: "".into(),
                    size: 0,
                },
                GithubAsset {
                    name: "a.zip".into(),
                    browser_download_url: "".into(),
                    size: 0,
                },
            ],
        };
        assert_eq!(select_asset(&release).unwrap().name, "a.zip");
    }
}
