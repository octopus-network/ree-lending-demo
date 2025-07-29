use crate::pool::Pool;
use crate::{ExchangeError, pool::CoinMeta};
use candid::{CandidType, Deserialize};
use ic_cdk_macros::{query, update};
use ree_exchange_sdk::exchange_interfaces::PoolStorage;
use ree_exchange_sdk::{
    CoinBalance, CoinId, Utxo, bitcoin::Network, schnorr::request_ree_pool_address,
};
use ree_exchange_sdk::{
    Intention, bitcoin::psbt::Psbt, exchange_interfaces::*, psbt::ree_pool_sign,
};
use serde::Serialize;

use ree_exchange_sdk::{commit, exchange, pools};

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
    let pool = exchange::LendingPools::pool(&pool_address).ok_or(ExchangeError::InvalidPool)?;
    let state = pool.states.last().clone();
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
    let pool = exchange::LendingPools::pool(&pool_address).ok_or(ExchangeError::InvalidPool)?;
    let recent_state = pool.states.last().ok_or(ExchangeError::EmptyPool)?;
    let (input_runes, output_btc) = pool.available_to_borrow(amount)?;
    Ok(BorrowOffer {
        nonce: recent_state.nonce,
        pool_utxo: recent_state.utxo.clone().expect("already checked"),
        input_runes,
        output_btc,
    })
}

#[update]
async fn reset_blocks() -> Result<(), String> {
    let caller = ic_cdk::api::caller();
    if !ic_cdk::api::is_controller(&caller) {
        return Err("Not authorized".to_string());
    }
    exchange::reset_blocks()
}

#[update]
// init_pool creates a demonstration lending pool when the exchange is deployed
// This pool allows users to borrow BTC satoshis at a 1:1 ratio by depositing RICH tokens as collateral
async fn init_pool() -> Result<(), String> {
    let caller = ic_cdk::api::caller();
    if !ic_cdk::api::is_controller(&caller) {
        return Err("Not authorized".to_string());
    }

    let id = CoinId::rune(72798, 1058);
    let meta = CoinMeta {
        id,
        symbol: "HOPE•YOU•GET•RICH".to_string(),
        min_amount: 1,
    };

    // Request a pool address from the REE system
    let (untweaked, tweaked, addr) = request_ree_pool_address(
        crate::SCHNORR_KEY_NAME,
        vec![id.to_string().as_bytes().to_vec()],
        Network::Testnet4,
    )
    .await?;

    // Initialize the pool with empty state
    let pool = crate::Pool {
        meta,
        pubkey: untweaked.clone(),
        tweaked,
        addr: addr.to_string(),
        states: vec![],
    };

    // Store the pool in the storage
    exchange::LendingPools::put(addr.to_string(), pool);
    Ok(())
}

#[exchange]
pub mod exchange {
    use super::*;

    #[pools]
    pub struct LendingPools;

    impl Pools for LendingPools {
        type Pool = Pool;

        fn network() -> ree_exchange_sdk::exchange_interfaces::Network {
            ree_exchange_sdk::exchange_interfaces::Network::Testnet4
        }
    }

    pub fn reset_blocks() -> Result<(), String> {
        __BLOCKS.with_borrow_mut(|b| {
            b.clear_new();
        });
        Ok(())
    }

    #[commit]
    pub async fn deposit(args: ExecuteTxArgs) -> ExecuteTxResponse {
        let ExecuteTxArgs {
            psbt_hex,
            txid,
            intention_set,
            intention_index,
            zero_confirmed_tx_queue_length: _zero_confirmed_tx_queue_length,
        } = args;
        // Decode and deserialize the PSBT
        let raw = hex::decode(&psbt_hex).map_err(|_| "invalid psbt".to_string())?;
        let mut psbt = Psbt::deserialize(raw.as_slice()).map_err(|_| "invalid psbt".to_string())?;

        // Extract the intention details
        let intention = intention_set.intentions[intention_index as usize].clone();
        let Intention {
            exchange_id: _,
            action: _,
            action_params: _,
            pool_address,
            nonce,
            pool_utxo_spent,
            pool_utxo_received,
            input_coins,
            output_coins,
        } = intention;

        // Get the pool from storage
        let mut pool =
            exchange::LendingPools::pool(&pool_address).expect("already checked in pre_*; qed");

        // Validate the deposit transaction and get the new pool state
        let (new_state, consumed) = pool
            .validate_deposit(
                txid,
                nonce,
                pool_utxo_spent,
                pool_utxo_received,
                input_coins,
                output_coins,
            )
            .map_err(|e| e.to_string())?;

        // Sign the UTXO if there's an existing one to spend
        if let Some(ref utxo) = consumed {
            ree_pool_sign(
                &mut psbt,
                vec![utxo],
                crate::SCHNORR_KEY_NAME,
                pool.derivation_path(),
            )
            .await
            .map_err(|e| e.to_string())?;
        }

        // Update the pool with the new state
        pool.commit(new_state);
        exchange::LendingPools::put(pool_address.clone(), pool);

        // Return the serialized PSBT with the exchange's signatures
        Ok(psbt.serialize_hex())
    }

    #[commit]
    pub async fn borrow(args: ExecuteTxArgs) -> ExecuteTxResponse {
        let ExecuteTxArgs {
            psbt_hex,
            txid,
            intention_set,
            intention_index,
            zero_confirmed_tx_queue_length: _zero_confirmed_tx_queue_length,
        } = args;
        // Decode and deserialize the PSBT
        let raw = hex::decode(&psbt_hex).map_err(|_| "invalid psbt".to_string())?;
        let mut psbt = Psbt::deserialize(raw.as_slice()).map_err(|_| "invalid psbt".to_string())?;

        // Extract the intention details
        let intention = intention_set.intentions[intention_index as usize].clone();
        let Intention {
            exchange_id: _,
            action: _,
            action_params: _,
            pool_address,
            nonce,
            pool_utxo_spent,
            pool_utxo_received,
            input_coins,
            output_coins,
        } = intention;

        // Get the pool from storage
        let mut pool =
            exchange::LendingPools::pool(&pool_address).expect("already checked in pre_*; qed");

        // Validate the borrow transaction and get the new pool state
        let (new_state, consumed) = pool
            .validate_borrow(
                txid,
                nonce,
                pool_utxo_spent,
                pool_utxo_received,
                input_coins,
                output_coins,
            )
            .map_err(|e| e.to_string())?;

        // Sign the UTXO to be spent
        ree_pool_sign(
            &mut psbt,
            vec![&consumed],
            crate::SCHNORR_KEY_NAME,
            pool.derivation_path(),
        )
        .await
        .map_err(|e| e.to_string())?;

        // Update the pool with the new state
        pool.commit(new_state);
        exchange::LendingPools::put(pool_address.clone(), pool);

        // Return the serialized PSBT with the exchange's signatures
        Ok(psbt.serialize_hex())
    }
}
