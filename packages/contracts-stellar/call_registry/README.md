# CallRegistry (Soroban)

This contract implements the prediction market call registry for the Stellar Soroban platform.
It mirrors the functionality of the Solidity `CallRegistry.sol` contract.

## Deviations from Solidity Implementation

1. **Storage Layout**:
   - Solidity uses `mapping` for calls and user stakes.
   - Soroban implementation uses `DataKey` enum with `Persistent` storage for `Call` and `UserStake`, and `Instance` storage for `NextCallId`.

2. **Timestamps**:
   - Solidity uses `uint256` for timestamps.
   - Soroban implementation uses `u64` which is standard for Stellar ledger timestamps.

3. **Events**:
   - Solidity events use indexed parameters.
   - Soroban events use the `(topics, data)` structure. `CallCreated` uses `["CallCreated", call_id, creator]` as topics.

4. **Token Transfers**:
   - Uses `soroban_sdk::token::Client` to interact with Stellar Asset Contracts (SAC).

## Build and Test

```bash
cargo test
cargo build --target wasm32-unknown-unknown --release
```
