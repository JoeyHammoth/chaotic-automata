//! Metric tests that use behaviour we can state without a picture.

use ca_core::Rule;
use ca_sweep::{derive_seed, measure, Budgets};

fn budgets() -> Budgets {
    Budgets {
        lattice: 64,
        warm: 8,
        max_steps: 64,
        period_cap: 128,
        ..Budgets::default()
    }
}

#[test]
fn derive_seed_is_deterministic_and_separates_neighbours() {
    let a = derive_seed(15, 8, 1, 11);
    assert_eq!(a, derive_seed(15, 8, 1, 11));
    assert_ne!(a, derive_seed(16, 8, 1, 11));
    assert_ne!(a, derive_seed(15, 8, 2, 11));
    assert_ne!(a, derive_seed(15, 8, 1, 23));
    assert_ne!(a, 0, "xorshift must never start at zero");
}

#[test]
fn all_survive_is_a_fixed_point() {
    let metrics = measure(Rule::parse("B/S012345678").unwrap(), 0, 511, &budgets(), 1, 11);
    assert_eq!(metrics.period, Some(1));
    assert_eq!(metrics.activity, 0.0, "a fixed point must not change");
    assert!(!metrics.damage_died, "the twin also freezes, one cell apart");
}

#[test]
fn a_death_rule_empties_the_grid() {
    let metrics = measure(Rule::parse("B/S").unwrap(), 0, 0, &budgets(), 1, 11);
    assert_eq!(metrics.period, Some(1));
    assert_eq!(metrics.population, 0.0);
    assert!(metrics.damage_died, "both replicas die");
    assert_eq!(metrics.spatial_entropy, 0.0, "an empty grid has one block");
}

#[test]
fn conway_life_from_soup_does_not_cycle_at_this_budget() {
    let metrics = measure(Rule::parse("B3/S23").unwrap(), 15, 8, &budgets(), 1, 11);
    assert_eq!(metrics.period, None, "chaotic soups stay unresolved at 64 steps");
    assert!(metrics.activity > 0.0, "Life from soup is not static");
    assert!(!metrics.damage_died, "damage survives in Life");
    assert!(metrics.spatial_entropy > 0.05 && metrics.spatial_entropy <= 1.0);
    assert!(metrics.compression > 0.0 && metrics.compression <= 1.0);
}

#[test]
fn metrics_are_repeatable() {
    let rule = Rule::parse("B36/S23").unwrap();
    let first = measure(rule, 112, 8, &budgets(), 1, 11);
    let second = measure(rule, 112, 8, &budgets(), 1, 11);
    assert_eq!(first, second);
}
