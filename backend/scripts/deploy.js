const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const Blackjack = await hre.ethers.getContractFactory("Blackjack");
  const blackjack = await Blackjack.deploy();
  await blackjack.waitForDeployment();

  const address = await blackjack.getAddress();
  console.log("Blackjack deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
