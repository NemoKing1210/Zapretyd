use std::sync::OnceLock;

const USER_AGENT: &str = "Zapretyd/0.4";

/// Shared HTTP client for GitHub API and release ZIP downloads (connection reuse).
pub fn http_client() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    if let Some(client) = CLIENT.get() {
        return Ok(client);
    }
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(CLIENT.get_or_init(|| client))
}
