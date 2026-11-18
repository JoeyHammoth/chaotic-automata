//! Life-like rules: `B<digits>/S<digits>`, an 18-bit encoding, and a canonical form.
//!
//! The canonical form is what the URL and the data products carry, so parsing a rule and
//! re-printing it must be a fixed point. That property is tested, not assumed.

use std::fmt;

/// A Life-like totalistic rule: the neighbour counts that birth and that survive.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rule {
    birth: u16,
    survival: u16,
}

/// A rule string that could not be parsed, with a message specific enough to show a user.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuleError {
    pub message: String,
}

impl RuleError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for RuleError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for RuleError {}

impl Rule {
    /// Conway's Life, the one rule that has to be right before any other.
    pub fn life() -> Self {
        Self::parse("B3/S23").expect("B3/S23 parses")
    }

    pub fn parse(text: &str) -> Result<Self, RuleError> {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return Err(RuleError::new(
                "rule is empty; expected B<digits>/S<digits>, for example B3/S23",
            ));
        }
        let parts: Vec<&str> = trimmed.split('/').collect();
        if parts.len() != 2 {
            return Err(RuleError::new(format!(
                "expected exactly one '/', found {} separators in '{trimmed}'",
                parts.len() - 1
            )));
        }
        Ok(Self {
            birth: parse_set(parts[0], 'B')?,
            survival: parse_set(parts[1], 'S')?,
        })
    }

    /// The 18-bit encoding: birth in bits 0-8, survival in bits 9-17.
    pub fn mask(&self) -> u32 {
        self.birth as u32 | (self.survival as u32) << 9
    }

    pub fn from_mask(mask: u32) -> Self {
        Self {
            birth: (mask & 0x1ff) as u16,
            survival: ((mask >> 9) & 0x1ff) as u16,
        }
    }

    pub fn birth_mask(&self) -> u16 {
        self.birth
    }

    pub fn survival_mask(&self) -> u16 {
        self.survival
    }

    /// The next state of one cell. The engine's bit-parallel loops compute the same function.
    pub fn next_state(&self, alive: bool, neighbours: u32) -> bool {
        let mask = if alive { self.survival } else { self.birth };
        mask >> neighbours & 1 == 1
    }

    pub fn canonical(&self) -> String {
        format!("B{}/S{}", digits(self.birth), digits(self.survival))
    }
}

fn digits(mask: u16) -> String {
    (0..9u32)
        .filter(|count| mask >> count & 1 == 1)
        .map(|count| count.to_string())
        .collect()
}

fn parse_set(part: &str, prefix: char) -> Result<u16, RuleError> {
    let mut chars = part.chars();
    match chars.next() {
        Some(c) if c.eq_ignore_ascii_case(&prefix) => {}
        Some(other) => {
            return Err(RuleError::new(format!(
                "expected '{prefix}' at the start of '{part}', found '{other}'"
            )))
        }
        None => return Err(RuleError::new(format!("missing '{prefix}' set"))),
    }
    let mut mask = 0u16;
    for c in chars {
        match c.to_digit(10) {
            Some(count) if count <= 8 => mask |= 1 << count,
            Some(count) => {
                return Err(RuleError::new(format!(
                    "neighbour count {count} is out of range 0-8 in '{part}'"
                )))
            }
            None => return Err(RuleError::new(format!("'{c}' is not a digit in '{part}'"))),
        }
    }
    Ok(mask)
}

impl fmt::Display for Rule {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.canonical())
    }
}
