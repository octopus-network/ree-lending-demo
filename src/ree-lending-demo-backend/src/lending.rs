use crate::pool::PoolState;
use crate::{ExchangeError, pool::CoinMeta};
use candid::{CandidType, Deserialize};
use ic_cdk_macros::{query, update};
use ree_exchange_sdk::prelude::Metadata;
use ree_exchange_sdk::prelude::*;
use ree_exchange_sdk::types::bitcoin::psbt::Psbt;
use ree_exchange_sdk::types::{CoinBalance, Txid, Utxo, exchange_interfaces::NewBlockInfo};
use serde::Serialize;

// DepositOffer contains the return information for pre_deposit
#[derive(Eq, PartialEq, CandidType, Clone, Debug, Deserialize, Serialize)]
pub struct DepositOffer {
    pub pool_utxo: Option<Utxo>, // The current UTXO of the pool (None for first-time deposits)
    pub nonce: u64,
}

#[query]
// pre_deposit queries the information needed to build a deposit transaction
// by specifying the target pool address and deposit amount
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

#[derive(Eq, PartialEq, CandidType, Clone, Debug, Deserialize, Serialize)]
// BorrowOffer contains information returned by pre_borrow
pub struct BorrowOffer {
    pub pool_utxo: Utxo,          // The current UTXO of the pool
    pub nonce: u64,               // Transaction nonce to prevent replay attacks
    pub input_runes: CoinBalance, // The collateral asset and amount the user needs to deposit
    pub output_btc: CoinBalance, // The amount of BTC the user will borrow (may be less than requested amount if the pool has insufficient BTC)
}

#[query]
// pre_borrow queries the information needed to build a borrow transaction
// by specifying the target pool address and the amount requested to borrow
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

#[update]
// init_pool creates a demonstration lending pool when the exchange is deployed
// This pool allows users to borrow BTC satoshis at a 1:1 ratio by depositing RICH tokens as collateral
async fn init_pool() -> Result<(), String> {
    let caller = ic_cdk::api::msg_caller();
    if !ic_cdk::api::is_controller(&caller) {
        return Err("Not authorized".to_string());
    }

    let metadata = Metadata::new::<exchange::LendingPools>("72798:1058".to_string())
        .await
        .expect("Failed to call chain-key API");

    let pool = Pool::new(metadata);

    // Store the pool in the storage
    exchange::LendingPools::insert(pool);
    Ok(())
}

#[query]
pub fn get_blocks() -> Vec<u32> {
    let a = exchange::get_blocks();
    ic_cdk::println!("!!! get_blocks: {:?}", a);
    a
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
        type State = PoolState;

        const BLOCK_MEMORY: u8 = 0;

        const TRANSACTION_MEMORY: u8 = 1;

        const POOL_MEMORY: u8 = 2;

        fn network() -> ree_exchange_sdk::Network {
            ree_exchange_sdk::Network::Testnet4
        }

        // This is optional
        fn finalize_threshold() -> u32 {
            64
        }
    }

    pub fn get_blocks() -> Vec<u32> {
        __BLOCKS.with_borrow(|blocks| blocks.iter().map(|b| b.key().clone()).collect())
    }

    pub fn reset_blocks() {
        __BLOCKS.with_borrow_mut(|blocks| blocks.clear_new());
    }

    #[hook]
    impl Hook for LendingPools {
        fn on_tx_rollbacked(
            address: String,
            txid: Txid,
            reason: String,
            _rollbacked_states: Vec<Self::State>,
        ) {
            ic_cdk::println!("!!! on_tx_rollbacked: {}, {}, {}", address, txid, reason);
        }

        fn on_tx_confirmed(address: String, txid: Txid, block: Block) {
            ic_cdk::println!(
                "!!! on_tx_confirmed: {}, {}, {}",
                address,
                txid,
                block.height
            );
        }

        fn on_tx_finalized(address: String, txid: Txid, block: Block) {
            ic_cdk::println!(
                "!!! on_tx_finalized: {}, {}, {}",
                address,
                txid,
                block.height
            );
        }

        fn on_block_finalized(args: NewBlockInfo) {
            ic_cdk::println!("!!! on_block_finalized: {}", args.block_height);
        }
    }

    #[action]
    pub async fn deposit(_psbt: &Psbt, args: ActionArgs) -> ActionResult<PoolState> {
        // Get the pool from storage
        let pool = exchange::LendingPools::get(&args.intention.pool_address)
            .expect("already checked in pre_*; qed");

        // Validate the deposit transaction and get the new pool state
        let (new_state, _consumed) = crate::pool::validate_deposit(
            &pool,
            args.txid,
            args.intention.nonce,
            args.intention.pool_utxo_spent,
            args.intention.pool_utxo_received,
            args.intention.input_coins,
            args.intention.output_coins,
        )
        .map_err(|e| e.to_string())?;

        Ok(new_state)
    }

    #[action]
    pub async fn borrow(_psbt: &Psbt, args: ActionArgs) -> ActionResult<PoolState> {
        // Get the pool from storage
        let pool = exchange::LendingPools::get(&args.intention.pool_address)
            .expect("already checked in pre_*; qed");

        // Validate the borrow transaction and get the new pool state
        let (new_state, _consumed) = crate::pool::validate_borrow(
            &pool,
            args.txid,
            args.intention.nonce,
            args.intention.pool_utxo_spent,
            args.intention.pool_utxo_received,
            args.intention.input_coins,
            args.intention.output_coins,
        )
        .map_err(|e| e.to_string())?;

        Ok(new_state)
    }
}
