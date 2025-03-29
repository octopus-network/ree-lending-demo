use crate::{ExchangeError, canister::ensure_orchestrator, pool};
use ic_cdk_macros::{query, update};
use ree_types::{CoinBalance, Intention, bitcoin::psbt::Psbt, exchange_interfaces::*};

/// REE API
#[query]
fn get_minimal_tx_value(_args: GetMinimalTxValueArgs) -> GetMinimalTxValueResponse {
    pool::MIN_BTC_VALUE
}

/// REE API
#[query]
pub fn get_pool_list(args: GetPoolListArgs) -> GetPoolListResponse {
    let GetPoolListArgs { from, limit } = args;
    let mut pools = crate::get_pools();
    pools.sort_by(|p0, p1| {
        let r0 = p0.states.last().map(|s| s.btc_supply()).unwrap_or_default();
        let r1 = p1.states.last().map(|s| s.btc_supply()).unwrap_or_default();
        r1.cmp(&r0)
    });
    pools
        .iter()
        .skip_while(|p| from.as_ref().map_or(false, |from| p.pubkey != *from))
        .take(limit as usize + from.as_ref().map_or(0, |_| 1))
        .skip(from.as_ref().map_or(0, |_| 1))
        .map(|p| PoolInfo {
            key: p.pubkey.clone(),
            name: p.meta.symbol.clone(),
            key_derivation_path: vec![p.meta.id.to_bytes()],
            address: p.addr.clone(),
            nonce: p.states.last().map(|s| s.nonce).unwrap_or_default(),
            btc_reserved: p.states.last().map(|s| s.btc_supply()).unwrap_or_default(),
            coin_reserved: p
                .states
                .last()
                .map(|s| {
                    vec![CoinBalance {
                        id: p.meta.id,
                        value: s.rune_supply() as u128,
                    }]
                })
                .unwrap_or(vec![CoinBalance {
                    id: p.meta.id,
                    value: 0,
                }]),
            utxos: p
                .states
                .last()
                .and_then(|s| s.utxo.clone())
                .map(|utxo| vec![utxo])
                .unwrap_or_default(),
            attributes: p.attrs(),
        })
        .collect()
}

/// REE API
#[query]
pub fn get_pool_info(args: GetPoolInfoArgs) -> GetPoolInfoResponse {
    let GetPoolInfoArgs { pool_address } = args;
    let p = crate::with_pool_addr(&pool_address)?;

    Some(PoolInfo {
        key: p.pubkey.clone(),
        name: p.meta.symbol.clone(),
        key_derivation_path: vec![p.meta.id.to_bytes()],
        address: p.addr.clone(),
        nonce: p.states.last().map(|s| s.nonce).unwrap_or_default(),
        btc_reserved: p.states.last().map(|s| s.btc_supply()).unwrap_or_default(),
        coin_reserved: p
            .states
            .last()
            .map(|s| {
                vec![CoinBalance {
                    id: p.meta.id,
                    value: s.rune_supply() as u128,
                }]
            })
            .unwrap_or_default(),
        utxos: p
            .states
            .last()
            .and_then(|s| s.utxo.clone())
            .map(|utxo| vec![utxo])
            .unwrap_or_default(),
        attributes: p.attrs(),
    })
}

/// REE API
#[update(guard = "ensure_orchestrator")]
pub fn rollback_tx(args: RollbackTxArgs) -> RollbackTxResponse {
    if let Err(e) = crate::with_pool_mut(&args.pool_key, |p| {
        let mut pool = p.ok_or(ExchangeError::InvalidPool)?;
        pool.rollback(args.txid)?;
        Ok(Some(pool))
    }) {
        return Err(e.to_string());
    }
    return Ok(());
}

/// REE API
#[update(guard = "ensure_orchestrator")]
pub fn finalize_tx(args: FinalizeTxArgs) -> FinalizeTxResponse {
    if let Err(e) = crate::with_pool_mut(&args.pool_key, |p| {
        let mut pool = p.ok_or(ExchangeError::InvalidPool)?;
        pool.finalize(args.txid)?;
        Ok(Some(pool))
    }) {
        return Err(e.to_string());
    }
    return Ok(());
}

/// REE API
#[update(guard = "ensure_orchestrator")]
pub async fn execute_tx(args: ExecuteTxArgs) -> ExecuteTxResponse {
    let ExecuteTxArgs {
        psbt_hex,
        txid,
        intention_set,
        intention_index,
        zero_confirmed_tx_queue_length: _zero_confirmed_tx_queue_length,
    } = args;
    let raw = hex::decode(&psbt_hex).map_err(|_| "invalid psbt".to_string())?;
    let mut psbt = Psbt::deserialize(raw.as_slice()).map_err(|_| "invalid psbt".to_string())?;
    let intention = intention_set.intentions[intention_index as usize].clone();
    let Intention {
        exchange_id: _,
        action: _,
        action_params: _,
        pool_address,
        nonce,
        pool_utxo_spend,
        pool_utxo_receive,
        input_coins,
        output_coins,
    } = intention;
    let pool = crate::with_pool_addr(&pool_address)
        .ok_or(ExchangeError::PoolAddressNotFound.to_string())?;
    match intention.action.as_ref() {
        "deposit" => {
            let (new_state, consumed) = pool
                .validate_deposit(
                    txid,
                    nonce,
                    pool_utxo_spend,
                    pool_utxo_receive,
                    input_coins,
                    output_coins,
                )
                .map_err(|e| e.to_string())?;
            if let Some(ref utxo) = consumed {
                crate::psbt::sign(
                    &mut psbt,
                    utxo,
                    pool.base_id().to_string().as_bytes().to_vec(),
                )
                .await
                .map_err(|e| e.to_string())?;
            }
            crate::with_pool_mut(&pool.pubkey, |p| {
                let mut pool = p.expect("already checked in pre_deposit; qed");
                pool.commit(new_state);
                Ok(Some(pool))
            })
            .map_err(|e| e.to_string())?;
        }
        "borrow" => {
            let (new_state, consumed) = pool
                .validate_borrow(
                    txid,
                    nonce,
                    pool_utxo_spend,
                    pool_utxo_receive,
                    input_coins,
                    output_coins,
                )
                .map_err(|e| e.to_string())?;
            crate::psbt::sign(
                &mut psbt,
                &consumed,
                pool.base_id().to_string().as_bytes().to_vec(),
            )
            .await
            .map_err(|e| e.to_string())?;
            crate::with_pool_mut(&pool.pubkey, |p| {
                let mut pool = p.expect("already checked in pre_borrow; qed");
                pool.commit(new_state);
                Ok(Some(pool))
            })
            .map_err(|e| e.to_string())?;
        }
        _ => {
            return Err("invalid method".to_string());
        }
    }
    Ok(psbt.serialize_hex())
}
