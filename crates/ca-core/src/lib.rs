//! Engines for Computation Atlas.
//!
//! One trait ([`Engine`]), two implementations: a bit-packed stepper (the fast path, ADR 0004) and
//! a naive `u8` stepper (the reference that keeps it honest, ADR 0002). Both are toruses. Both
//! satisfy the same interface, so a caller — the site, the sweep, a test — never learns which one
//! it holds.

pub mod digest;
pub mod packed;
pub mod reference;
pub mod rule;
pub mod seed;

pub use packed::{EngineError, PackedEngine};
pub use reference::ReferenceEngine;
pub use rule::{Rule, RuleError};

/// The seam every engine sits behind.
///
/// Implementors must be deterministic for a given rule, size and initial cells: `step` is defined
/// by the rule, not by wall-clock time or iteration order.
pub trait Engine {
    fn width(&self) -> usize;

    fn height(&self) -> usize;

    /// Advance `steps` generations. `step(0)` is a no-op.
    fn step(&mut self, steps: u32);

    /// The current grid, row-major, one byte per cell (0 or 1).
    fn cells(&self) -> &[u8];

    /// SHA-256 of [`Engine::cells`]. Cheap to compare, awkward to collide by accident.
    fn digest(&self) -> [u8; 32] {
        digest::of(self.cells())
    }
}
