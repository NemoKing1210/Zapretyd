use crate::{
    app::AppState,
    library,
    types::{GithubRelease, ReleaseCatalog, ReleaseInfo, ReleasePage},
};
use chrono::Utc;
use reqwest::header::{HeaderMap, LINK};
use tauri::State;

const LATEST_URL: &str =
    "https://api.github.com/repos/Flowseal/zapret-discord-youtube/releases/latest";
const RELEASES_URL: &str =
    "https://api.github.com/repos/Flowseal/zapret-discord-youtube/releases";
const PER_PAGE: u32 = 10;
const USER_AGENT: &str = "Zapretyd/0.4";

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| e.to_string())
}

fn installed_tags_for(state: &AppState) -> Result<Vec<String>, String> {
    state
        .settings
        .lock()
        .map_err(|e| e.to_string())?
        .library_path
        .as_deref()
        .map(library::installed_tags)
        .transpose()
        .map(|tags| tags.unwrap_or_default())
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

/// Parse GitHub `Link` header and return the `page` value of `rel="last"`.
pub fn parse_link_last_page(link: &str) -> Option<u32> {
    for part in link.split(',') {
        let part = part.trim();
        if !(part.contains("rel=\"last\"")
            || part.contains("rel='last'")
            || part.contains("rel=last"))
        {
            continue;
        }
        // Match `?page=` / `&page=` only — not the `page=` inside `per_page=`.
        let page = part
            .split(&['?', '&', '>'][..])
            .find_map(|segment| segment.strip_prefix("page="))?;
        let digits: String = page.chars().take_while(|c| c.is_ascii_digit()).collect();
        return digits.parse().ok();
    }
    None
}

fn release_count_from_headers(headers: &HeaderMap, page_items: usize) -> u32 {
    headers
        .get(LINK)
        .and_then(|value| value.to_str().ok())
        .and_then(parse_link_last_page)
        .unwrap_or(page_items as u32)
}

fn cached_catalog(state: &AppState) -> Option<ReleaseCatalog> {
    let settings = state.settings.lock().ok()?;
    Some(ReleaseCatalog {
        latest_tag: settings.cached_latest_tag.clone()?,
        release_count: settings.cached_release_count?,
        from_cache: true,
    })
}

#[tauri::command]
pub async fn refresh_release_catalog(
    state: State<'_, AppState>,
) -> Result<ReleaseCatalog, String> {
    match fetch_and_store_catalog(&state).await {
        Ok(catalog) => Ok(catalog),
        Err(error) => cached_catalog(&state).ok_or(error),
    }
}

async fn fetch_and_store_catalog(state: &AppState) -> Result<ReleaseCatalog, String> {
    let client = http_client()?;
    let latest_response = client
        .get(LATEST_URL)
        .send()
        .await
        .map_err(|e| format!("error.release.fetchFailed|{e}"))?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    let etag = latest_response
        .headers()
        .get("etag")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let latest: GithubRelease = latest_response.json().await.map_err(|e| e.to_string())?;
    let latest_tag = latest.tag_name;

    let count_response = client
        .get(RELEASES_URL)
        .query(&[("per_page", 1_u32), ("page", 1_u32)])
        .send()
        .await
        .map_err(|e| format!("error.release.fetchFailed|{e}"))?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    let headers = count_response.headers().clone();
    let page: Vec<GithubRelease> = count_response.json().await.map_err(|e| e.to_string())?;
    let release_count = release_count_from_headers(&headers, page.len());

    if let Ok(mut settings) = state.settings.lock() {
        settings.cached_latest_tag = Some(latest_tag.clone());
        settings.cached_release_count = Some(release_count);
        settings.last_update_check = Some(Utc::now().to_rfc3339());
        settings.latest_etag = etag;
        let _ = state.persist(&settings);
    }

    Ok(ReleaseCatalog {
        latest_tag,
        release_count,
        from_cache: false,
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
        .map_err(|e| e.to_string())?;
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
        .map_err(|e| e.to_string())?;
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

    #[test]
    fn parses_link_last_page() {
        let link = r#"<https://api.github.com/repositories/869741127/releases?per_page=1&page=2>; rel="next", <https://api.github.com/repositories/869741127/releases?per_page=1&page=45>; rel="last""#;
        assert_eq!(parse_link_last_page(link), Some(45));
        assert_eq!(
            parse_link_last_page(r#"<https://example.com?page=3>; rel="next""#),
            None
        );
    }
}
