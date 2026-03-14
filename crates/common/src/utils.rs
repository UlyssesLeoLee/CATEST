use anyhow::{Context, Result};
use std::env;

pub fn get_env(key: &str) -> Result<String> {
    env::var(key).with_context(|| format!("Environment variable {} not set", key))
}

pub fn get_env_default(key: &str, default: &str) -> String {
    env::var(key).unwrap_or_else(|_| default.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_env_missing_returns_error() {
        let result = get_env("__CATEST_NONEXISTENT_VAR_12345");
        assert!(result.is_err());
    }

    #[test]
    fn test_get_env_default_returns_default_when_missing() {
        let val = get_env_default("__CATEST_NONEXISTENT_VAR_12345", "fallback");
        assert_eq!(val, "fallback");
    }

    #[test]
    fn test_get_env_default_uses_env_value() {
        std::env::set_var("__CATEST_TEST_VAR", "overridden");
        let val = get_env_default("__CATEST_TEST_VAR", "fallback");
        assert_eq!(val, "overridden");
        std::env::remove_var("__CATEST_TEST_VAR");
    }
}
