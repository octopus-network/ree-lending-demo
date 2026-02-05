use crate::Version;
use crate::lending::exchange::{__CustomStorageAccess, ExchangeStorage};
use crate::pool::PoolState;
use crate::{BlockState, ExchangeError, pool::CoinMeta};
use candid::{CandidType, Deserialize};
use ic_cdk_macros::{query, update};
use ree_exchange_sdk::prelude::Metadata;
use ree_exchange_sdk::prelude::*;
use ree_exchange_sdk::types::bitcoin::psbt::Psbt;
use ree_exchange_sdk::types::{CoinBalance, Utxo};
use serde::Serialize;

// DepositOffer contains the information returned by pre_deposit.
#[derive(Eq, PartialEq, CandidType, Clone, Debug, Deserialize, Serialize)]
pub struct DepositOffer {
    pub pool_utxo: Option<Utxo>, // The current UTXO of the pool (None for first-time deposits).
    pub nonce: u64,
}

// pre_deposit queries the information needed to build a deposit transaction
// by specifying the target pool address and deposit amount.
#[query]
pub fn pre_deposit(
    pool_address: String,
    amount: CoinBalance,
) -> Result<DepositOffer, ExchangeError> {
    if amount.value < CoinMeta::btc().min_amount {
        return Err(ExchangeError::TooSmallFunds);
    }
    let pool = exchange::LendingPools::get(&pool_address).ok_or(ExchangeError::InvalidPool)?;
    let state = pool.states().last().clone();
    Ok(DepositOffer {
        pool_utxo: state.map(|s| s.utxo.clone()).flatten(),
        nonce: state.map(|s| s.nonce).unwrap_or_default(),
    })
}

// BorrowOffer contains the information returned by pre_borrow.
#[derive(Eq, PartialEq, CandidType, Clone, Debug, Deserialize, Serialize)]
pub struct BorrowOffer {
    pub pool_utxo: Utxo,          // The current UTXO of the pool.
    pub nonce: u64,               // Transaction nonce to prevent replay attacks.
    pub input_runes: CoinBalance, // The collateral asset and amount the user needs to deposit.
    pub output_btc: CoinBalance, // The amount of BTC the user will borrow (may be less than requested if insufficient).
}

// pre_borrow queries the information needed to build a borrow transaction
// by specifying the target pool address and the amount to borrow.
#[query]
pub fn pre_borrow(pool_address: String, amount: CoinBalance) -> Result<BorrowOffer, ExchangeError> {
    let pool = exchange::LendingPools::get(&pool_address).ok_or(ExchangeError::InvalidPool)?;
    let recent_state = pool.states().last().ok_or(ExchangeError::EmptyPool)?;
    let (input_runes, output_btc) = crate::pool::available_to_borrow(&pool, amount)?;
    Ok(BorrowOffer {
        nonce: recent_state.nonce,
        pool_utxo: recent_state.utxo.clone().expect("already checked"),
        input_runes,
        output_btc,
    })
}

// init_exchange creates a demonstration lending pool when the exchange is deployed.
// This pool allows users to borrow BTC satoshis at a 1:1 ratio by depositing RICH tokens as collateral.
#[update]
async fn init_exchange() -> Result<(), String> {
    let caller = ic_cdk::api::msg_caller();
    if !ic_cdk::api::is_controller(&caller) {
        return Err("Not authorized".to_string());
    }

    let metadata = Metadata::new::<exchange::LendingPools>("72798:1058".to_string())
        .await
        .expect("Failed to call chain-key API");

    let pool = Pool::new(metadata);

    // Store the pool in storage.
    exchange::LendingPools::insert(pool);

    // Set version to 0 to demonstrate the usage of ExchangeStorage.
    ExchangeStorage::with_mut(|version| version.set(Some(0)));
    Ok(())
}

#[query]
pub fn get_blocks() -> Vec<u32> {
    let a = exchange::get_blocks();
    ic_cdk::println!("!!! get_blocks: {:?}", a);
    a
}

#[query]
pub fn get_block(height: u32) -> Option<ree_exchange_sdk::Block> {
    exchange::get_block(height)
}

#[query]
pub fn get_unconfirmed_txs() -> Vec<ree_exchange_sdk::types::TxRecord> {
    exchange::get_unconfirmed_txs()
}

#[update]
pub fn reset_blocks() -> Result<(), String> {
    let caller = ic_cdk::api::msg_caller();
    if !ic_cdk::api::is_controller(&caller) {
        return Err("Not authorized".to_string());
    }

    exchange::reset_blocks();
    Ok(())
}

#[exchange]
pub mod exchange {
    use super::*;

    #[pools]
    pub struct LendingPools;

    impl Pools for LendingPools {
        // PoolState is the core storage of the exchange.
        // When the exchange receives a REE transaction, PoolState is updated accordingly.
        type PoolState = PoolState;
        // BlockState is updated when the exchange receives a new Bitcoin block.
        // It can be updated in the on_block_confirmed hook method.
        type BlockState = BlockState;

        // Memory IDs for pool state and block state storage (allowed range: 0-99).
        const POOL_STATE_MEMORY: u8 = 0;
        const BLOCK_STATE_MEMORY: u8 = 1;

        fn network() -> ree_exchange_sdk::Network {
            ree_exchange_sdk::Network::Testnet4
        }

        // Finalize threshold: transactions with more confirmations than this are considered impossible to reorg.
        // The SDK will automatically prune unnecessary state data for finalized transactions.
        fn finalize_threshold() -> u32 {
            64
        }
    }

    pub fn get_blocks() -> Vec<u32> {
        __BLOCKS.with_borrow(|blocks| blocks.iter().map(|b| b.key().clone()).collect())
    }

    pub fn get_unconfirmed_txs() -> Vec<ree_exchange_sdk::types::TxRecord> {
        __TX_RECORDS.with_borrow(|txs| txs.iter().map(|e| e.value().clone()).collect())
    }

    pub fn get_block(height: u32) -> Option<ree_exchange_sdk::Block> {
        __BLOCKS.with_borrow(|blocks| blocks.get(&height).clone())
    }

    pub fn reset_blocks() {
        __BLOCKS.with_borrow_mut(|blocks| blocks.clear_new());
    }

    // Set the memory ID and type for exchange state storage.
    #[storage(2)]
    pub type ExchangeStorage = ree_exchange_sdk::store::StableCell<Version>;

    #[hook]
    impl Hook for LendingPools {
        // This hook is triggered when a new Bitcoin block becomes confirmed.
        // The exchange can update the block state within this hook.
        // As a demonstration, this simply updates the block number to the latest confirmed block.
        fn on_block_confirmed(block: Block) {
            ic_cdk::println!(
                "Hook: on_block_confirmed - block number: {}, previous block number: {:?}",
                block.block_height,
                LendingPools::block_state()
            );
            let _ = LendingPools::commit(
                block.block_height,
                BlockState {
                    block_number: block.block_height,
                },
            );
        }
    }

    #[action]
    pub async fn deposit(_psbt: &Psbt, args: ActionArgs) -> ActionResult<PoolState> {
        // Get the pool from storage.
        let pool = exchange::LendingPools::get(&args.intention.pool_address)
            .expect("already checked in pre_*; qed");

        // Validate the deposit transaction and get the new pool state.
        let (new_state, _consumed) = crate::pool::validate_deposit(
            &pool,
            args.txid,
            args.intention.nonce,
            args.intention.pool_utxo_spent,
            args.intention.pool_utxo_received,
            args.intention.input_coins,
            args.intention.output_coins,
        )
        .map_err(|e| ree_exchange_sdk::error::Error::Custom(0, e.to_string()))?;

        Ok(new_state)
    }

    #[action]
    pub async fn borrow(_psbt: &Psbt, args: ActionArgs) -> ActionResult<PoolState> {
        // Get the pool from storage.
        let pool = exchange::LendingPools::get(&args.intention.pool_address)
            .expect("already checked in pre_*; qed");

        // Validate the borrow transaction and get the new pool state.
        let (new_state, _consumed) = crate::pool::validate_borrow(
            &pool,
            args.txid,
            args.intention.nonce,
            args.intention.pool_utxo_spent,
            args.intention.pool_utxo_received,
            args.intention.input_coins,
            args.intention.output_coins,
        )
        .map_err(|e| ree_exchange_sdk::error::Error::Custom(0, e.to_string()))?;

        Ok(new_state)
    }
}
