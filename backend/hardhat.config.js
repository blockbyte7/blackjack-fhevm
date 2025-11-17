require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const optimizerSettings = {
  enabled: true,
  runs: 200
};

const compilerSettings = {
  optimizer: optimizerSettings,
  viaIR: true
};

module.exports = {
  solidity: {
    compilers: [
      { version: "0.8.24", settings: compilerSettings },
      { version: "0.8.20", settings: compilerSettings }
    ]
  },
  paths: {
    sources: "./contracts",
    tests: "./test"
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: process.env.SEPOLIA_DEPLOYER_KEY ? [process.env.SEPOLIA_DEPLOYER_KEY] : []
    }
  }
};
