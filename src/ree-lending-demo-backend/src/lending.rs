use crate::{ExchangeError, pool::CoinMeta};
use candid::{CandidType, Deserialize};
use ic_cdk_macros::{query, update};
use ree_types::{CoinBalance, CoinId, Utxo, bitcoin::Network, schnorr::request_ree_pool_address};
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
    let pool = crate::get_pool(&pool_address).ok_or(ExchangeError::InvalidPool)?;
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
    let pool = crate::get_pool(&pool_address).ok_or(ExchangeError::InvalidPool)?;
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
    // Store the pool in the LENDING_POOLS storage
    crate::LENDING_POOLS.with_borrow_mut(|p| {
        p.insert(addr.to_string(), pool);
    });
    Ok(())
}

#[update]
async fn reset_blocks() -> Result<(), String> {
    let caller = ic_cdk::api::caller();
    if !ic_cdk::api::is_controller(&caller) {
        return Err("Not authorized".to_string());
    }
    crate::BLOCKS.with_borrow_mut(|b| {
        b.clear_new();
    });
    Ok(())
}

#[update]
async fn reset_tx_records() -> Result<(), String> {
    let caller = ic_cdk::api::caller();
    if !ic_cdk::api::is_controller(&caller) {
        return Err("Not authorized".to_string());
    }
    crate::TX_RECORDS.with_borrow_mut(|t| {
        t.clear_new();
    });
    Ok(())
}

#[derive(Eq, PartialEq, CandidType, Clone, Debug, Deserialize, Serialize)]
pub struct TxRecordInfo {
    txid: String,
    confirmed: bool,
    records: Vec<String>,
}

#[query]
pub fn query_tx_records() -> Result<Vec<TxRecordInfo>, String> {
    let res = crate::TX_RECORDS.with_borrow(|t| {
        t.iter()
            .map(|((txid, confirmed), records)| TxRecordInfo {
                txid: txid.to_string(),
                confirmed,
                records: records.pools.clone(),
            })
            .collect()
    });

    Ok(res)
}
#[derive(Eq, PartialEq, CandidType, Clone, Debug, Deserialize, Serialize)]
pub struct BlockInfo {
    height: u32,
    hash: String,
}

#[query]
pub fn query_blocks() -> Result<Vec<BlockInfo>, String> {
    let res = crate::BLOCKS.with_borrow(|b| {
        b.iter()
            .map(|(_, block)| BlockInfo {
                height: block.block_height,
                hash: block.block_hash.clone(),
            })
            .collect()
    });

    Ok(res)
}

#[query]
pub fn blocks_tx_records_count() -> Result<(u64, u64), String> {
    let tx_records_count = crate::TX_RECORDS.with_borrow(|t| t.len());

    let blocks_count = crate::BLOCKS.with_borrow(|b| b.len());

    Ok((blocks_count, tx_records_count))
}
