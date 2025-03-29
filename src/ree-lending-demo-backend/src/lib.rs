mod canister;
mod exchange;
mod pool;
mod psbt;

use crate::canister::{BorrowOffer, DepositOffer};
use crate::pool::Pool;
use candid::{CandidType, Principal};
use ic_cdk::api::management_canister::schnorr::{
    self, SchnorrAlgorithm, SchnorrKeyId, SchnorrPublicKeyArgument,
};
use ic_stable_structures::{
    DefaultMemoryImpl, StableBTreeMap,
    memory_manager::{MemoryId, MemoryManager, VirtualMemory},
};
use ree_types::{
    CoinBalance, Pubkey, Utxo,
    bitcoin::{Address, Network, key::TapTweak, secp256k1::Secp256k1},
    exchange_interfaces::{
        ExecuteTxArgs, ExecuteTxResponse, FinalizeTxArgs, FinalizeTxResponse,
        GetMinimalTxValueArgs, GetMinimalTxValueResponse, GetPoolInfoArgs, GetPoolInfoResponse,
        GetPoolListArgs, GetPoolListResponse, RollbackTxArgs, RollbackTxResponse,
    },
};
use std::cell::RefCell;
use std::str::FromStr;
use thiserror::Error;

pub const ORCHESTRATOR_CANISTER: &'static str = "hvyp5-5yaaa-aaaao-qjxha-cai";

#[derive(Debug, Error, CandidType)]
pub enum ExchangeError {
    #[error("overflow")]
    Overflow,
    #[error("invalid pool")]
    InvalidPool,
    #[error("too small funds")]
    TooSmallFunds,
    #[error("invalid txid")]
    InvalidTxid,
    #[error("the pool has not been initialized or has been removed")]
    EmptyPool,
    #[error("couldn't derive a chain key for pool")]
    ChainKeyError,
    #[error("invalid psbt: {0}")]
    InvalidPsbt(String),
    #[error("invalid pool state: {0}")]
    InvalidState(String),
    #[error("invalid sign_psbt args: {0}")]
    InvalidSignPsbtArgs(String),
    #[error("pool state expired, current = {0}")]
    PoolStateExpired(u64),
    #[error("pool address not found")]
    PoolAddressNotFound,
}

type Memory = VirtualMemory<DefaultMemoryImpl>;

thread_local! {
  static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> =
      RefCell::new(MemoryManager::init(DefaultMemoryImpl::default()));

  static LENDING_POOLS: RefCell<StableBTreeMap<String, Pool, Memory>> = RefCell::new(
      StableBTreeMap::init(
          MEMORY_MANAGER.with(|m| m.borrow().get(MemoryId::new(0))),
      )
  );
}

pub(crate) fn with_pool_mut<F>(id: &Pubkey, f: F) -> Result<(), ExchangeError>
where
    F: FnOnce(Option<Pool>) -> Result<Option<Pool>, ExchangeError>,
{
    let tweaked = crate::tweak_pubkey_with_empty(id.clone());
    let key = ree_types::bitcoin::key::TweakedPublicKey::dangerous_assume_tweaked(
        tweaked.to_x_only_public_key(),
    );
    let addr = Address::p2tr_tweaked(key, Network::Testnet4);
    LENDING_POOLS.with_borrow_mut(|p| {
        let pool = f(p.get(&addr.to_string()));
        match pool {
            Ok(Some(pool)) => {
                p.insert(addr.to_string(), pool);
                Ok(())
            }
            Ok(None) => {
                p.remove(&addr.to_string());
                Ok(())
            }
            Err(e) => Err(e),
        }
    })
}

pub(crate) fn get_pools() -> Vec<Pool> {
    LENDING_POOLS.with_borrow(|p| p.iter().map(|p| p.1.clone()).collect::<Vec<_>>())
}

pub(crate) fn with_pool_addr(addr: &String) -> Option<Pool> {
    LENDING_POOLS.with_borrow(|p| p.get(addr))
}

pub(crate) fn tweak_pubkey_with_empty(untweaked: Pubkey) -> Pubkey {
    let secp = Secp256k1::new();
    let (tweaked, _) = untweaked.to_x_only_public_key().tap_tweak(&secp, None);
    let raw = tweaked.serialize().to_vec();
    Pubkey::from_raw([&[0x00], &raw[..]].concat()).expect("tweaked 33bytes; qed")
}

pub(crate) async fn request_schnorr_key(
    key_name: impl ToString,
    path: Vec<u8>,
) -> Result<Pubkey, ExchangeError> {
    let arg = SchnorrPublicKeyArgument {
        canister_id: None,
        derivation_path: vec![path],
        key_id: SchnorrKeyId {
            algorithm: SchnorrAlgorithm::Bip340secp256k1,
            name: key_name.to_string(),
        },
    };
    let res = schnorr::schnorr_public_key(arg)
        .await
        .map_err(|(_, _)| ExchangeError::ChainKeyError)?;
    let mut raw = res.0.public_key.to_vec();
    raw[0] = 0x00;
    let pubkey = Pubkey::from_raw(raw).expect("management api error: invalid pubkey");
    Ok(pubkey)
}

pub(crate) async fn sign_prehash_with_schnorr(
    digest: impl AsRef<[u8; 32]>,
    key_name: impl ToString,
    path: Vec<u8>,
) -> Result<Vec<u8>, ExchangeError> {
    let signature = chain_key::schnorr_sign(digest.as_ref().to_vec(), path, key_name, None)
        .await
        .map_err(|_| ExchangeError::ChainKeyError)?;
    Ok(signature)
}

pub(crate) fn is_orchestrator(principal: &Principal) -> bool {
    let o = Principal::from_str(ORCHESTRATOR_CANISTER).expect("invalid principal: orchestrator");
    o == *principal
}

ic_cdk::export_candid!();
