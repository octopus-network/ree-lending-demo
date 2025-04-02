export const idlFactory = ({ IDL }: { IDL: any }) => {
  const Result = IDL.Variant({ Ok: IDL.Null, Err: IDL.Text });
  const TxOutputType = IDL.Variant({
    P2WPKH: IDL.Null,
    OpReturn: IDL.Nat64,
    P2SH: IDL.Null,
    P2TR: IDL.Null,
  });
  const EstimateMinTxFeeArgs = IDL.Record({
    input_types: IDL.Vec(TxOutputType),
    pool_address: IDL.Text,
    output_types: IDL.Vec(TxOutputType),
  });
  const Result_1 = IDL.Variant({ Ok: IDL.Nat64, Err: IDL.Text });
  const FromUserRecord = IDL.Record({ user_id: IDL.Principal });
  const FromCanisterRecord = IDL.Record({
    canister_version: IDL.Opt(IDL.Nat64),
    canister_id: IDL.Principal,
  });
  const CanisterChangeOrigin = IDL.Variant({
    from_user: FromUserRecord,
    from_canister: FromCanisterRecord,
  });
  const CreationRecord = IDL.Record({ controllers: IDL.Vec(IDL.Principal) });
  const CodeDeploymentMode = IDL.Variant({
    reinstall: IDL.Null,
    upgrade: IDL.Null,
    install: IDL.Null,
  });
  const CodeDeploymentRecord = IDL.Record({
    mode: CodeDeploymentMode,
    module_hash: IDL.Vec(IDL.Nat8),
  });
  const LoadSnapshotRecord = IDL.Record({
    canister_version: IDL.Nat64,
    taken_at_timestamp: IDL.Nat64,
    snapshot_id: IDL.Vec(IDL.Nat8),
  });
  const CanisterChangeDetails = IDL.Variant({
    creation: CreationRecord,
    code_deployment: CodeDeploymentRecord,
    load_snapshot: LoadSnapshotRecord,
    controllers_change: CreationRecord,
    code_uninstall: IDL.Null,
  });
  const CanisterChange = IDL.Record({
    timestamp_nanos: IDL.Nat64,
    canister_version: IDL.Nat64,
    origin: CanisterChangeOrigin,
    details: CanisterChangeDetails,
  });
  const CanisterInfoResponse = IDL.Record({
    controllers: IDL.Vec(IDL.Principal),
    module_hash: IDL.Opt(IDL.Vec(IDL.Nat8)),
    recent_changes: IDL.Vec(CanisterChange),
    total_num_changes: IDL.Nat64,
  });
  const Result_2 = IDL.Variant({
    Ok: CanisterInfoResponse,
    Err: IDL.Text,
  });
  const ExchangePool = IDL.Record({
    exchange_id: IDL.Text,
    pool_address: IDL.Text,
    pool_key: IDL.Text,
  });
  const GetFailedInvokeLogArgs = IDL.Variant({
    All: IDL.Null,
    ByTxid: IDL.Text,
    ByAddress: IDL.Text,
  });
  const RollbackStepLogView = IDL.Record({
    result: Result,
    exchange_id: IDL.Text,
    txid: IDL.Text,
    rollback_time: IDL.Text,
    maybe_return_time: IDL.Opt(IDL.Text),
    pool_address: IDL.Text,
  });
  const Result_3 = IDL.Variant({ Ok: IDL.Text, Err: IDL.Text });
  const ExecutionStepLogView = IDL.Record({
    result: Result_3,
    exchange_id: IDL.Text,
    maybe_return_time: IDL.Opt(IDL.Text),
    calling_method: IDL.Text,
    calling_args: IDL.Text,
    pool_address: IDL.Text,
    calling_time: IDL.Text,
  });
  const InvokeLogView = IDL.Record({
    invoke_args: IDL.Text,
    invoke_time: IDL.Text,
    finalized_time: IDL.Opt(IDL.Text),
    rollback_steps: IDL.Vec(RollbackStepLogView),
    confirmed_time: IDL.Opt(IDL.Text),
    execution_steps: IDL.Vec(ExecutionStepLogView),
    processing_result: Result_3,
    broadcasted_time: IDL.Opt(IDL.Text),
  });
  const CoinBalance = IDL.Record({ id: IDL.Text, value: IDL.Nat });
  const InputCoin = IDL.Record({ coin: CoinBalance, from: IDL.Text });
  const OutputCoin = IDL.Record({ to: IDL.Text, coin: CoinBalance });
  const Intention = IDL.Record({
    input_coins: IDL.Vec(InputCoin),
    output_coins: IDL.Vec(OutputCoin),
    action: IDL.Text,
    exchange_id: IDL.Text,
    pool_utxo_spend: IDL.Vec(IDL.Text),
    action_params: IDL.Text,
    nonce: IDL.Nat64,
    pool_utxo_receive: IDL.Vec(IDL.Text),
    pool_address: IDL.Text,
  });
  const IntentionSet = IDL.Record({
    tx_fee_in_sats: IDL.Nat64,
    initiator_address: IDL.Text,
    intentions: IDL.Vec(Intention),
  });
  const InvokeArgs = IDL.Record({
    intention_set: IntentionSet,
    psbt_hex: IDL.Text,
  });
  const MempoolTxFeeRateView = IDL.Record({
    low: IDL.Nat64,
    high: IDL.Nat64,
    update_time: IDL.Text,
    medium: IDL.Nat64,
  });
  const BlockBasic = IDL.Record({
    block_hash: IDL.Text,
    block_height: IDL.Nat32,
  });
  const ReceivedBlockView = IDL.Record({
    processing_results: IDL.Vec(IDL.Text),
    block_basic: BlockBasic,
    txids: IDL.Vec(IDL.Text),
    block_time: IDL.Text,
    received_time: IDL.Text,
  });
  const ExchangeStatus = IDL.Variant({
    Active: IDL.Null,
    Halted: IDL.Record({ txid: IDL.Text }),
  });
  const ExchangeView = IDL.Record({
    status: ExchangeStatus,
    exchange_id: IDL.Text,
    name: IDL.Text,
    canister_id: IDL.Principal,
    description: IDL.Text,
  });
  const RejectedTxView = IDL.Record({
    rollback_results: IDL.Vec(IDL.Text),
    txid: IDL.Text,
    received_time: IDL.Text,
    reason: IDL.Text,
  });
  const BitcoinNetwork = IDL.Variant({
    mainnet: IDL.Null,
    regtest: IDL.Null,
    testnet: IDL.Null,
  });
  const OrchestratorSettings = IDL.Record({
    max_input_count_of_psbt: IDL.Nat32,
    min_tx_confirmations: IDL.Nat32,
    mempool_connector_principal: IDL.Principal,
    max_unconfirmed_tx_count_in_pool: IDL.Nat32,
    min_btc_amount_for_utxo: IDL.Nat64,
    rune_indexer_principal: IDL.Principal,
    max_intentions_per_invoke: IDL.Nat32,
    bitcoin_network: BitcoinNetwork,
  });
  const ExecuteTxArgs = IDL.Record({
    zero_confirmed_tx_queue_length: IDL.Nat32,
    txid: IDL.Text,
    intention_set: IntentionSet,
    intention_index: IDL.Nat32,
    psbt_hex: IDL.Text,
  });
  const TxStatus = IDL.Variant({
    Confirmed: IDL.Nat32,
    Rejected: IDL.Text,
    Pending: IDL.Null,
  });
  const TxDetailView = IDL.Record({
    status: IDL.Opt(TxStatus),
    invoke_log: InvokeLogView,
    included_block: IDL.Opt(BlockBasic),
    sent_tx_hex: IDL.Text,
  });
  const OutpointWithValue = IDL.Record({
    maybe_rune: IDL.Opt(CoinBalance),
    value: IDL.Nat64,
    script_pubkey_hex: IDL.Text,
    outpoint: IDL.Text,
  });
  const NewBlockDetectedArgs = IDL.Record({
    block_hash: IDL.Text,
    block_timestamp: IDL.Nat64,
    tx_ids: IDL.Vec(IDL.Text),
    block_height: IDL.Nat32,
  });
  const ExchangeMetadata = IDL.Record({
    principal: IDL.Principal,
    exchange_id: IDL.Text,
    name: IDL.Text,
    description: IDL.Text,
  });
  const SaveIncludedBlockForTxArgs = IDL.Record({
    txid: IDL.Text,
    timestamp: IDL.Nat64,
    block: BlockBasic,
  });
  const SetTxFeePerVbyteArgs = IDL.Record({
    low: IDL.Nat64,
    high: IDL.Nat64,
    medium: IDL.Nat64,
  });
  return IDL.Service({
    clean_failed_invoke_logs: IDL.Func(
      [IDL.Opt(IDL.Nat64), IDL.Vec(IDL.Text)],
      [Result],
      []
    ),
    estimate_min_tx_fee: IDL.Func(
      [EstimateMinTxFeeArgs],
      [Result_1],
      ["query"]
    ),
    get_canister_info: IDL.Func([IDL.Nat64], [Result_2], []),
    get_exchange_pools: IDL.Func([], [IDL.Vec(ExchangePool)], ["query"]),
    get_failed_invoke_logs: IDL.Func(
      [GetFailedInvokeLogArgs],
      [IDL.Vec(IDL.Tuple(IDL.Text, InvokeLogView))],
      ["query"]
    ),
    get_invoke_args_of_failed_invoke: IDL.Func(
      [IDL.Text],
      [IDL.Opt(InvokeArgs)],
      ["query"]
    ),
    get_last_sent_txs: IDL.Func(
      [IDL.Opt(IDL.Nat32)],
      [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text, IDL.Opt(IDL.Nat32)))],
      ["query"]
    ),
    get_mempool_tx_fee_rate: IDL.Func([], [MempoolTxFeeRateView], ["query"]),
    get_received_blocks: IDL.Func(
      [IDL.Opt(IDL.Nat32), IDL.Opt(IDL.Bool)],
      [IDL.Vec(ReceivedBlockView)],
      ["query"]
    ),
    get_registered_exchanges: IDL.Func([], [IDL.Vec(ExchangeView)], ["query"]),
    get_rejected_txs: IDL.Func(
      [IDL.Opt(IDL.Nat32)],
      [IDL.Vec(RejectedTxView)],
      ["query"]
    ),
    get_settings: IDL.Func([], [OrchestratorSettings], ["query"]),
    get_sign_psbt_args_of_failed_invoke: IDL.Func(
      [IDL.Text, IDL.Nat64],
      [IDL.Opt(ExecuteTxArgs)],
      ["query"]
    ),
    get_tx_for_outpoint: IDL.Func(
      [IDL.Text],
      [IDL.Opt(TxDetailView)],
      ["query"]
    ),
    get_tx_queue_of_pool: IDL.Func(
      [IDL.Text],
      [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Opt(IDL.Nat32)))],
      ["query"]
    ),
    get_tx_sent: IDL.Func([IDL.Text], [IDL.Opt(TxDetailView)], ["query"]),
    get_used_outpoints: IDL.Func(
      [IDL.Opt(IDL.Text)],
      [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text))],
      ["query"]
    ),
    get_zero_confirmed_tx_count_of_pool: IDL.Func(
      [IDL.Text],
      [IDL.Nat32],
      ["query"]
    ),
    get_zero_confirmed_txs: IDL.Func(
      [IDL.Opt(IDL.Text)],
      [IDL.Vec(IDL.Text)],
      ["query"]
    ),
    get_zero_confirmed_utxos_of_address: IDL.Func(
      [IDL.Text],
      [IDL.Vec(OutpointWithValue)],
      ["query"]
    ),
    invoke: IDL.Func([InvokeArgs], [Result_3], []),
    new_block_detected: IDL.Func([NewBlockDetectedArgs], [Result], []),
    register_exchange: IDL.Func([ExchangeMetadata], [Result], []),
    reject_tx: IDL.Func([IDL.Text, IDL.Text], [Result], []),
    save_included_block_for_tx: IDL.Func(
      [SaveIncludedBlockForTxArgs],
      [Result],
      []
    ),
    set_max_input_count_of_psbt: IDL.Func([IDL.Nat32], [Result], []),
    set_max_intentions_per_invoke: IDL.Func([IDL.Nat32], [Result], []),
    set_max_unconfirmed_tx_count_in_pool: IDL.Func([IDL.Nat32], [Result], []),
    set_min_btc_amount_for_utxo: IDL.Func([IDL.Nat64], [Result], []),
    set_min_tx_confirmations: IDL.Func([IDL.Nat32], [Result], []),
    set_tx_fee_per_vbyte: IDL.Func([SetTxFeePerVbyteArgs], [Result], []),
    version: IDL.Func([], [IDL.Text], ["query"]),
  });
};
