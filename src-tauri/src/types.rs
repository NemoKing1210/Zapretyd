use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub library_path: Option<String>,
    pub auto_check_updates: bool,
    pub last_update_check: Option<String>,
    pub latest_etag: Option<String>,
    pub theme: String,
    #[serde(default = "default_locale")]
    pub locale: String,
}

fn default_locale() -> String {
    "system".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseInfo {
    pub tag: String,
    pub name: String,
    pub published_at: String,
    pub download_url: String,
    pub asset_name: String,
    pub size: u64,
    pub is_newer_than_installed: bool,
    pub body: Option<String>,
    pub html_url: Option<String>,
    pub prerelease: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleasePage {
    pub releases: Vec<ReleaseInfo>,
    pub page: u32,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledVersion {
    pub tag: String,
    pub path: String,
    pub installed_at: String,
    pub size: u64,
    pub sha256: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategyInfo {
    pub name: String,
    pub path: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ServiceStatus {
    pub is_admin: bool,
    pub service_exists: bool,
    pub service_running: bool,
    pub windivert_running: bool,
    pub winws_running: bool,
    pub active_strategy: Option<String>,
    pub message_code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub tag: String,
    pub downloaded: u64,
    pub total: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct GithubRelease {
    pub tag_name: String,
    pub name: Option<String>,
    pub published_at: String,
    pub assets: Vec<GithubAsset>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub prerelease: bool,
    #[serde(default)]
    pub draft: bool,
    #[serde(default)]
    pub html_url: Option<String>,
}
#[derive(Debug, Deserialize)]
pub struct GithubAsset {
    pub name: String,
    pub browser_download_url: String,
    pub size: u64,
}
