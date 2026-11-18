use ca_core::Rule;

#[test]
fn canonical_form_is_a_fixed_point() {
    for (input, canonical) in [
        ("B3/S23", "B3/S23"),
        ("b3/s23", "B3/S23"),
        ("B36/S23", "B36/S23"),
        ("B2/S", "B2/S"),
        ("B/S", "B/S"),
        ("B0/S8", "B0/S8"),
        ("B012345678/S012345678", "B012345678/S012345678"),
        ("  B3/S23  ", "B3/S23"),
        ("B33/S233", "B3/S23"),
        ("B36/S238", "B36/S238"),
    ] {
        let rule = Rule::parse(input).unwrap_or_else(|e| panic!("{input} should parse: {e}"));
        assert_eq!(rule.canonical(), canonical, "canonical form of {input}");
        let reparsed = Rule::parse(&rule.canonical()).expect("canonical form must parse");
        assert_eq!(reparsed, rule, "canonical form must round-trip");
    }
}

#[test]
fn mask_round_trips() {
    for text in ["B3/S23", "B0/S", "B/S012345678", "B36/S23", "B/S8"] {
        let rule = Rule::parse(text).unwrap();
        assert_eq!(Rule::from_mask(rule.mask()), rule, "mask round-trip for {text}");
    }
    // birth B3 sits at bit 3; survival S23 sits at bits 9+2 and 9+3.
    assert_eq!(Rule::life().mask(), (1 << 3) | (1 << 11) | (1 << 12));
}

#[test]
fn malformed_rules_are_rejected_with_a_reason() {
    let cases = [
        ("", "empty"),
        ("B3", "one '/'"),
        ("B3/S23/1", "one '/'"),
        ("B9/S23", "out of range"),
        ("B3/S2x", "not a digit"),
        ("3/23", "expected 'B'"),
        ("S23/B3", "expected 'B'"),
        ("B-1/S23", "not a digit"),
    ];
    for (input, expected) in cases {
        let error = Rule::parse(input).expect_err(&format!("{input} must be rejected"));
        assert!(
            error.message.contains(expected),
            "error for {input:?} should mention {expected:?}, got {:?}",
            error.message
        );
    }
}

#[test]
fn life_transition_table() {
    let life = Rule::life();
    assert!(life.next_state(true, 2));
    assert!(life.next_state(true, 3));
    assert!(!life.next_state(true, 1));
    assert!(!life.next_state(true, 4));
    assert!(life.next_state(false, 3));
    assert!(!life.next_state(false, 2));
    assert!(!life.next_state(false, 4));
}
