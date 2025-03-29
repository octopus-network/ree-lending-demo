use crate::{ExchangeError, pool::CoinMeta};
use candid::{CandidType, Deserialize};
use ic_cdk_macros::{query, update};
use ree_types::{
    CoinBalance, CoinId, Utxo,
    bitcoin::{Address, Network},
};
use serde::Serialize;

#[derive(Eq, PartialEq, CandidType, Clone, Debug, Deserialize, Serialize)]
pub struct DepositOffer {
    pub pool_utxo: Option<Utxo>,
    pub nonce: u64,
}

#[query]
pub fn pre_deposit(
    pool_address: String,
    amount: CoinBalance,
) -> Result<DepositOffer, ExchangeError> {
    if amount.value < CoinMeta::btc().min_amount {
        return Err(ExchangeError::TooSmallFunds);
    }
    let pool = crate::with_pool_addr(&pool_address).ok_or(ExchangeError::InvalidPool)?;
    let state = pool.states.last().clone();
    Ok(DepositOffer {
        pool_utxo: state.map(|s| s.utxo.clone()).flatten(),
        nonce: state.map(|s| s.nonce).unwrap_or_default(),
    })
}

#[derive(Eq, PartialEq, CandidType, Clone, Debug, Deserialize, Serialize)]
pub struct BorrowOffer {
    pub pool_utxo: Utxo,
    pub nonce: u64,
    pub input_runes: CoinBalance,
    pub output_btc: CoinBalance,
}

#[query]
pub fn pre_borrow(pool_address: String, amount: CoinBalance) -> Result<BorrowOffer, ExchangeError> {
    let pool = crate::with_pool_addr(&pool_address).ok_or(ExchangeError::InvalidPool)?;
    let recent_state = pool.states.last().ok_or(ExchangeError::EmptyPool)?;
    let (input_runes, output_btc) = pool.available_to_borrow(amount)?;
    Ok(BorrowOffer {
        nonce: recent_state.nonce,
        pool_utxo: recent_state.utxo.clone().expect("already checked"),
        input_runes,
        output_btc,
    })
}

pub fn ensure_orchestrator() -> Result<(), String> {
    crate::is_orchestrator(&ic_cdk::caller())
        .then(|| ())
        .ok_or("Access denied".to_string())
}

#[update]
async fn init_pool() -> Result<(), String> {
    let caller = ic_cdk::api::caller();
    if !ic_cdk::api::is_controller(&caller) {
        return Err("Not authorized".to_string());
    }
    let rune_id = "72798:1058";
    let untweaked = crate::request_schnorr_key("key_1", rune_id.as_bytes().to_vec())
        .await
        .unwrap();
    let meta = CoinMeta {
        id: CoinId::rune(72798, 1058),
        symbol: "HOPE•YOU•GET•RICH".to_string(),
        min_amount: 1,
    };

    let tweaked = crate::tweak_pubkey_with_empty(untweaked.clone());
    let key = ree_types::bitcoin::key::TweakedPublicKey::dangerous_assume_tweaked(
        tweaked.to_x_only_public_key(),
    );
    let addr = Address::p2tr_tweaked(key, Network::Testnet4);
    let pool = crate::Pool {
        meta,
        pubkey: untweaked.clone(),
        tweaked,
        addr: addr.to_string(),
        states: vec![],
    };
    crate::LENDING_POOLS.with_borrow_mut(|p| {
        p.insert(addr.to_string(), pool);
    });
    Ok(())
}
