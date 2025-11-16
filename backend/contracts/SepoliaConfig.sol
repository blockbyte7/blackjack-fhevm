// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/// @notice Minimal shim that preserves the SepoliaConfig name expected by the Blackjack contract.
abstract contract SepoliaConfig is ZamaEthereumConfig {}
