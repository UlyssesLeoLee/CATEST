use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;


#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct TermBaseEntry {
    pub id: Uuid,
    pub tenant_id: Option<Uuid>,
    pub category: String,
    pub source_term: String,
    pub target_term: Option<String>,
    pub is_forbidden: Option<bool>,
    pub explanation: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct RuleBaseEntry {
    pub id: Uuid,
    pub tenant_id: Option<Uuid>,
    pub rule_type: String,
    pub condition_desc: String,
    pub message: String,
    pub severity: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn term_base_entry_serializes_correctly() {
        let id = Uuid::new_v4();
        let entry = TermBaseEntry {
            id,
            tenant_id: None,
            category: "general".to_string(),
            source_term: "API".to_string(),
            target_term: Some("接口".to_string()),
            is_forbidden: Some(false),
            explanation: Some("技术术语".to_string()),
        };
        let json = serde_json::to_string(&entry).expect("Should serialize");
        assert!(json.contains("API"));
        assert!(json.contains("接口"));
        assert!(json.contains("general"));

        let deserialized: TermBaseEntry = serde_json::from_str(&json).expect("Should deserialize");
        assert_eq!(deserialized.id, id);
        assert_eq!(deserialized.source_term, "API");
        assert_eq!(deserialized.target_term, Some("接口".to_string()));
    }

    #[test]
    fn term_base_entry_optional_fields_can_be_null() {
        let entry = TermBaseEntry {
            id: Uuid::new_v4(),
            tenant_id: None,
            category: "legal".to_string(),
            source_term: "GDPR".to_string(),
            target_term: None,
            is_forbidden: None,
            explanation: None,
        };
        let json = serde_json::to_string(&entry).expect("Should serialize");
        let deserialized: TermBaseEntry = serde_json::from_str(&json).expect("Should deserialize");
        assert!(deserialized.tenant_id.is_none());
        assert!(deserialized.target_term.is_none());
        assert!(deserialized.is_forbidden.is_none());
    }

    #[test]
    fn rule_base_entry_serializes_correctly() {
        let id = Uuid::new_v4();
        let entry = RuleBaseEntry {
            id,
            tenant_id: None,
            rule_type: "style".to_string(),
            condition_desc: "avoid_magic_numbers".to_string(),
            message: "Use named constants instead of magic numbers".to_string(),
            severity: Some("warning".to_string()),
        };
        let json = serde_json::to_string(&entry).expect("Should serialize");
        assert!(json.contains("style"));
        assert!(json.contains("warning"));

        let deserialized: RuleBaseEntry = serde_json::from_str(&json).expect("Should deserialize");
        assert_eq!(deserialized.id, id);
        assert_eq!(deserialized.severity, Some("warning".to_string()));
    }

    #[test]
    fn rule_base_entry_severity_can_be_none() {
        let entry = RuleBaseEntry {
            id: Uuid::new_v4(),
            tenant_id: None,
            rule_type: "security".to_string(),
            condition_desc: "no_hardcoded_secrets".to_string(),
            message: "Secrets must not be hardcoded".to_string(),
            severity: None,
        };
        let json = serde_json::to_string(&entry).expect("Should serialize");
        let deserialized: RuleBaseEntry = serde_json::from_str(&json).expect("Should deserialize");
        assert!(deserialized.severity.is_none());
    }
}
