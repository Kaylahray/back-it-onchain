#![no_std]
pub mod liquidity;
pub mod treasury;
pub mod types;

use soroban_sdk::{contract, contractimpl, Address, Env, Vec};

#[contract]
pub struct TreasuryContract;

#[contractimpl]
impl TreasuryContract {
    pub fn get_total_liquidity(env: Env) -> u128 {
        liquidity::get_total_liquidity(&env)
    }

    pub fn get_total_shares(env: Env) -> u128 {
        liquidity::get_total_shares(&env)
    }

    pub fn get_user_shares(env: Env, user: Address) -> u128 {
        liquidity::get_user_shares(&env, user)
    }

    pub fn get_liquidity_providers(env: Env, start: u32, limit: u32) -> Vec<Address> {
        liquidity::get_liquidity_providers(&env, start, limit)
    }

    pub fn get_share_price(env: Env) -> u128 {
        liquidity::get_share_price(&env)
    }
}
