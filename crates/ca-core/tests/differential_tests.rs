//! The differential gate (ADR 0002): the packed engine against the reference stepper, bit-exact,
//! over several rules including the awkward ones.

use ca_core::{Engine, PackedEngine, ReferenceEngine, Rule};

const W: usize = 64;
const H: usize = 64;

fn build(rule: Rule, seed: u32) -> (PackedEngine, ReferenceEngine) {
    let cells = ca_core::seed::soup(W, H, seed, 30);
    (
        PackedEngine::from_cells(rule, W, H, &cells).unwrap(),
        ReferenceEngine::from_cells(rule, W, H, &cells),
    )
}

#[test]
fn packed_matches_reference_bit_exactly() {
    let rules = [
        Rule::life(),
        Rule::parse("B36/S23").unwrap(),
        Rule::parse("B2/S").unwrap(),
        Rule::parse("B0/S8").unwrap(),
        Rule::parse("B/S012345678").unwrap(),
        Rule::parse("B368/S238").unwrap(),
    ];

    for rule in rules {
        let (mut packed, mut reference) = build(rule, 42);
        for generation in 1..=40 {
            packed.step(1);
            reference.step(1);
            if let Some(index) = packed
                .cells()
                .iter()
                .zip(reference.cells())
                .position(|(a, b)| a != b)
            {
                panic!(
                    "rule {rule} diverged at generation {generation}, cell ({}, {})",
                    index % W,
                    index / W
                );
            }
        }
        assert_eq!(
            packed.digest(),
            reference.digest(),
            "digest mismatch for rule {rule}"
        );
    }
}

#[test]
fn the_gate_catches_a_wrong_rule() {
    // If this test ever passes silently, the comparison above is not actually comparing.
    let (mut packed, mut reference) = build(Rule::life(), 7);
    reference.step(0);
    let mut other = ReferenceEngine::from_cells(Rule::parse("B36/S23").unwrap(), W, H, packed.cells());
    packed.step(10);
    other.step(10);
    assert_ne!(packed.digest(), other.digest(), "different rules must differ");
    reference.step(0);
}

#[test]
fn step_is_idempotent_at_zero() {
    let (mut packed, mut reference) = build(Rule::life(), 3);
    let before = packed.digest();
    packed.step(0);
    reference.step(0);
    assert_eq!(packed.digest(), before);
    assert_eq!(packed.digest(), reference.digest());
}

#[test]
fn b0_rule_ignites_an_empty_grid() {
    // B0: a dead cell with zero neighbours is born, so the empty torus fills immediately.
    let empty = vec![0u8; W * H];
    let mut engine = PackedEngine::from_cells(Rule::parse("B0/S").unwrap(), W, H, &empty).unwrap();
    engine.step(1);
    assert!(engine.cells().iter().all(|&c| c == 1), "B0 fills the grid");
}
