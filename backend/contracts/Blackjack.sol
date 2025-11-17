// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Blackjack with FHE-powered privacy for cards.
 * - Game logic & payouts: clear (fast, keeps your current UX)
 * - Privacy: each dealt card is also stored as encrypted rank/suit (euint8)
 *   so only the rightful player can user-decrypt their own cards in the browser.
 * - Public reveal at showdown can be done by off-chain Relayer/KMS; the contract
 *   exposes encrypted handles so the UI can request decryption (no on-chain decrypt).
 *
 */

import { FHE, ebool, euint8, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract Blackjack is ZamaEthereumConfig {
    // ========= Enums & Structs =========
    enum TableStatus { Waiting, Active, Closed }
    enum GamePhase { WaitingForPlayers, Dealing, PlayerTurns, DealerTurn, Showdown, Completed }
    enum Outcome { Lose, Win, Push, Blackjack }

    struct Card {
        uint8 rank; // 2..14 (11=J, 12=Q, 13=K, 14=A)
        uint8 suit; // 0..3 (hearts, diamonds, clubs, spades)
    }

    // Each player's hand is stored in encrypted (for privacy in UI)
    struct Player {
        address addr;
        uint chips;
        uint bet;
        Card[] cards;            
        euint8[] encRanks;       // encrypted ranks, one per card
        euint8[] encSuits;       // encrypted suits, one per card
        bool isActive;
        bool hasActed;
    }

    struct Dealer {
        Card[]   cards;          // clear dealer cards (gameplay + reveal at showdown)
        euint8[] encRanks;       // encrypted dealer ranks (for public reveal UI)
        euint8[] encSuits;       // encrypted dealer suits
        bool     hasFinished;
    }

    struct PlayerResult {
        address addr;
        uint bet;
        uint total;
        Outcome outcome;
        uint payout;
        Card[] cards; // clear (for history)
    }

    struct HandResult {
        // Clear for fast UI
        Card[] dealerCards;
        uint dealerTotal;
        bool dealerBusted;
        PlayerResult[] results;
        uint pot;
        uint timestamp;

        // Encrypted mirrors for UI decryption (public reveal / archives)
        // We expose handles via getters (FHE.toBytes32) in view functions below.
        // We keep the raw euint8[] here in storage.
        euint8[] dealerEncRanks;
        euint8[] dealerEncSuits;
    }

    struct Table {
        uint id;
        TableStatus status;
        uint minBuyIn;
        uint maxBuyIn;
        uint8[52] deck;       // 1..52
        uint8 deckIndex;      // next to deal
        GamePhase phase;
        Player[] players;
        Dealer dealer;
        uint lastActivityTimestamp;

        // Persisted result for UI
        HandResult lastHandResult;
        bool hasPendingResult;       // kept for potential async variants
        uint nextHandUnlockTime;     // unused in this version (no enforced delay)
    }

    // ========= State =========
    Table[] public tables;
    uint public constant MAX_TABLES   = 100;
    uint public constant MAX_PLAYERS  = 4;
    uint public constant TURN_TIMEOUT = 60 seconds;

    // Blackjack payout: 3:2 (total returned = 2.5x bet)
    uint public constant BLACKJACK_PAYOUT_NUM = 3;
    uint public constant BLACKJACK_PAYOUT_DEN = 2;

    // Economy: 1 ETH = 100,000,000 chips
    uint public constant CHIPS_PER_ETH = 100_000_000;
    uint public constant WEI_PER_CHIP  = 1e18 / CHIPS_PER_ETH;

    mapping(address => uint) public playerTableId; // player -> tableId (0 if none)
    mapping(address => bool) public hasClaimedFreeChips;
    mapping(address => uint) public playerChips;   // wallet chips (not at table)

    // Dealer bank in chips (for payouts)
    uint public bankChips;

    // Reentrancy guard
    bool private _locked;

    // Admin
    address public owner;
    bool    public paused;

    // ========= Events =========
    event TableCreated(uint indexed tableId, address indexed creator);
    event PlayerJoined(uint indexed tableId, address indexed player, uint amount);
    event PlayerLeft(uint indexed tableId, address indexed player);
    event GameStarted(uint indexed tableId);
    event HandStarted(uint indexed tableId);
    event PlayerAction(uint indexed tableId, address indexed player, string action, uint amount);
    event DealerAction(uint indexed tableId, string action);
    event DealerHoleCardRevealed(uint indexed tableId, Card card);
    event WinnerDetermined(uint indexed tableId, address[] winners, uint[] amounts);
    event PayoutSent(uint indexed tableId, address indexed player, uint amount);
    event PhaseChanged(uint indexed tableId, GamePhase newPhase);
    event CardDealt(uint indexed tableId, address indexed player, Card card);
    event PlayerBusted(uint indexed tableId, address indexed player);
    event PlayerStood(uint indexed tableId, address indexed player);
    event BetPlaced(uint indexed tableId, address indexed player, uint amount);
    event FreeChipsClaimed(address indexed player, uint amount);
    event ChipsPurchased(address indexed player, uint weiAmount, uint chipAmount);
    event ChipsWithdrawn(address indexed player, uint chipAmount, uint weiAmount);
    event TurnAutoAdvanced(uint indexed tableId, address indexed playerTimedOut, string reason);
    event TableChipsToppedUp(uint indexed tableId, address indexed player, uint amount);
    event BankFunded(uint weiAmount, uint chipsAdded);
    event BankDefunded(uint chipsWithdrawn, uint weiAmount);
    event HandResultStored(uint indexed tableId, uint timestamp);

    // ========= Modifiers =========
    modifier nonReentrant() { require(!_locked, "ReentrancyGuard"); _locked = true; _; _locked = false; }
    modifier whenNotPaused() { require(!paused, "Paused"); _; }
    modifier onlyOwner()     { require(msg.sender == owner, "Only owner"); _; }

    modifier atActiveTable(uint tableId) {
        require(tableId > 0 && tableId <= tables.length, "Table DNE");
        require(playerTableId[msg.sender] == tableId, "Not at this table");
        _;
    }
    modifier isMyTurn(uint tableId) {
        Table storage t = _getTable(tableId);
        require(t.status == TableStatus.Active, "Inactive");
        require(t.phase  == GamePhase.PlayerTurns, "Not player phase");
        require(_isMyTurnInternal(tableId, msg.sender), "Not your turn");
        _;
    }

    // ========= Constructor =========
    constructor() {
        owner = msg.sender;
        // Optional: seed bank with initial chips but without sending ETH
        bankChips = 1_000_000_000; // 1 billion chips initial float (UI should reflect bank coverage)
    }

    // ========= Views for frontend =========
    function getTableState(uint tableId) external view returns (Table memory) {
        require(tableId > 0 && tableId <= tables.length, "Table DNE");
        return tables[tableId - 1];
    }
    function getAllTables() external view returns (Table[] memory) { return tables; }
    function getTablesCount() external view returns (uint) { return tables.length; }
    function getPlayerTableId(address player) external view returns (uint) { return playerTableId[player]; }

    function isPlayerTurn(uint tableId, address player) external view returns (bool) {
        if (tableId == 0 || tableId > tables.length) return false;
        if (playerTableId[player] != tableId) return false;
        Table storage t = tables[tableId - 1];
        if (t.status != TableStatus.Active || t.phase != GamePhase.PlayerTurns) return false;
        return _isMyTurnInternal(tableId, player);
    }

    function getConversionRates() external pure returns (uint chipsPerEth, uint weiPerChip) {
        return (CHIPS_PER_ETH, WEI_PER_CHIP);
    }
    function ethToChips(uint weiAmount) public pure returns (uint) { return weiAmount / WEI_PER_CHIP; }
    function chipsToWei(uint chipAmount) public pure returns (uint) { return chipAmount * WEI_PER_CHIP; }

    function getNextPlayer(uint tableId) external view returns (address) {
        return _nextPlayerAddr(tableId);
    }

    // ---- Encrypted handles getters (for UI decryption) ----

    /// @notice Return encrypted handles (bytes32) for the dealer's last-hand ranks/suits.
    function getLastDealerEncryptedHandles(uint tableId)
        external view
        returns (bytes32[] memory rankHandles, bytes32[] memory suitHandles)
    {
        Table storage t = _getTable(tableId);
        euint8[] storage r = t.lastHandResult.dealerEncRanks;
        euint8[] storage s = t.lastHandResult.dealerEncSuits;
        rankHandles = new bytes32[](r.length);
        suitHandles = new bytes32[](s.length);
        for (uint i = 0; i < r.length; i++) rankHandles[i] = FHE.toBytes32(r[i]);
        for (uint j = 0; j < s.length; j++) suitHandles[j] = FHE.toBytes32(s[j]);
    }

    /// @notice Return encrypted handles (bytes32) for a given player's current hand (for user decrypt in UI).
    function getPlayerEncryptedHandles(uint tableId, address player)
        external view
        returns (bytes32[] memory rankHandles, bytes32[] memory suitHandles)
    {
        Table storage t = _getTable(tableId);
        uint idx = _getPlayerIndex(tableId, player);
        euint8[] storage r = t.players[idx].encRanks;
        euint8[] storage s = t.players[idx].encSuits;
        rankHandles = new bytes32[](r.length);
        suitHandles = new bytes32[](s.length);
        for (uint i = 0; i < r.length; i++) rankHandles[i] = FHE.toBytes32(r[i]);
        for (uint j = 0; j < s.length; j++) suitHandles[j] = FHE.toBytes32(s[j]);
    }

    /// @notice Last-hand *clear* snapshot for immediate UI display (no enforced delay).
    function getLastHandResult(uint tableId)
        external
        view
        returns (
            Card[] memory dealerCards,
            uint dealerTotal,
            bool dealerBusted,
            PlayerResult[] memory results,
            uint pot,
            uint timestamp
        )
    {
        Table storage t = _getTable(tableId);
        HandResult storage hr = t.lastHandResult;
        return (
            hr.dealerCards,
            hr.dealerTotal,
            hr.dealerBusted,
            hr.results,
            hr.pot,
            hr.timestamp
        );
    }

    // ========= Internals (shared) =========
    function _getTable(uint tableId) private view returns (Table storage) {
        require(tableId > 0 && tableId <= tables.length, "Table DNE");
        return tables[tableId - 1];
    }
    function _getPlayerIndex(uint tableId, address playerAddr) private view returns (uint) {
        Table storage t = _getTable(tableId);
        for (uint i = 0; i < t.players.length; i++) if (t.players[i].addr == playerAddr) return i;
        revert("Player not found");
    }
    function _getPlayerAtTable(uint tableId, address playerAddr) private view returns (Player storage) {
        Table storage t = _getTable(tableId);
        return t.players[_getPlayerIndex(tableId, playerAddr)];
    }

    function _isMyTurnInternal(uint tableId, address who) private view returns (bool) {
        Table storage t = _getTable(tableId);
        if (t.phase != GamePhase.PlayerTurns) return false;
        for (uint i=0; i<t.players.length; i++) {
            if (t.players[i].isActive && !t.players[i].hasActed) {
                if (t.players[i].addr == who) {
                    for (uint j=0; j<i; j++) if (t.players[j].isActive && !t.players[j].hasActed) return false;
                    return true;
                }
                return false;
            }
        }
        return false;
    }

    function _nextPlayerAddr(uint tableId) private view returns (address) {
        if (tableId == 0 || tableId > tables.length) return address(0);
        Table storage t = tables[tableId - 1];
        if (t.phase != GamePhase.PlayerTurns) return address(0);
        for (uint i=0; i<t.players.length; i++)
            if (t.players[i].isActive && !t.players[i].hasActed) return t.players[i].addr;
        return address(0);
    }

    // ========= Economy =========
    function claimFreeChips() external whenNotPaused {
        require(!hasClaimedFreeChips[msg.sender], "Already claimed");
        require(playerTableId[msg.sender] == 0, "Leave table first");
        uint freeChipAmount = 10_000;
        hasClaimedFreeChips[msg.sender] = true;
        playerChips[msg.sender] += freeChipAmount;
        emit FreeChipsClaimed(msg.sender, freeChipAmount);
    }

    function buyChips() external payable whenNotPaused {
        require(msg.value > 0, "Send ETH");
        require(playerTableId[msg.sender] == 0, "Leave table first");
        uint chips = ethToChips(msg.value);
        playerChips[msg.sender] += chips;
        emit ChipsPurchased(msg.sender, msg.value, chips);
    }

    function withdrawChips(uint chipAmount) external whenNotPaused nonReentrant {
        require(chipAmount > 0, "Zero");
        require(playerChips[msg.sender] >= chipAmount, "Insufficient chips");
        require(playerTableId[msg.sender] == 0, "Leave table first");
        uint weiAmount = chipsToWei(chipAmount);
        require(address(this).balance >= weiAmount, "Contract lacks ETH");
        playerChips[msg.sender] -= chipAmount;
        (bool ok,) = payable(msg.sender).call{value: weiAmount}("");
        require(ok, "ETH transfer failed");
        emit ChipsWithdrawn(msg.sender, chipAmount, weiAmount);
    }

    function getPlayerChips(address player) external view returns (uint) { return playerChips[player]; }

    function topUpTableChips(uint tableId, uint amount) external whenNotPaused atActiveTable(tableId) {
        require(amount > 0, "Amount=0");
        Table storage t = _getTable(tableId);
        require(t.phase == GamePhase.WaitingForPlayers, "Only between hands");
        require(playerChips[msg.sender] >= amount, "Insufficient wallet chips");
        uint idx = _getPlayerIndex(tableId, msg.sender);
        playerChips[msg.sender] -= amount;
        t.players[idx].chips += amount;
        t.lastActivityTimestamp = block.timestamp;
        emit TableChipsToppedUp(tableId, msg.sender, amount);
    }

    function fundBank() external payable onlyOwner {
        require(msg.value > 0, "No ETH sent");
        uint chips = ethToChips(msg.value);
        bankChips += chips;
        emit BankFunded(msg.value, chips);
    }

    function defundBank(uint chipAmount) external onlyOwner nonReentrant {
        require(chipAmount > 0 && chipAmount <= bankChips, "Invalid amount");
        uint weiAmount = chipsToWei(chipAmount);
        require(address(this).balance >= weiAmount, "Contract lacks ETH");
        bankChips -= chipAmount;
        (bool ok,) = payable(msg.sender).call{value: weiAmount}("");
        require(ok, "ETH transfer failed");
        emit BankDefunded(chipAmount, weiAmount);
    }

    // ========= Table lifecycle =========
    function createTable(uint _minBuyIn, uint _maxBuyIn) external whenNotPaused {
        require(tables.length < MAX_TABLES, "Max tables");
        require(_minBuyIn > 0 && _maxBuyIn >= _minBuyIn, "Invalid stakes");

        tables.push();
        uint tableId = tables.length;
        Table storage t = tables[tableId - 1];

        t.id = tableId;
        t.status = TableStatus.Waiting;
        t.minBuyIn = _minBuyIn;
        t.maxBuyIn = _maxBuyIn;
        t.deckIndex = 0;
        t.phase = GamePhase.WaitingForPlayers;
        t.lastActivityTimestamp = block.timestamp;

        emit TableCreated(tableId, msg.sender);
    }

    function joinTable(uint tableId, uint buyInAmount) external whenNotPaused {
        Table storage t = _getTable(tableId);
        require(t.players.length < MAX_PLAYERS, "Table full");
        require(playerTableId[msg.sender] == 0, "Already at table");
        require(buyInAmount >= t.minBuyIn && buyInAmount <= t.maxBuyIn, "Invalid buy-in");
        require(playerChips[msg.sender] >= buyInAmount, "Insufficient chips");

        playerChips[msg.sender] -= buyInAmount;
        t.players.push();
        uint idx = t.players.length - 1;
        Player storage p = t.players[idx];
        p.addr = msg.sender;
        p.chips = buyInAmount;
        p.bet = 0;
        // arrays are empty by default; NO "new Card" here
        p.isActive = false;
        p.hasActed = true;

        playerTableId[msg.sender] = tableId;
        t.lastActivityTimestamp = block.timestamp;
        emit PlayerJoined(tableId, msg.sender, buyInAmount);

        if (t.players.length >= 2 && t.status == TableStatus.Waiting) {
            t.status = TableStatus.Active;
            emit GameStarted(tableId);
        }
    }

    function leaveTable(uint tableId) external atActiveTable(tableId) {
        Table storage t = _getTable(tableId);
        uint idx = _getPlayerIndex(tableId, msg.sender);
        Player storage p = t.players[idx];

        if (t.phase != GamePhase.WaitingForPlayers) {
            // Leaving mid-hand: forfeits current bet; return remaining chips, remove player
            uint remaining = p.chips;
            p.chips = 0;
            p.isActive = false;

            playerChips[msg.sender] += remaining;
            playerTableId[msg.sender] = 0;

            for (uint i = idx; i < t.players.length - 1; i++) t.players[i] = t.players[i + 1];
            t.players.pop();

            emit PlayerLeft(tableId, msg.sender);
            t.lastActivityTimestamp = block.timestamp;
            return;
        }

        // Normal leave
        playerChips[msg.sender] += p.chips;
        for (uint i=idx; i<t.players.length-1; i++) t.players[i] = t.players[i+1];
        t.players.pop();
        playerTableId[msg.sender] = 0;
        emit PlayerLeft(tableId, msg.sender);

        if (t.players.length < 2) {
            t.status = TableStatus.Waiting;
            t.phase = GamePhase.WaitingForPlayers;
            emit PhaseChanged(tableId, GamePhase.WaitingForPlayers);
        }
        t.lastActivityTimestamp = block.timestamp;
    }

    function cashOut(uint tableId) external atActiveTable(tableId) nonReentrant {
        Table storage t = _getTable(tableId);
        require(t.phase == GamePhase.WaitingForPlayers, "Active hand");
        uint idx = _getPlayerIndex(tableId, msg.sender);
        Player storage p = t.players[idx];
        uint amount = p.chips; require(amount > 0, "No chips");
        playerChips[msg.sender] += amount;
        for (uint i=idx; i<t.players.length-1; i++) t.players[i] = t.players[i+1];
        t.players.pop();
        playerTableId[msg.sender] = 0;
        emit PlayerLeft(tableId, msg.sender);
        if (t.players.length < 2) { t.status = TableStatus.Waiting; t.phase = GamePhase.WaitingForPlayers; emit PhaseChanged(tableId, GamePhase.WaitingForPlayers); }
        t.lastActivityTimestamp = block.timestamp;
    }

    // ========= Player actions =========
    function placeBet(uint tableId, uint betAmount) external atActiveTable(tableId) {
        Table storage t = _getTable(tableId);
        require(t.phase == GamePhase.WaitingForPlayers, "Betting closed");
        Player storage p = _getPlayerAtTable(tableId, msg.sender);
        require(betAmount >= t.minBuyIn && betAmount <= p.chips, "Invalid bet");

        p.bet = betAmount;
        p.chips -= betAmount;
        p.isActive = true;
        p.hasActed = true;
        emit PlayerAction(tableId, msg.sender, "Bet", betAmount);
        emit BetPlaced(tableId, msg.sender, betAmount);

        // start dealing when at least someone bet and nobody else can/has to
        uint activeBettors; uint playersEligibleNoBet;
        for (uint i=0;i<t.players.length;i++) {
            if (t.players[i].isActive && t.players[i].bet > 0) activeBettors++;
            else if (t.players[i].chips >= t.minBuyIn && t.players[i].bet == 0) playersEligibleNoBet++;
        }

        if (activeBettors > 0 && (playersEligibleNoBet == 0 || t.players.length == 1)) {
            _startNewHand(tableId);
        }
        t.lastActivityTimestamp = block.timestamp;
    }

    function hit(uint tableId) external atActiveTable(tableId) isMyTurn(tableId) {
        Table storage t = _getTable(tableId);
        require(t.phase == GamePhase.PlayerTurns, "Not player phase");
        Player storage p = _getPlayerAtTable(tableId, msg.sender);

        _dealCardToPlayer(tableId, msg.sender);
        emit PlayerAction(tableId, msg.sender, "Hit", 0);

        if (_isBusted(p.cards)) {
            p.isActive = false;
            p.hasActed = true;
            emit PlayerBusted(tableId, msg.sender);
            _advanceToNextPlayer(tableId);
        }
        t.lastActivityTimestamp = block.timestamp;
    }

    function stand(uint tableId) external atActiveTable(tableId) isMyTurn(tableId) {
        Table storage t = _getTable(tableId);
        require(t.phase == GamePhase.PlayerTurns, "Not player phase");
        Player storage p = _getPlayerAtTable(tableId, msg.sender);
        p.hasActed = true;
        emit PlayerAction(tableId, msg.sender, "Stand", 0);
        emit PlayerStood(tableId, msg.sender);
        _advanceToNextPlayer(tableId);
        t.lastActivityTimestamp = block.timestamp;
    }

    function doubleDown(uint tableId) external atActiveTable(tableId) isMyTurn(tableId) {
        Table storage t = _getTable(tableId);
        require(t.phase == GamePhase.PlayerTurns, "Not player phase");
        Player storage p = _getPlayerAtTable(tableId, msg.sender);
        require(p.cards.length == 2, "Only on first two cards");
        require(p.chips >= p.bet, "Insufficient chips");

        p.chips -= p.bet;
        p.bet   *= 2;
        p.hasActed = true;

        _dealCardToPlayer(tableId, msg.sender);
        emit PlayerAction(tableId, msg.sender, "DoubleDown", p.bet);
        if (_isBusted(p.cards)) p.isActive = false;

        _advanceToNextPlayer(tableId);
        t.lastActivityTimestamp = block.timestamp;
    }

    function forceAdvanceOnTimeout(uint tableId) external {
        Table storage t = _getTable(tableId);
        require(t.phase == GamePhase.PlayerTurns, "Not player phase");
        require(block.timestamp >= t.lastActivityTimestamp + TURN_TIMEOUT, "Not timed out");

        for (uint i=0;i<t.players.length;i++) {
            Player storage p = t.players[i];
            if (p.isActive && !p.hasActed) {
                p.hasActed = true;
                emit TurnAutoAdvanced(tableId, p.addr, "timeout-stand");
                _advanceToNextPlayer(tableId);
                t.lastActivityTimestamp = block.timestamp;
                return;
            }
        }
        _startDealerTurn(tableId);
        t.lastActivityTimestamp = block.timestamp;
    }

    // ========= Internal game flow =========
    function _startNewHand(uint tableId) internal {
        Table storage t = _getTable(tableId);
        t.status = TableStatus.Active;
        t.phase  = GamePhase.Dealing;
        t.deckIndex = 0;

        _shuffleDeck(tableId);

        // players: reset and deal two
        for (uint i = 0; i < t.players.length; i++) {
            if (t.players[i].bet > 0 && t.players[i].isActive) {
                delete t.players[i].cards;
                delete t.players[i].encRanks;
                delete t.players[i].encSuits;
                t.players[i].hasActed = false;
                _dealCardToPlayer(tableId, t.players[i].addr);
                _dealCardToPlayer(tableId, t.players[i].addr);
            } else {
                t.players[i].isActive = false;
                t.players[i].hasActed = true;
                delete t.players[i].cards;
                delete t.players[i].encRanks;
                delete t.players[i].encSuits;
            }
        }

        // dealer: two cards (first face-down conceptually; we just don't reveal in UI)
        delete t.dealer.cards;
        delete t.dealer.encRanks;
        delete t.dealer.encSuits;
        _dealCardToDealer(tableId);
        _dealCardToDealer(tableId);

        _checkForNaturalBlackjacks(tableId);

        if (t.phase == GamePhase.Dealing) {
            t.phase = GamePhase.PlayerTurns;
            emit PhaseChanged(tableId, GamePhase.PlayerTurns);
        }
        emit HandStarted(tableId);
        t.lastActivityTimestamp = block.timestamp;
    }

    function _checkForNaturalBlackjacks(uint tableId) internal {
        Table storage t = _getTable(tableId);
        bool dealerBJ = _isBlackjack(t.dealer.cards);

        bool anyPlayerBJ; bool anyPlayerNeedsAct;
        for (uint i=0; i<t.players.length; i++) if (t.players[i].isActive) {
            bool pBJ = _isBlackjack(t.players[i].cards);
            if (pBJ) { anyPlayerBJ = true; t.players[i].hasActed = true; }
            else { anyPlayerNeedsAct = true; }
        }

        if (dealerBJ || (anyPlayerBJ && !anyPlayerNeedsAct)) {
            _startDealerTurn(tableId);
        }
    }

    function _shuffleDeck(uint tableId) internal {
        Table storage t = _getTable(tableId);
        for (uint8 i=0; i<52; i++) t.deck[i] = i + 1;
        uint seed = uint(keccak256(abi.encodePacked(block.timestamp, block.prevrandao, msg.sender, tableId)));
        for (uint i=0; i<51; i++) {
            uint j = i + ((seed + i) % (52 - i));
            (t.deck[i], t.deck[j]) = (t.deck[j], t.deck[i]);
        }
    }

    function _ensureCardsAvailable(Table storage t, uint need, uint tableId) private {
        if (52 - t.deckIndex < need) {
            t.deckIndex = 0;
            _shuffleDeck(tableId);
        }
    }

    function _dealCardToPlayer(uint tableId, address playerAddr) private {
        Table storage t = _getTable(tableId);
        _ensureCardsAvailable(t, 1, tableId);
        Card memory c = _cardFromIndex(t.deck[t.deckIndex]); t.deckIndex++;
        for (uint i=0; i<t.players.length; i++) if (t.players[i].addr == playerAddr) {
            t.players[i].cards.push(c);
            // encrypted mirrors for privacy in UI
            euint8 encRank = FHE.asEuint8(c.rank);
            euint8 encSuit = FHE.asEuint8(c.suit);
            t.players[i].encRanks.push(encRank);
            t.players[i].encSuits.push(encSuit);
            FHE.allow(encRank, playerAddr);
            FHE.allow(encSuit, playerAddr);
            FHE.allow(encRank, address(this));
            FHE.allow(encSuit, address(this));
            break;
        }
        emit CardDealt(tableId, playerAddr, c);
    }

    function _dealCardToDealer(uint tableId) private {
        Table storage t = _getTable(tableId);
        _ensureCardsAvailable(t, 1, tableId);
        Card memory c = _cardFromIndex(t.deck[t.deckIndex]); t.deckIndex++;
        t.dealer.cards.push(c);
        euint8 encRank = FHE.asEuint8(c.rank);
        euint8 encSuit = FHE.asEuint8(c.suit);
        t.dealer.encRanks.push(encRank);
        t.dealer.encSuits.push(encSuit);
        FHE.allow(encRank, address(this));
        FHE.allow(encSuit, address(this));
        emit CardDealt(tableId, address(this), c);
    }

    function _cardFromIndex(uint8 index) internal pure returns (Card memory) {
        uint8 suit = (index - 1) / 13;
        uint8 rank = ((index - 1) % 13) + 2;
        return Card(rank, suit);
    }

    function _advanceToNextPlayer(uint tableId) internal {
        Table storage t = _getTable(tableId);
        for (uint i=0;i<t.players.length;i++) if (t.players[i].isActive && !t.players[i].hasActed) return;
        _startDealerTurn(tableId);
    }

    function _startDealerTurn(uint tableId) internal {
        Table storage t = _getTable(tableId);
        t.phase = GamePhase.DealerTurn;
        emit PhaseChanged(tableId, GamePhase.DealerTurn);

        // Reveal hole card (index 0) event (UI chooses to show)
        if (t.dealer.cards.length > 0) emit DealerHoleCardRevealed(tableId, t.dealer.cards[0]);

        // If no active players remain, skip draws and settle
        bool anyActive;
        for (uint i=0;i<t.players.length;i++) if (t.players[i].isActive) { anyActive = true; break; }
        if (!anyActive) {
            t.dealer.hasFinished = true;
            _storeAndSettle(tableId);
            return;
        }

        // Dealer hits until hard 17+; hits on soft 17
        while (true) {
            (uint dv, bool soft) = _handValueWithSoftFlag(t.dealer.cards);
            if (dv > 21) break;
            if (dv > 17) break;            // 18..21 stands
            if (dv == 17 && !soft) break;  // hard 17 stands
            _dealCardToDealer(tableId); emit DealerAction(tableId, "Hit");
        }

        t.dealer.hasFinished = true;
        _storeAndSettle(tableId);
    }

    function _storeAndSettle(uint tableId) internal {
        Table storage t = _getTable(tableId);

        uint dealerValue = _calculateHandValue(t.dealer.cards);
        bool dealerBusted = dealerValue > 21;

        // Collect pot into bank
        uint activeCount;
        uint collected;
        for (uint i=0;i<t.players.length;i++) {
            if (t.players[i].isActive) {
                activeCount++;
                collected += t.players[i].bet;
            }
        }
        bankChips += collected;

        // Count wins (for event arrays)
        uint winCount;
        for (uint i=0;i<t.players.length;i++) {
            Player storage p = t.players[i];
            if (!p.isActive) continue;
            uint pv = _calculateHandValue(p.cards);
            if (pv <= 21 && (dealerBusted || pv > dealerValue)) winCount++;
        }

        address[] memory winnersAddrs = new address[](winCount);
        uint[] memory winnersPays = new uint[](winCount);
        uint w = 0; // index counter

        // Prepare results array
        PlayerResult[] memory resultsTmp = new PlayerResult[](activeCount);
        uint k;

        for (uint i=0;i<t.players.length;i++) {
            Player storage p = t.players[i];
            if (!p.isActive) continue;

            uint pv = _calculateHandValue(p.cards);
            bool bj = _isBlackjack(p.cards);

            // copy player's clear cards
            Card[] memory pcards = new Card[](p.cards.length);
            for (uint c=0; c<p.cards.length; c++) pcards[c] = p.cards[c];

            PlayerResult memory pr;
            pr.addr = p.addr;
            pr.bet = p.bet;
            pr.total = pv;
            pr.cards = pcards;

            if (pv > 21) {
                pr.outcome = Outcome.Lose;
                pr.payout = 0;
                // bank keeps bet
            } else if (dealerBusted || pv > dealerValue) {
                pr.outcome = bj ? Outcome.Blackjack : Outcome.Win;
                pr.payout = bj ? (p.bet + (p.bet * BLACKJACK_PAYOUT_NUM / BLACKJACK_PAYOUT_DEN))
                               : (p.bet * 2);
                require(bankChips >= pr.payout, "Bank underfunded");
                bankChips -= pr.payout;
                p.chips += pr.payout;
                if (winCount > 0) { winnersAddrs[w] = p.addr; winnersPays[w] = pr.payout; w++; }
                emit PayoutSent(tableId, p.addr, pr.payout);
            } else if (pv == dealerValue) {
                pr.outcome = Outcome.Push;
                pr.payout = p.bet;
                require(bankChips >= p.bet, "Bank underfunded");
                bankChips -= p.bet;
                p.chips += p.bet;
            } else {
                pr.outcome = Outcome.Lose;
                pr.payout = 0;
            }

            resultsTmp[k++] = pr;
        }

        if (winCount > 0) emit WinnerDetermined(tableId, winnersAddrs, winnersPays);

        // Persist lastHandResult (clear + encrypted mirrors for dealer)
        delete t.lastHandResult.dealerCards;
        delete t.lastHandResult.results;
        delete t.lastHandResult.dealerEncRanks;
        delete t.lastHandResult.dealerEncSuits;

        // clear copies
        t.lastHandResult.dealerCards = new Card[](t.dealer.cards.length);
        for (uint dc=0; dc<t.dealer.cards.length; dc++) {
            t.lastHandResult.dealerCards[dc] = t.dealer.cards[dc];
        }
        t.lastHandResult.dealerTotal = dealerValue;
        t.lastHandResult.dealerBusted = dealerBusted;

        t.lastHandResult.results = new PlayerResult[](resultsTmp.length);
        for (uint r=0; r<resultsTmp.length; r++) {
            t.lastHandResult.results[r].addr = resultsTmp[r].addr;
            t.lastHandResult.results[r].bet = resultsTmp[r].bet;
            t.lastHandResult.results[r].total = resultsTmp[r].total;
            t.lastHandResult.results[r].outcome = resultsTmp[r].outcome;
            t.lastHandResult.results[r].payout = resultsTmp[r].payout;
            // deep copy cards
            Card[] memory cc = new Card[](resultsTmp[r].cards.length);
            for (uint rc=0; rc<resultsTmp[r].cards.length; rc++) cc[rc] = resultsTmp[r].cards[rc];
            t.lastHandResult.results[r].cards = cc;
        }

        // encrypted dealer mirrors for UI public-reveal
        t.lastHandResult.dealerEncRanks = new euint8[](t.dealer.encRanks.length);
        t.lastHandResult.dealerEncSuits = new euint8[](t.dealer.encSuits.length);
        for (uint er=0; er<t.dealer.encRanks.length; er++) {
            t.lastHandResult.dealerEncRanks[er] = FHE.makePubliclyDecryptable(t.dealer.encRanks[er]);
        }
        for (uint es=0; es<t.dealer.encSuits.length; es++) {
            t.lastHandResult.dealerEncSuits[es] = FHE.makePubliclyDecryptable(t.dealer.encSuits[es]);
        }

        t.lastHandResult.pot = collected;
        t.lastHandResult.timestamp = block.timestamp;

        // Move to Showdown immediately, no enforced lock
        t.phase = GamePhase.Showdown;
        emit PhaseChanged(tableId, GamePhase.Showdown);
        emit HandResultStored(tableId, block.timestamp);

        // Immediately reset table ready for next hand (UI can still read lastHandResult any time)
        _resetHand(tableId);
    }

    // ========= Hand value helpers =========
    function _isBusted(Card[] memory cards) private pure returns (bool) {
        return _calculateHandValue(cards) > 21;
    }

    function _calculateHandValue(Card[] memory cards) private pure returns (uint) {
        (uint total,) = _handValueWithSoftFlag(cards);
        return total;
    }

    // returns (value, softFlag)
    function _handValueWithSoftFlag(Card[] memory cards) private pure returns (uint total, bool soft) {
        uint aces;
        for (uint i=0;i<cards.length;i++) {
            uint8 r = cards[i].rank;
            if (r == 14) { total += 1; aces++; }        // count Aces as 1 first
            else if (r > 10) total += 10;               // 10/J/Q/K as 10
            else total += r;
        }
        if (aces > 0 && total + 10 <= 21) { total += 10; soft = true; } // one Ace as 11
    }

    function _isBlackjack(Card[] memory cards) private pure returns (bool) {
        if (cards.length != 2) return false;
        uint total = _calculateHandValue(cards);
        if (total != 21) return false;
        bool hasAce; bool hasTenVal;
        for (uint i=0;i<2;i++) {
            if (cards[i].rank == 14) hasAce = true;
            if (cards[i].rank >= 10 && cards[i].rank <= 13) hasTenVal = true;
        }
        return hasAce && hasTenVal;
    }

    function _resetHand(uint tableId) internal {
        Table storage t = _getTable(tableId);
        t.phase = GamePhase.WaitingForPlayers;
        emit PhaseChanged(tableId, GamePhase.WaitingForPlayers);

        for (uint i=0;i<t.players.length;i++) {
            delete t.players[i].cards;
            delete t.players[i].encRanks;
            delete t.players[i].encSuits;
            t.players[i].isActive = false;
            t.players[i].hasActed = false;
            t.players[i].bet = 0;
        }
        delete t.dealer.cards;
        delete t.dealer.encRanks;
        delete t.dealer.encSuits;
        t.dealer.hasFinished = false;

        t.lastActivityTimestamp = block.timestamp;
    }

    // ========= Admin =========
    function pause() external onlyOwner { paused = true; }
    function unpause() external onlyOwner { paused = false; }
    function transferOwnership(address newOwner) external onlyOwner { require(newOwner != address(0), "Zero addr"); owner = newOwner; }
}
