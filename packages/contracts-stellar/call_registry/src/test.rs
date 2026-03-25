#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events, Ledger, MockAuth, MockAuthInvoke},
    Address, BytesN, Env, IntoVal, String,
};

#[test]
fn test_create_call() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, CallRegistry);
    let client = CallRegistryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let creator = Address::generate(&env);
    let stake_token_admin = Address::generate(&env);
    let stake_token_contract = env.register_stellar_asset_contract_v2(stake_token_admin.clone());
    let stake_token = stake_token_contract.address();
    let stake_token_client = token::Client::new(&env, &stake_token);
    let stake_token_admin_client = token::StellarAssetClient::new(&env, &stake_token);

    // Mint tokens to creator
    stake_token_admin_client.mint(&creator, &1000);

    let end_ts = env.ledger().timestamp() + 1000;
    let token_address = Address::generate(&env);
    let pair_id = BytesN::from_array(&env, &[0; 32]);
    let ipfs_cid = String::from_str(&env, "QmHash");
    let metadata = CreateCallMetadata {
        token_address: token_address.clone(),
        pair_id: pair_id.clone(),
        ipfs_cid: ipfs_cid.clone(),
    };

    let call_id = client.create_call(&creator, &stake_token, &100, &end_ts, &metadata);

    assert_eq!(call_id, 0);

    let call = client.get_call(&call_id);
    assert_eq!(call.creator, creator);
    assert_eq!(call.total_stake_yes, 100);
    assert_eq!(call.total_stake_no, 0);
    assert_eq!(call.ipfs_cid, ipfs_cid);

    // Check creator stake
    let stake = client.get_user_stake(&call_id, &creator, &true);
    assert_eq!(stake, 100);

    // Check token transfer
    assert_eq!(stake_token_client.balance(&creator), 900);
    assert_eq!(stake_token_client.balance(&contract_id), 100);

    // Check events
    let events = env.events().all();
    // Instead of asserting exact length, verify the last event is CallCreated
    let last_event = events.last().unwrap();
    assert_eq!(last_event.1.len(), 3); // Symbol, call_id, creator
                                       // We can check the symbol
    let symbol: Symbol = last_event.1.get(0).unwrap().into_val(&env);
    assert_eq!(symbol, Symbol::new(&env, "CallCreated"));
}

#[test]
fn test_stake_on_call() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, CallRegistry);
    let client = CallRegistryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let creator = Address::generate(&env);
    let staker = Address::generate(&env);
    let stake_token_admin = Address::generate(&env);
    let stake_token_contract = env.register_stellar_asset_contract_v2(stake_token_admin.clone());
    let stake_token = stake_token_contract.address();
    let stake_token_client = token::Client::new(&env, &stake_token);
    let stake_token_admin_client = token::StellarAssetClient::new(&env, &stake_token);

    stake_token_admin_client.mint(&creator, &1000);
    stake_token_admin_client.mint(&staker, &1000);

    let end_ts = env.ledger().timestamp() + 1000;
    let token_address = Address::generate(&env);
    let pair_id = BytesN::from_array(&env, &[0; 32]);
    let ipfs_cid = String::from_str(&env, "QmHash");
    let metadata = CreateCallMetadata {
        token_address: token_address.clone(),
        pair_id: pair_id.clone(),
        ipfs_cid: ipfs_cid.clone(),
    };

    let call_id = client.create_call(&creator, &stake_token, &100, &end_ts, &metadata);

    // Stake NO
    client.stake_on_call(&call_id, &staker, &50, &false);

    let call = client.get_call(&call_id);
    assert_eq!(call.total_stake_yes, 100);
    assert_eq!(call.total_stake_no, 50);

    let staker_stake = client.get_user_stake(&call_id, &staker, &false);
    assert_eq!(staker_stake, 50);

    assert_eq!(stake_token_client.balance(&staker), 950);
    assert_eq!(stake_token_client.balance(&contract_id), 150);
}

#[test]
#[should_panic(expected = "End time must be in future")]
fn test_create_call_past_end_time() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, CallRegistry);
    let client = CallRegistryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    let creator = Address::generate(&env);
    let stake_token = Address::generate(&env);

    let end_ts = env.ledger().timestamp(); // Current time

    let token_address = Address::generate(&env);
    let pair_id = BytesN::from_array(&env, &[0; 32]);
    let ipfs_cid = String::from_str(&env, "QmHash");
    let metadata = CreateCallMetadata {
        token_address,
        pair_id,
        ipfs_cid,
    };

    client.create_call(&creator, &stake_token, &100, &end_ts, &metadata);
}

#[test]
#[should_panic(expected = "Call ended")]
fn test_stake_ended_call() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, CallRegistry);
    let client = CallRegistryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let creator = Address::generate(&env);
    let staker = Address::generate(&env);
    let stake_token_admin = Address::generate(&env);
    let stake_token_contract = env.register_stellar_asset_contract_v2(stake_token_admin.clone());
    let stake_token = stake_token_contract.address();
    let _stake_token_client = token::Client::new(&env, &stake_token);
    let stake_token_admin_client = token::StellarAssetClient::new(&env, &stake_token);

    stake_token_admin_client.mint(&creator, &1000);
    stake_token_admin_client.mint(&staker, &1000);

    let end_ts = env.ledger().timestamp() + 100;
    let token_address = Address::generate(&env);
    let pair_id = BytesN::from_array(&env, &[0; 32]);
    let ipfs_cid = String::from_str(&env, "QmHash");
    let metadata = CreateCallMetadata {
        token_address,
        pair_id,
        ipfs_cid,
    };

    let call_id = client.create_call(&creator, &stake_token, &100, &end_ts, &metadata);

    // Fast forward time
    env.ledger().set_timestamp(end_ts + 1);

    client.stake_on_call(&call_id, &staker, &50, &false);
}

#[test]
#[should_panic(expected = "Contract is paused")]
fn test_create_call_paused() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, CallRegistry);
    let client = CallRegistryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let stake_token_admin = Address::generate(&env);
    let stake_token_contract = env.register_stellar_asset_contract_v2(stake_token_admin.clone());
    let stake_token = stake_token_contract.address();
    let stake_token_admin_client = token::StellarAssetClient::new(&env, &stake_token);

    client.initialize(&admin);
    client.pause();

    stake_token_admin_client.mint(&creator, &1000);

    let end_ts = env.ledger().timestamp() + 1000;
    let token_address = Address::generate(&env);
    let pair_id = BytesN::from_array(&env, &[0; 32]);
    let ipfs_cid = String::from_str(&env, "QmHash");
    let metadata = CreateCallMetadata {
        token_address,
        pair_id,
        ipfs_cid,
    };

    client.create_call(&creator, &stake_token, &100, &end_ts, &metadata);
}

#[test]
fn test_pause_unpause_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, CallRegistry);
    let client = CallRegistryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let staker = Address::generate(&env);
    let stake_token_admin = Address::generate(&env);
    let stake_token_contract = env.register_stellar_asset_contract_v2(stake_token_admin.clone());
    let stake_token = stake_token_contract.address();
    let stake_token_admin_client = token::StellarAssetClient::new(&env, &stake_token);

    client.initialize(&admin);
    assert!(!client.get_is_paused());

    stake_token_admin_client.mint(&creator, &1000);
    stake_token_admin_client.mint(&staker, &1000);

    let end_ts = env.ledger().timestamp() + 1000;
    let token_address = Address::generate(&env);
    let pair_id = BytesN::from_array(&env, &[0; 32]);
    let ipfs_cid = String::from_str(&env, "QmHash");
    let metadata = CreateCallMetadata {
        token_address,
        pair_id,
        ipfs_cid,
    };

    let call_id = client.create_call(&creator, &stake_token, &100, &end_ts, &metadata);

    client.pause();
    assert!(client.get_is_paused());

    client.unpause();
    assert!(!client.get_is_paused());

    client.stake_on_call(&call_id, &staker, &50, &false);
}

#[test]
#[should_panic]
fn test_pause_requires_admin_auth() {
    let env = Env::default();
    let contract_id = env.register_contract(None, CallRegistry);
    let client = CallRegistryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);

    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "initialize",
            args: (&admin,).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.initialize(&admin);

    env.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "pause",
            args: ().into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.pause();
}

#[test]
#[should_panic]
fn test_unpause_requires_admin_auth() {
    let env = Env::default();
    let contract_id = env.register_contract(None, CallRegistry);
    let client = CallRegistryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);

    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "initialize",
            args: (&admin,).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.initialize(&admin);

    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "pause",
            args: ().into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.pause();

    env.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "unpause",
            args: ().into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.unpause();
}
