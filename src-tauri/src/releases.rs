use crate::{
    app::AppState,
    http::http_client,
    library,
    types::{GithubRelease, ReleaseCatalog, ReleaseInfo, ReleasePage},
};
use chrono::Utc;
use tauri::State;

const LATEST_URL: &str =
    "https://api.github.com/repos/Flowseal/zapret-discord-youtube/releases/latest";
const RELEASES_URL: &str =
    "https://api.github.com/repos/Flowseal/zapret-discord-youtube/releases";
const RELEASE_BY_TAG_URL: &str =
    "https://api.github.com/repos/Flowseal/zapret-discord-youtube/releases/tags";
const PER_PAGE: u32 = 10;

fn map_http_status_error(error: reqwest::Error) -> String {
    let message = error.to_string();
    if message.to_ascii_lowercase().contains("rate limit") {
        format!("error.release.rateLimited|{message}")
    } else {
        message
    }
}

fn installed_tags_for(state: &AppState) -> Result<Vec<String>, String> {
    let base = library::managed_library_path(&state.config_dir)?;
    library::installed_tags(&base)
}

pub fn release_to_info(release: &GithubRelease, installed: &[String]) -> Option<ReleaseInfo> {
    if release.draft {
        return None;
    }
    let asset = select_asset(release)?;
    Some(ReleaseInfo {
        tag: release.tag_name.clone(),
        name: release
            .name
            .clone()
            .unwrap_or_else(|| "zapret-discord-youtube".into()),
        published_at: release.published_at.clone(),
        download_url: asset.browser_download_url.clone(),
        asset_name: asset.name.clone(),
        size: asset.size,
        is_newer_than_installed: !installed.iter().any(|tag| tag == &release.tag_name),
        body: release.body.clone(),
        html_url: release.html_url.clone(),
        prerelease: release.prerelease,
    })
}

fn cached_catalog(state: &AppState, error: Option<String>) -> Option<ReleaseCatalog> {
    let settings = state.settings.lock().ok()?;
    let latest_tag = settings.cached_latest_tag.clone()?;
    let installed = installed_tags_for(state).unwrap_or_default();
    Some(ReleaseCatalog {
        latest_tag: latest_tag.clone(),
        from_cache: true,
        is_newer_than_installed: !installed.iter().any(|tag| tag == &latest_tag),
        error,
    })
}

#[tauri::command]
pub async fn refresh_release_catalog(
    state: State<'_, AppState>,
) -> Result<ReleaseCatalog, String> {
    match fetch_and_store_catalog(&state).await {
        Ok(catalog) => Ok(catalog),
        Err(error) => cached_catalog(&state, Some(error.clone())).ok_or(error),
    }
}

async fn fetch_and_store_catalog(state: &AppState) -> Result<ReleaseCatalog, String> {
    let client = http_client()?;
    let cached_etag = state
        .settings
        .lock()
        .ok()
        .and_then(|s| s.latest_etag.clone());
    let mut request = client.get(LATEST_URL);
    if let Some(etag) = cached_etag.as_deref() {
        request = request.header("If-None-Match", etag);
    }
    let latest_response = request
        .send()
        .await
        .map_err(|e| format!("error.release.fetchFailed|{e}"))?;
    if latest_response.status() == reqwest::StatusCode::NOT_MODIFIED {
        let settings = state.settings.lock().map_err(|e| e.to_string())?;
        let latest_tag = settings
            .cached_latest_tag
            .clone()
            .ok_or_else(|| "error.release.fetchFailed".to_string())?;
        let installed = installed_tags_for(state).unwrap_or_default();
        return Ok(ReleaseCatalog {
            latest_tag: latest_tag.clone(),
            from_cache: false,
            is_newer_than_installed: !installed.iter().any(|tag| tag == &latest_tag),
            error: None,
        });
    }
    let latest_response = latest_response
        .error_for_status()
        .map_err(map_http_status_error)?;
    let etag = latest_response
        .headers()
        .get("etag")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let latest: GithubRelease = latest_response.json().await.map_err(|e| e.to_string())?;
    let latest_tag = latest.tag_name;
    let installed = installed_tags_for(state).unwrap_or_default();
    let is_newer_than_installed = !installed.iter().any(|tag| tag == &latest_tag);

    if let Ok(mut settings) = state.settings.lock() {
        settings.cached_latest_tag = Some(latest_tag.clone());
        settings.last_update_check = Some(Utc::now().to_rfc3339());
        settings.latest_etag = etag;
        let _ = state.persist(&settings);
    }

    Ok(ReleaseCatalog {
        latest_tag,
        from_cache: false,
        is_newer_than_installed,
        error: None,
    })
}

#[tauri::command]
pub async fn check_latest_release(state: State<'_, AppState>) -> Result<ReleaseInfo, String> {
    let client = http_client()?;
    let response = client
        .get(LATEST_URL)
        .send()
        .await
        .map_err(|e| format!("error.release.fetchFailed|{e}"))?
        .error_for_status()
        .map_err(map_http_status_error)?;
    let etag = response
        .headers()
        .get("etag")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let release: GithubRelease = response.json().await.map_err(|e| e.to_string())?;
    let installed = installed_tags_for(&state)?;
    let info = release_to_info(&release, &installed)
        .ok_or_else(|| "error.release.noZipAsset".to_string())?;
    let mut settings = state.settings.lock().map_err(|e| e.to_string())?;
    settings.last_update_check = Some(Utc::now().to_rfc3339());
    settings.latest_etag = etag;
    settings.cached_latest_tag = Some(info.tag.clone());
    state.persist(&settings)?;
    Ok(info)
}

#[tauri::command]
pub async fn list_releases(state: State<'_, AppState>, page: u32) -> Result<ReleasePage, String> {
    let page = page.max(1);
    let client = http_client()?;
    let response = client
        .get(RELEASES_URL)
        .query(&[("per_page", PER_PAGE), ("page", page)])
        .send()
        .await
        .map_err(|e| format!("error.release.fetchFailed|{e}"))?
        .error_for_status()
        .map_err(map_http_status_error)?;
    let raw: Vec<GithubRelease> = response.json().await.map_err(|e| e.to_string())?;
    let has_more = (raw.len() as u32) == PER_PAGE;
    let installed = installed_tags_for(&state)?;
    let releases = raw
        .iter()
        .filter_map(|release| release_to_info(release, &installed))
        .collect();
    Ok(ReleasePage {
        releases,
        page,
        has_more,
    })
}

#[tauri::command]
pub async fn get_release(state: State<'_, AppState>, tag: String) -> Result<ReleaseInfo, String> {
    let tag = tag.trim();
    if tag.is_empty() {
        return Err("error.release.fetchFailed".into());
    }
    let client = http_client()?;
    let url = format!("{RELEASE_BY_TAG_URL}/{tag}");
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("error.release.fetchFailed|{e}"))?
        .error_for_status()
        .map_err(map_http_status_error)?;
    let release: GithubRelease = response.json().await.map_err(|e| e.to_string())?;
    let installed = installed_tags_for(&state)?;
    release_to_info(&release, &installed).ok_or_else(|| "error.release.noZipAsset".to_string())
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

    fn sample_release(draft: bool, zip: bool) -> GithubRelease {
        GithubRelease {
            tag_name: "1.0.0".into(),
            name: Some("Release 1.0.0".into()),
            published_at: "2024-01-01T00:00:00Z".into(),
            assets: if zip {
                vec![GithubAsset {
                    name: "a.zip".into(),
                    browser_download_url: "https://example.com/a.zip".into(),
                    size: 10,
                }]
            } else {
                vec![GithubAsset {
                    name: "a.rar".into(),
                    browser_download_url: "".into(),
                    size: 0,
                }]
            },
            body: Some("notes".into()),
            prerelease: false,
            draft,
            html_url: Some("https://example.com/release".into()),
        }
    }

    #[test]
    fn selects_zip_asset() {
        let release = sample_release(false, true);
        assert_eq!(select_asset(&release).unwrap().name, "a.zip");
    }

    #[test]
    fn release_to_info_skips_drafts_and_missing_zip() {
        assert!(release_to_info(&sample_release(true, true), &[]).is_none());
        assert!(release_to_info(&sample_release(false, false), &[]).is_none());
        let info = release_to_info(&sample_release(false, true), &["1.0.0".into()]).unwrap();
        assert!(!info.is_newer_than_installed);
        assert_eq!(info.body.as_deref(), Some("notes"));
        assert!(!info.prerelease);
    }
}
