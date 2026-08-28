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
