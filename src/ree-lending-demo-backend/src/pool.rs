use crate::ExchangeError;
use candid::{CandidType, Deserialize};
use ic_stable_structures::{Storable, storable::Bound};
use ree_types::{CoinBalance, CoinBalances, CoinId, InputCoin, OutputCoin, Pubkey, Txid, Utxo};
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
// Pool represents the basic structure of a lending pool
// It maintains the pool's state history, metadata, and address information
pub struct Pool {
    pub states: Vec<PoolState>, // Chain of historical pool states
    pub meta: CoinMeta,
    pub pubkey: Pubkey,
    pub tweaked: Pubkey,
    pub addr: String, // Pool address (cached to avoid re-acquisition costs)
}

impl Pool {
    pub fn attrs(&self) -> String {
        "".to_string()
    }
}

#[derive(CandidType, Clone, Debug, Deserialize, Eq, PartialEq, Serialize, Default)]
// PoolState represents the state of a pool
// A new PoolState is created and added to the Pool's states chain after each transaction
pub struct PoolState {
    pub id: Option<Txid>, // Transaction ID that created this state (None for initial state)
    pub nonce: u64,       // Incremental counter to prevent replay attacks
    pub utxo: Option<Utxo>, // The UTXO holding the pool's assets
}

impl PoolState {
    pub fn btc_supply(&self) -> u64 {
        self.utxo.as_ref().map(|utxo| utxo.sats).unwrap_or_default()
    }

    pub fn rune_supply(&self, rune_id: CoinId) -> u128 {
        self.utxo
            .as_ref()
            .map(|utxo| utxo.coins.value_of(&rune_id))
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
        let dire = ciborium::de::from_reader(bytes.as_ref()).expect("failed to decode PoolState");
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

    // Assigns a unique derivation path to each pool based on its base asset ID
    // This ensures different pools have different addresses and use different private keys to hold assets
    pub fn derivation_path(&self) -> Vec<Vec<u8>> {
        vec![self.base_id().to_string().as_bytes().to_vec()]
    }

    // Validates a deposit transaction against exchange requirements
    // If valid, generates the new pool state that would result from executing the transaction
    // Returns the new state
    pub(crate) fn validate_deposit(
        &self,
        txid: Txid,
        nonce: u64,
        pool_utxo_spent: Vec<String>,
        pool_utxo_received: Vec<Utxo>,
        input_coins: Vec<InputCoin>,
        output_coins: Vec<OutputCoin>,
    ) -> Result<(PoolState, Option<Utxo>), ExchangeError> {
        // Verify transaction structure (1 input coin, 0 output coins)
        (input_coins.len() == 1 && output_coins.is_empty())
            .then(|| ())
            .ok_or(ExchangeError::InvalidSignPsbtArgs(
                "invalid input/output_coins, deposit requires 1 inputs and 0 output".to_string(),
            ))?;
        let btc_input = input_coins[0].coin.clone();
        // Verify input coin is BTC
        (btc_input.id == CoinId::btc())
            .then(|| ())
            .ok_or(ExchangeError::InvalidSignPsbtArgs(
                "invalid input_coin, deposit requires BTC".to_string(),
            ))?;
        // Get the current pool state or use default if empty
        let mut state = self.states.last().cloned().unwrap_or_default();
        // Verify nonce matches to prevent replay attacks
        (state.nonce == nonce)
            .then(|| ())
            .ok_or(ExchangeError::PoolStateExpired(state.nonce))?;
        // Verify previous outpoint matches the current pool UTXO
        let pool_utxo = state.utxo.clone();
        (pool_utxo.as_ref().map(|u| u.outpoint()).as_ref() == pool_utxo_spent.last())
            .then(|| ())
            .ok_or(ExchangeError::InvalidSignPsbtArgs(
                "pool_utxo_spent/pool state mismatch".to_string(),
            ))?;
        // Verify new output exists in the transaction
        let pool_new_outpoint = pool_utxo_received.last().map(|s| s.clone()).ok_or(
            ExchangeError::InvalidSignPsbtArgs("pool_utxo_received not found".to_string()),
        )?;
        // Verify deposit amount meets minimum requirement
        (btc_input.value >= MIN_BTC_VALUE as u128)
            .then(|| ())
            .ok_or(ExchangeError::TooSmallFunds)?;
        // Calculate the new pool state after deposit
        let sats_input: u64 = btc_input
            .value
            .try_into()
            .map_err(|_| ExchangeError::Overflow)?;
        let (btc_pool, rune_pool) = pool_utxo
            .as_ref()
            .map(|u| (u.sats, u.coins.value_of(&self.meta.id)))
            .unwrap_or((0u64, 0u128));

        let btc_output = btc_pool
            .checked_add(sats_input)
            .ok_or(ExchangeError::Overflow)?;

        let mut coins = CoinBalances::new();
        coins.add_coin(&CoinBalance {
            value: rune_pool,
            id: self.meta.id,
        });
        // Create new UTXO with updated balance
        let pool_output = Utxo::try_from(pool_new_outpoint.outpoint(), coins, btc_output)
            .map_err(|_| ExchangeError::InvalidTxid)?;

        // Update the state with new UTXO, increment nonce, and set transaction ID
        state.utxo = Some(pool_output);
        state.nonce += 1;
        state.id = Some(txid);
        Ok((state, pool_utxo))
    }

    // Calculates how much collateral (RICH) is needed to borrow the specified amount of BTC
    // In this demo program, the collateral ratio is 1:1 (equal amounts of RICH and BTC)
    // Also checks if the pool has sufficient BTC to lend the requested amount
    // Returns a tuple of (required collateral, actual BTC amount that can be borrowed)
    pub(crate) fn available_to_borrow(
        &self,
        output_btc: CoinBalance,
    ) -> Result<(CoinBalance, CoinBalance), ExchangeError> {
        // Verify the requested output is BTC
        let btc_meta = CoinMeta::btc();
        (output_btc.id == btc_meta.id)
            .then(|| ())
            .ok_or(ExchangeError::InvalidPool)?;
        // Get the most recent pool state and verify it's not empty
        let recent_state = self.states.last().ok_or(ExchangeError::EmptyPool)?;
        let btc_supply = recent_state.btc_supply();
        (btc_supply != 0)
            .then(|| ())
            .ok_or(ExchangeError::EmptyPool)?;

        // Calculate the maximum amount that can be borrowed
        let expected_btc = output_btc.value as u64;
        let min_hold = CoinMeta::btc().min_amount as u64; // Minimum BTC that must remain in the pool
        let max_borrow = btc_supply
            .checked_sub(min_hold)
            .ok_or(ExchangeError::Overflow)?;

        // If requested amount exceeds available funds, provide the maximum possible
        let offer = if expected_btc > max_borrow {
            max_borrow
        } else {
            expected_btc
        };

        // Return the required collateral and actual BTC amount (1:1 ratio)
        Ok((
            CoinBalance {
                id: self.base_id(),
                value: offer as u128, // RICH collateral amount equals BTC amount (1:1 ratio)
            },
            CoinBalance {
                id: btc_meta.id,
                value: offer as u128, // Actual BTC amount that will be borrowed
            },
        ))
    }

    // Validates a borrow transaction against exchange requirements
    // If valid, generates the new pool state that would result from executing the transaction
    // Returns the new state
    pub(crate) fn validate_borrow(
        &self,
        txid: Txid,
        nonce: u64,
        pool_utxo_spent: Vec<String>,
        pool_utxo_received: Vec<Utxo>,
        input_coins: Vec<InputCoin>,
        output_coins: Vec<OutputCoin>,
    ) -> Result<(PoolState, Utxo), ExchangeError> {
        // Verify transaction structure (1 input coin, 1 output coin)
        (input_coins.len() == 1 && output_coins.len() == 1)
            .then(|| ())
            .ok_or(ExchangeError::InvalidSignPsbtArgs(
                "invalid input/output coins, swap requires 1 input and 1 output".to_string(),
            ))?;
        let input = input_coins.first().clone().expect("checked;qed");
        let output = output_coins.first().clone().expect("checked;qed");
        // Get the current pool state
        let mut state = self
            .states
            .last()
            .cloned()
            .ok_or(ExchangeError::EmptyPool)?;
        // Verify nonce matches to prevent replay attacks
        (state.nonce == nonce)
            .then(|| ())
            .ok_or(ExchangeError::PoolStateExpired(state.nonce))?;
        // Verify previous outpoint exists and matches the current pool UTXO
        let prev_outpoint =
            pool_utxo_spent
                .last()
                .map(|s| s.clone())
                .ok_or(ExchangeError::InvalidSignPsbtArgs(
                    "pool_utxo_spent not found".to_string(),
                ))?;
        let prev_utxo = state.utxo.clone().ok_or(ExchangeError::EmptyPool)?;
        (prev_outpoint == prev_utxo.outpoint()).then(|| ()).ok_or(
            ExchangeError::InvalidSignPsbtArgs("pool_utxo_spent/pool state mismatch".to_string()),
        )?;
        // Calculate how much BTC can be borrowed and how much collateral is required
        let (runes, btc) = self.available_to_borrow(output.coin)?;
        let output_btc: u64 = btc.value.try_into().map_err(|_| ExchangeError::Overflow)?;
        // Verify borrow amount meets minimum requirement
        (output_btc >= MIN_BTC_VALUE)
            .then(|| ())
            .ok_or(ExchangeError::TooSmallFunds)?;
        // Calculate the new pool balances after the borrow transaction
        let (btc_output, rune_output) = (
            prev_utxo.sats.checked_sub(output_btc),
            prev_utxo
                .coins
                .value_of(&self.meta.id)
                .checked_add(runes.value),
        );

        // Verify the output and input coins match what was calculated by available_to_borrow
        (output.coin == btc)
            .then(|| ())
            .ok_or(ExchangeError::InvalidSignPsbtArgs(
                "output mismatch with pre_swap".to_string(),
            ))?;
        (input.coin == runes)
            .then(|| ())
            .ok_or(ExchangeError::InvalidSignPsbtArgs(
                "input mismatch with pre_borrow".to_string(),
            ))?;

        // Handle potential overflows
        let (btc_output, rune_output) = (
            btc_output.ok_or(ExchangeError::Overflow)?,
            rune_output.ok_or(ExchangeError::Overflow)?,
        );

        let mut coins = CoinBalances::new();
        coins.add_coin(&CoinBalance {
            value: rune_output,
            id: self.base_id(),
        });
        // Create new UTXO with updated balance
        let pool_output = Utxo::try_from(
            pool_utxo_received
                .last()
                .ok_or(ExchangeError::InvalidSignPsbtArgs(
                    "pool_utxo_received not found".to_string(),
                ))?
                .outpoint(),
            coins,
            btc_output,
        )
        .map_err(|_| ExchangeError::InvalidTxid)?;

        // Update the state with new UTXO, increment nonce, and set transaction ID
        state.utxo = Some(pool_output);
        state.nonce += 1;
        state.id = Some(txid);

        Ok((state, prev_utxo))
    }

    // Rollback the pool state to before the specified transaction
    // Removes the state created by txid and all subsequent states
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

    // Finalize a transaction by making its state the new base state
    // Removes all states before the specified transaction
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

    // Adds a new PoolState to the chain after a transaction is executed
    pub(crate) fn commit(&mut self, state: PoolState) {
        self.states.push(state);
    }
}
