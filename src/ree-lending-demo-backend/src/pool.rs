use crate::ExchangeError;
use candid::{CandidType, Deserialize};
use ic_stable_structures::{Storable, storable::Bound};
use ree_types::{CoinBalance, CoinId, InputCoin, OutputCoin, Pubkey, Txid, Utxo};
use serde::Serialize;

/// each tx's satoshis should be >= 10000
pub const MIN_BTC_VALUE: u64 = 10000;

#[derive(Clone, CandidType, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct CoinMeta {
    pub id: CoinId,
    pub symbol: String,
    pub min_amount: u128,
}

impl CoinMeta {
    pub fn btc() -> Self {
        Self {
            id: CoinId::btc(),
            symbol: "BTC".to_string(),
            min_amount: 546,
        }
    }
}

#[derive(CandidType, Clone, Debug, Deserialize, Serialize)]
pub struct Pool {
    pub states: Vec<PoolState>,
    pub meta: CoinMeta,
    pub pubkey: Pubkey,
    pub tweaked: Pubkey,
    pub addr: String,
}

impl Pool {
    pub fn attrs(&self) -> String {
        let attr = serde_json::json!({
            "tweaked": self.tweaked.to_string(),
        });
        serde_json::to_string(&attr).expect("failed to serialize")
    }
}

#[derive(CandidType, Clone, Debug, Deserialize, Eq, PartialEq, Serialize, Default)]
pub struct PoolState {
    pub id: Option<Txid>,
    pub nonce: u64,
    pub utxo: Option<Utxo>,
}

impl PoolState {
    pub fn btc_supply(&self) -> u64 {
        self.utxo.as_ref().map(|utxo| utxo.sats).unwrap_or_default()
    }

    pub fn rune_supply(&self) -> u128 {
        self.utxo
            .as_ref()
            .map(|utxo| utxo.rune_amount())
            .unwrap_or_default()
    }
}

impl Storable for PoolState {
    const BOUND: Bound = Bound::Unbounded;

    fn to_bytes(&self) -> std::borrow::Cow<[u8]> {
        let mut bytes = vec![];
        let _ = ciborium::ser::into_writer(self, &mut bytes);
        std::borrow::Cow::Owned(bytes)
    }

    fn from_bytes(bytes: std::borrow::Cow<[u8]>) -> Self {
        let dire = ciborium::de::from_reader(bytes.as_ref()).expect("failed to decode Pool");
        dire
    }
}

impl Storable for Pool {
    const BOUND: Bound = Bound::Unbounded;

    fn to_bytes(&self) -> std::borrow::Cow<[u8]> {
        let mut bytes = vec![];
        let _ = ciborium::ser::into_writer(self, &mut bytes);
        std::borrow::Cow::Owned(bytes)
    }

    fn from_bytes(bytes: std::borrow::Cow<[u8]>) -> Self {
        let dire = ciborium::de::from_reader(bytes.as_ref()).expect("failed to decode Pool");
        dire
    }
}

impl Pool {
    pub fn base_id(&self) -> CoinId {
        self.meta.id
    }

    pub(crate) fn validate_deposit(
        &self,
        txid: Txid,
        nonce: u64,
        pool_utxo_spend: Vec<String>,
        pool_utxo_receive: Vec<String>,
        input_coins: Vec<InputCoin>,
        output_coins: Vec<OutputCoin>,
    ) -> Result<(PoolState, Option<Utxo>), ExchangeError> {
        (input_coins.len() == 1 && output_coins.is_empty())
            .then(|| ())
            .ok_or(ExchangeError::InvalidSignPsbtArgs(
                "invalid input/output_coins, deposit requires 1 inputs and 0 output".to_string(),
            ))?;
        let btc_input = input_coins[0].coin.clone();
        (btc_input.id == CoinId::btc())
            .then(|| ())
            .ok_or(ExchangeError::InvalidSignPsbtArgs(
                "invalid input_coin, deposit requires BTC".to_string(),
            ))?;
        let mut state = self.states.last().cloned().unwrap_or_default();
        // check nonce matches
        (state.nonce == nonce)
            .then(|| ())
            .ok_or(ExchangeError::PoolStateExpired(state.nonce))?;
        // check prev_outpoint matches
        let pool_utxo = state.utxo.clone();
        (pool_utxo.as_ref().map(|u| u.outpoint()).as_ref() == pool_utxo_spend.last())
            .then(|| ())
            .ok_or(ExchangeError::InvalidSignPsbtArgs(
                "pool_utxo_spend/pool state mismatch".to_string(),
            ))?;
        // check output exists
        let pool_new_outpoint = pool_utxo_receive.last().map(|s| s.clone()).ok_or(
            ExchangeError::InvalidSignPsbtArgs("pool_utxo_receive not found".to_string()),
        )?;
        // check minimal deposit
        (btc_input.value >= MIN_BTC_VALUE as u128)
            .then(|| ())
            .ok_or(ExchangeError::TooSmallFunds)?;
        // calculate the pool state
        let sats_input: u64 = btc_input
            .value
            .try_into()
            .map_err(|_| ExchangeError::Overflow)?;
        let (btc_pool, rune_pool) = pool_utxo
            .as_ref()
            .map(|u| (u.sats, u.rune_amount()))
            .unwrap_or((0u64, 0u128));

        let btc_output = btc_pool
            .checked_add(sats_input)
            .ok_or(ExchangeError::Overflow)?;

        let pool_output = Utxo::try_from(
            pool_new_outpoint,
            Some(CoinBalance {
                value: rune_pool,
                id: self.meta.id,
            }),
            btc_output,
        )
        .map_err(|_| ExchangeError::InvalidTxid)?;
        state.utxo = Some(pool_output);
        state.nonce += 1;
        state.id = Some(txid);
        Ok((state, pool_utxo))
    }

    pub(crate) fn available_to_borrow(
        &self,
        runes: CoinBalance,
    ) -> Result<CoinBalance, ExchangeError> {
        let btc_meta = CoinMeta::btc();
        (runes.id == self.meta.id)
            .then(|| ())
            .ok_or(ExchangeError::InvalidPool)?;
        let recent_state = self.states.last().ok_or(ExchangeError::EmptyPool)?;
        let btc_supply = recent_state.btc_supply();
        (btc_supply != 0)
            .then(|| ())
            .ok_or(ExchangeError::EmptyPool)?;

        let expected_btc = runes.value as u64;
        let min_hold = CoinMeta::btc().min_amount as u64;
        let max_borrow = btc_supply
            .checked_sub(min_hold)
            .ok_or(ExchangeError::Overflow)?;
        let offer = if expected_btc > max_borrow {
            max_borrow
        } else {
            expected_btc
        };

        Ok(CoinBalance {
            id: btc_meta.id,
            value: offer as u128,
        })
    }

    pub(crate) fn validate_borrow(
        &self,
        txid: Txid,
        nonce: u64,
        pool_utxo_spend: Vec<String>,
        pool_utxo_receive: Vec<String>,
        input_coins: Vec<InputCoin>,
        output_coins: Vec<OutputCoin>,
    ) -> Result<(PoolState, Utxo), ExchangeError> {
        (input_coins.len() == 1 && output_coins.len() == 1)
            .then(|| ())
            .ok_or(ExchangeError::InvalidSignPsbtArgs(
                "invalid input/output coins, swap requires 1 input and 1 output".to_string(),
            ))?;
        let input = input_coins.first().clone().expect("checked;qed");
        let output = output_coins.first().clone().expect("checked;qed");
        let mut state = self
            .states
            .last()
            .cloned()
            .ok_or(ExchangeError::EmptyPool)?;
        // check nonce
        (state.nonce == nonce)
            .then(|| ())
            .ok_or(ExchangeError::PoolStateExpired(state.nonce))?;
        let prev_outpoint =
            pool_utxo_spend
                .last()
                .map(|s| s.clone())
                .ok_or(ExchangeError::InvalidSignPsbtArgs(
                    "pool_utxo_spend not found".to_string(),
                ))?;
        let prev_utxo = state.utxo.clone().ok_or(ExchangeError::EmptyPool)?;
        (prev_outpoint == prev_utxo.outpoint()).then(|| ()).ok_or(
            ExchangeError::InvalidSignPsbtArgs("pool_utxo_spend/pool state mismatch".to_string()),
        )?;
        // check minimal sats
        let offer = self.available_to_borrow(input.coin)?;
        let output_btc: u64 = offer
            .value
            .try_into()
            .map_err(|_| ExchangeError::Overflow)?;
        (output_btc >= MIN_BTC_VALUE)
            .then(|| ())
            .ok_or(ExchangeError::TooSmallFunds)?;
        let (btc_output, rune_output) = (
            prev_utxo.sats.checked_sub(output_btc),
            prev_utxo.rune_amount().checked_add(input.coin.value),
        );

        // check params
        (output.coin == offer)
            .then(|| ())
            .ok_or(ExchangeError::InvalidSignPsbtArgs(
                "inputs mismatch with pre_swap".to_string(),
            ))?;
        let (btc_output, rune_output) = (
            btc_output.ok_or(ExchangeError::Overflow)?,
            rune_output.ok_or(ExchangeError::Overflow)?,
        );
        let pool_output = Utxo::try_from(
            pool_utxo_receive
                .last()
                .ok_or(ExchangeError::InvalidSignPsbtArgs(
                    "pool_utxo_receive not found".to_string(),
                ))?,
            Some(CoinBalance {
                id: self.base_id(),
                value: rune_output,
            }),
            btc_output,
        )
        .map_err(|_| ExchangeError::InvalidTxid)?;
        state.utxo = Some(pool_output);
        state.nonce += 1;
        state.id = Some(txid);
        Ok((state, prev_utxo))
    }

    pub(crate) fn rollback(&mut self, txid: Txid) -> Result<(), ExchangeError> {
        let idx = self
            .states
            .iter()
            .position(|state| state.id == Some(txid))
            .ok_or(ExchangeError::InvalidState("txid not found".to_string()))?;
        if idx == 0 {
            self.states.clear();
            return Ok(());
        }
        self.states.truncate(idx);
        Ok(())
    }

    pub(crate) fn finalize(&mut self, txid: Txid) -> Result<(), ExchangeError> {
        let idx = self
            .states
            .iter()
            .position(|state| state.id == Some(txid))
            .ok_or(ExchangeError::InvalidState("txid not found".to_string()))?;
        if idx == 0 {
            return Ok(());
        }
        self.states.rotate_left(idx);
        self.states.truncate(self.states.len() - idx);
        Ok(())
    }

    pub(crate) fn commit(&mut self, state: PoolState) {
        self.states.push(state);
    }
}
