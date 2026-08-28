//! Treasury helpers for fee configuration and dividend dust handling (SC-016, SC-017).
//!
//! The actual FeeConfig lives in call_registry instance storage. This module
//! provides convenience helpers that can be called from tests or other crates
//! when a shared treasury address is needed.

use soroban_sdk::{Address, Env};

const TREASURY_KEY: &str = "TREASURY";

/// Persist a treasury address under a simple instance key (legacy helper).
pub fn set_treasury(env: &Env, addr: Address) {
    env.storage().instance().set(&TREASURY_KEY, &addr);
}

/// Retrieve the treasury address set via `set_treasury`.
pub fn get_treasury(env: &Env) -> Address {
    env.storage().instance().get(&TREASURY_KEY).unwrap()
}

/// Validate that a fee bps value is within the protocol range [50, 200].
/// Returns true if valid.
pub fn is_valid_fee_bps(bps: u32) -> bool {
    (50..=200).contains(&bps)
}

/// Compute a proportional share: `total * weight / total_weight` with checked arithmetic.
/// Returns 0 on any overflow or zero denominator.
pub fn proportional_share(total: i128, weight: i128, total_weight: i128) -> i128 {
    if total_weight <= 0 || weight < 0 || total < 0 {
        return 0;
    }
    total
        .checked_mul(weight)
        .and_then(|p| p.checked_div(total_weight))
        .unwrap_or(0)
}

// ── Fee accrual helpers (SC-088) ──────────────────────────────────────────────
//
// The authoritative `PlatformFees` balance lives in `call_registry` persistent
// storage and is mutated through the `accrue_fee` hook. These helpers hold the
// pure arithmetic so it can be reviewed and unit-tested independently of the
// Soroban host.

/// Fee taken from `amount` at `bps` basis points, using checked arithmetic.
///
/// Returns `None` on overflow. Integer division truncates, so sub-`10_000 / bps`
/// amounts accrue nothing — the remainder stays with the staker, never the
/// platform.
pub fn fee_from_bps(amount: i128, bps: i128) -> Option<i128> {
    if amount <= 0 || bps <= 0 {
        return Some(0);
    }
    amount.checked_mul(bps)?.checked_div(10_000)
}

/// New `PlatformFees` total after accruing `fee_amount` on top of `current`.
///
/// Returns `None` on overflow (the caller is expected to surface
/// `ContractError::ArithmeticOverflow`) and on a negative `fee_amount`, which
/// would silently drain the accrued balance.
pub fn accrue_fee(current: i128, fee_amount: i128) -> Option<i128> {
    if fee_amount < 0 || current < 0 {
        return None;
    }
    current.checked_add(fee_amount)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fee_from_bps_matches_acceptance_criteria() {
        // SC-088: stake 1_000 at 50 bps → fee 5.
        assert_eq!(fee_from_bps(1_000, 50), Some(5));
        assert_eq!(fee_from_bps(10_000, 50), Some(50));
        assert_eq!(fee_from_bps(1_000, 200), Some(20));
    }

    #[test]
    fn fee_from_bps_truncates_and_guards() {
        assert_eq!(fee_from_bps(199, 50), Some(0)); // rounds down to nothing
        assert_eq!(fee_from_bps(0, 50), Some(0));
        assert_eq!(fee_from_bps(-1, 50), Some(0));
        assert_eq!(fee_from_bps(1_000, 0), Some(0));
        assert_eq!(fee_from_bps(i128::MAX, 50), None); // overflow on mul
    }

    #[test]
    fn accrue_fee_is_checked() {
        assert_eq!(accrue_fee(0, 5), Some(5));
        assert_eq!(accrue_fee(5, 45), Some(50));
        assert_eq!(accrue_fee(10, 0), Some(10));
        assert_eq!(accrue_fee(10, -1), None); // never decrements
        assert_eq!(accrue_fee(i128::MAX, 1), None); // overflow on add
    }
}
