require("@nomicfoundation/hardhat-toolbox");

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
  }
};
