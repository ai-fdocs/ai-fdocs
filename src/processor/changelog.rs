pub fn trim_changelog(content: &str, version: &str) -> String {
    let marker = format!("## {version}");
    if let Some(start) = content.find(&marker) {
        let rest = &content[start..];
        if let Some(next) = rest[marker.len()..].find("\n## ") {
            return rest[..marker.len() + next].to_string();
        }
        return rest.to_string();
    }
    content.to_string()
}
