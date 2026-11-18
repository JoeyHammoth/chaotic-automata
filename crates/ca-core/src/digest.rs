//! Grid digests.

use sha2::{Digest, Sha256};

pub fn of(cells: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(cells);
    let out = hasher.finalize();
    let mut digest = [0u8; 32];
    digest.copy_from_slice(&out);
    digest
}
