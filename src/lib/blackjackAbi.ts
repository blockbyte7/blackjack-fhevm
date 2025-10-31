export const blackjackAbi = [
  {
    type: 'function',
    stateMutability: 'view',
    name: 'CHIPS_PER_ETH',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'WEI_PER_CHIP',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'MAX_PLAYERS',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'MAX_TABLES',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'TURN_TIMEOUT',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'bankChips',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'getTablesCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'getConversionRates',
    inputs: [],
    outputs: [
      { name: 'chipsPerEth', type: 'uint256' },
      { name: 'weiPerChip', type: 'uint256' }
    ]
  },
  {
    type: 'function',
    stateMutability: 'pure',
    name: 'ethToChips',
    inputs: [{ name: 'weiAmount', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    type: 'function',
    stateMutability: 'pure',
    name: 'chipsToWei',
    inputs: [{ name: 'chipAmount', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'getPlayerChips',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'playerChips',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'playerTableId',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'hasClaimedFreeChips',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'getTableState',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'status', type: 'uint8' },
          { name: 'minBuyIn', type: 'uint256' },
          { name: 'maxBuyIn', type: 'uint256' },
          { name: 'deck', type: 'uint8[52]' },
          { name: 'deckIndex', type: 'uint8' },
          { name: 'phase', type: 'uint8' },
          {
            name: 'players',
            type: 'tuple[]',
            components: [
              { name: 'addr', type: 'address' },
              { name: 'chips', type: 'uint256' },
              { name: 'bet', type: 'uint256' },
              {
                name: 'cards',
                type: 'tuple[]',
                components: [
                  { name: 'rank', type: 'uint8' },
                  { name: 'suit', type: 'uint8' }
                ]
              },
              { name: 'encRanks', type: 'bytes32[]' },
              { name: 'encSuits', type: 'bytes32[]' },
              { name: 'isActive', type: 'bool' },
              { name: 'hasActed', type: 'bool' }
            ]
          },
          {
            name: 'dealer',
            type: 'tuple',
            components: [
              {
                name: 'cards',
                type: 'tuple[]',
                components: [
                  { name: 'rank', type: 'uint8' },
                  { name: 'suit', type: 'uint8' }
                ]
              },
              { name: 'encRanks', type: 'bytes32[]' },
              { name: 'encSuits', type: 'bytes32[]' },
              { name: 'hasFinished', type: 'bool' }
            ]
          },
          { name: 'lastActivityTimestamp', type: 'uint256' },
          {
            name: 'lastHandResult',
            type: 'tuple',
            components: [
              {
                name: 'dealerCards',
                type: 'tuple[]',
                components: [
                  { name: 'rank', type: 'uint8' },
                  { name: 'suit', type: 'uint8' }
                ]
              },
              { name: 'dealerTotal', type: 'uint256' },
              { name: 'dealerBusted', type: 'bool' },
              {
                name: 'results',
                type: 'tuple[]',
                components: [
                  { name: 'addr', type: 'address' },
                  { name: 'bet', type: 'uint256' },
                  { name: 'total', type: 'uint256' },
                  { name: 'outcome', type: 'uint8' },
                  { name: 'payout', type: 'uint256' },
                  {
                    name: 'cards',
                    type: 'tuple[]',
                    components: [
                      { name: 'rank', type: 'uint8' },
                      { name: 'suit', type: 'uint8' }
                    ]
                  }
                ]
              },
              { name: 'pot', type: 'uint256' },
              { name: 'timestamp', type: 'uint256' },
              { name: 'dealerEncRanks', type: 'bytes32[]' },
              { name: 'dealerEncSuits', type: 'bytes32[]' }
            ]
          },
          { name: 'hasPendingResult', type: 'bool' },
          { name: 'nextHandUnlockTime', type: 'uint256' }
        ]
      }
    ]
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'getAllTables',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'status', type: 'uint8' },
          { name: 'minBuyIn', type: 'uint256' },
          { name: 'maxBuyIn', type: 'uint256' },
          { name: 'deck', type: 'uint8[52]' },
          { name: 'deckIndex', type: 'uint8' },
          { name: 'phase', type: 'uint8' },
          {
            name: 'players',
            type: 'tuple[]',
            components: [
              { name: 'addr', type: 'address' },
              { name: 'chips', type: 'uint256' },
              { name: 'bet', type: 'uint256' },
              {
                name: 'cards',
                type: 'tuple[]',
                components: [
                  { name: 'rank', type: 'uint8' },
                  { name: 'suit', type: 'uint8' }
                ]
              },
              { name: 'encRanks', type: 'bytes32[]' },
              { name: 'encSuits', type: 'bytes32[]' },
              { name: 'isActive', type: 'bool' },
              { name: 'hasActed', type: 'bool' }
            ]
          },
          {
            name: 'dealer',
            type: 'tuple',
            components: [
              {
                name: 'cards',
                type: 'tuple[]',
                components: [
                  { name: 'rank', type: 'uint8' },
                  { name: 'suit', type: 'uint8' }
                ]
              },
              { name: 'encRanks', type: 'bytes32[]' },
              { name: 'encSuits', type: 'bytes32[]' },
              { name: 'hasFinished', type: 'bool' }
            ]
          },
          { name: 'lastActivityTimestamp', type: 'uint256' },
          {
            name: 'lastHandResult',
            type: 'tuple',
            components: [
              {
                name: 'dealerCards',
                type: 'tuple[]',
                components: [
                  { name: 'rank', type: 'uint8' },
                  { name: 'suit', type: 'uint8' }
                ]
              },
              { name: 'dealerTotal', type: 'uint256' },
              { name: 'dealerBusted', type: 'bool' },
              {
                name: 'results',
                type: 'tuple[]',
                components: [
                  { name: 'addr', type: 'address' },
                  { name: 'bet', type: 'uint256' },
                  { name: 'total', type: 'uint256' },
                  { name: 'outcome', type: 'uint8' },
                  { name: 'payout', type: 'uint256' },
                  {
                    name: 'cards',
                    type: 'tuple[]',
                    components: [
                      { name: 'rank', type: 'uint8' },
                      { name: 'suit', type: 'uint8' }
                    ]
                  }
                ]
              },
              { name: 'pot', type: 'uint256' },
              { name: 'timestamp', type: 'uint256' },
              { name: 'dealerEncRanks', type: 'bytes32[]' },
              { name: 'dealerEncSuits', type: 'bytes32[]' }
            ]
          },
          { name: 'hasPendingResult', type: 'bool' },
          { name: 'nextHandUnlockTime', type: 'uint256' }
        ]
      }
    ]
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'getLastHandResult',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [
      {
        name: 'dealerCards',
        type: 'tuple[]',
        components: [
          { name: 'rank', type: 'uint8' },
          { name: 'suit', type: 'uint8' }
        ]
      },
      { name: 'dealerTotal', type: 'uint256' },
      { name: 'dealerBusted', type: 'bool' },
      {
        name: 'results',
        type: 'tuple[]',
        components: [
          { name: 'addr', type: 'address' },
          { name: 'bet', type: 'uint256' },
          { name: 'total', type: 'uint256' },
          { name: 'outcome', type: 'uint8' },
          { name: 'payout', type: 'uint256' },
          {
            name: 'cards',
            type: 'tuple[]',
            components: [
              { name: 'rank', type: 'uint8' },
              { name: 'suit', type: 'uint8' }
            ]
          }
        ]
      },
      { name: 'pot', type: 'uint256' },
      { name: 'timestamp', type: 'uint256' }
    ]
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'getPlayerTableId',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'isPlayerTurn',
    inputs: [
      { name: 'tableId', type: 'uint256' },
      { name: 'player', type: 'address' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'getNextPlayer',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }]
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'getLastDealerEncryptedHandles',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: [
      { name: 'rankHandles', type: 'bytes32[]' },
      { name: 'suitHandles', type: 'bytes32[]' }
    ]
  },
  {
    type: 'function',
    stateMutability: 'view',
    name: 'getPlayerEncryptedHandles',
    inputs: [
      { name: 'tableId', type: 'uint256' },
      { name: 'player', type: 'address' }
    ],
    outputs: [
      { name: 'rankHandles', type: 'bytes32[]' },
      { name: 'suitHandles', type: 'bytes32[]' }
    ]
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'claimFreeChips',
    inputs: [],
    outputs: []
  },
  {
    type: 'function',
    stateMutability: 'payable',
    name: 'buyChips',
    inputs: [],
    outputs: []
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'withdrawChips',
    inputs: [{ name: 'chipAmount', type: 'uint256' }],
    outputs: []
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'createTable',
    inputs: [
      { name: '_minBuyIn', type: 'uint256' },
      { name: '_maxBuyIn', type: 'uint256' }
    ],
    outputs: []
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'joinTable',
    inputs: [
      { name: 'tableId', type: 'uint256' },
      { name: 'buyInAmount', type: 'uint256' }
    ],
    outputs: []
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'leaveTable',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: []
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'cashOut',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: []
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'topUpTableChips',
    inputs: [
      { name: 'tableId', type: 'uint256' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: []
  },
  {
    type: 'function',
    stateMutability: 'payable',
    name: 'fundBank',
    inputs: [],
    outputs: []
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'defundBank',
    inputs: [{ name: 'chipAmount', type: 'uint256' }],
    outputs: []
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'placeBet',
    inputs: [
      { name: 'tableId', type: 'uint256' },
      { name: 'betAmount', type: 'uint256' }
    ],
    outputs: []
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'hit',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: []
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'stand',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: []
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'doubleDown',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: []
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'forceAdvanceOnTimeout',
    inputs: [{ name: 'tableId', type: 'uint256' }],
    outputs: []
  },
  {
    type: 'event',
    name: 'WinnerDetermined',
    inputs: [
      { indexed: true, name: 'tableId', type: 'uint256' },
      { indexed: false, name: 'winners', type: 'address[]' },
      { indexed: false, name: 'amounts', type: 'uint256[]' }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'PhaseChanged',
    inputs: [
      { indexed: true, name: 'tableId', type: 'uint256' },
      { indexed: false, name: 'newPhase', type: 'uint8' }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'CardDealt',
    inputs: [
      { indexed: true, name: 'tableId', type: 'uint256' },
      { indexed: true, name: 'player', type: 'address' },
      {
        indexed: false,
        name: 'card',
        type: 'tuple',
        components: [
          { name: 'rank', type: 'uint8' },
          { name: 'suit', type: 'uint8' }
        ]
      }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'PlayerAction',
    inputs: [
      { indexed: true, name: 'tableId', type: 'uint256' },
      { indexed: true, name: 'player', type: 'address' },
      { indexed: false, name: 'action', type: 'string' },
      { indexed: false, name: 'amount', type: 'uint256' }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'DealerAction',
    inputs: [
      { indexed: true, name: 'tableId', type: 'uint256' },
      { indexed: false, name: 'action', type: 'string' }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'HandResultStored',
    inputs: [
      { indexed: true, name: 'tableId', type: 'uint256' },
      { indexed: false, name: 'timestamp', type: 'uint256' }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'BankFunded',
    inputs: [
      { indexed: false, name: 'weiAmount', type: 'uint256' },
      { indexed: false, name: 'chipsAdded', type: 'uint256' }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'BankDefunded',
    inputs: [
      { indexed: false, name: 'chipsWithdrawn', type: 'uint256' },
      { indexed: false, name: 'weiAmount', type: 'uint256' }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'BetPlaced',
    inputs: [
      { indexed: true, name: 'tableId', type: 'uint256' },
      { indexed: true, name: 'player', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' }
    ],
    anonymous: false
  },
  {
    type: 'event',
    name: 'PayoutSent',
    inputs: [
      { indexed: true, name: 'tableId', type: 'uint256' },
      { indexed: true, name: 'player', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' }
    ],
    anonymous: false
  }
] as const;
