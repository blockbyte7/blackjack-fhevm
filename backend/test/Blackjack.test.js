const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Blackjack contract", function () {
  async function deployFixture() {
    const [owner, alice, bob] = await ethers.getSigners();
    const Blackjack = await ethers.getContractFactory("Blackjack");
    const blackjack = await Blackjack.deploy();
    await blackjack.waitForDeployment();
    return { blackjack, owner, alice, bob };
  }

  describe("Chip economy", function () {
    it("lets a player claim the promotional chip grant exactly once", async function () {
      const { blackjack, alice } = await loadFixture(deployFixture);
      await expect(blackjack.connect(alice).claimFreeChips())
        .to.emit(blackjack, "FreeChipsClaimed")
        .withArgs(alice.address, 10_000);
      await expect(blackjack.connect(alice).claimFreeChips()).to.be.revertedWith("Already claimed");
    });

    it("mints chips according to the conversion rate and allows withdrawing them", async function () {
      const { blackjack, alice } = await loadFixture(deployFixture);
      const oneEth = ethers.parseEther("1");
      const chips = await blackjack.ethToChips(oneEth);

      await expect(blackjack.connect(alice).buyChips({ value: oneEth }))
        .to.emit(blackjack, "ChipsPurchased")
        .withArgs(alice.address, oneEth, chips);

      await expect(blackjack.connect(alice).withdrawChips(chips))
        .to.emit(blackjack, "ChipsWithdrawn")
        .withArgs(alice.address, chips, oneEth);

      expect(await blackjack.getPlayerChips(alice.address)).to.equal(0);
    });
  });

  describe("Table lifecycle", function () {
    it("allows the owner to create a table and players to join with sufficient chips", async function () {
      const { blackjack, owner, alice } = await loadFixture(deployFixture);
      await expect(blackjack.connect(owner).createTable(1_000, 10_000))
        .to.emit(blackjack, "TableCreated")
        .withArgs(1, owner.address);
      expect(await blackjack.getTablesCount()).to.equal(1);

      await blackjack.connect(alice).claimFreeChips();
      await expect(blackjack.connect(alice).joinTable(1, 5_000))
        .to.emit(blackjack, "PlayerJoined")
        .withArgs(1, alice.address, 5_000);

      expect(await blackjack.getPlayerTableId(alice.address)).to.equal(1);
      expect(await blackjack.getPlayerChips(alice.address)).to.equal(5_000);
    });

    it("starts the game automatically once the second player sits down", async function () {
      const { blackjack, owner, alice, bob } = await loadFixture(deployFixture);
      await blackjack.connect(owner).createTable(1_000, 10_000);
      await blackjack.connect(alice).claimFreeChips();
      await blackjack.connect(bob).claimFreeChips();
      await blackjack.connect(alice).joinTable(1, 5_000);

      await expect(blackjack.connect(bob).joinTable(1, 5_000))
        .to.emit(blackjack, "GameStarted")
        .withArgs(1);
    });

    it("returns a player's buy-in to their wallet when they leave before the hand starts", async function () {
      const { blackjack, owner, alice } = await loadFixture(deployFixture);
      await blackjack.connect(owner).createTable(1_000, 10_000);
      await blackjack.connect(alice).claimFreeChips();
      await blackjack.connect(alice).joinTable(1, 4_000);

      await expect(blackjack.connect(alice).leaveTable(1))
        .to.emit(blackjack, "PlayerLeft")
        .withArgs(1, alice.address);

      expect(await blackjack.getPlayerTableId(alice.address)).to.equal(0);
      expect(await blackjack.getPlayerChips(alice.address)).to.equal(10_000);
    });
  });

  describe("Bank controls", function () {
    it("lets the owner fund and defund the dealer bank while non-owners are blocked", async function () {
      const { blackjack, owner, alice } = await loadFixture(deployFixture);
      await expect(blackjack.connect(alice).fundBank({ value: 1 })).to.be.revertedWith("Only owner");

      const deposit = ethers.parseEther("0.5");
      const chipsAdded = await blackjack.ethToChips(deposit);

      await expect(blackjack.connect(owner).fundBank({ value: deposit }))
        .to.emit(blackjack, "BankFunded")
        .withArgs(deposit, chipsAdded);

      await expect(blackjack.connect(owner).defundBank(chipsAdded))
        .to.emit(blackjack, "BankDefunded")
        .withArgs(chipsAdded, deposit);
    });
  });

  describe("Table chip management", function () {
    it("lets seated players top up chips between hands and reclaim them when leaving", async function () {
      const { blackjack, owner, alice } = await loadFixture(deployFixture);
      await blackjack.connect(owner).createTable(1_000, 10_000);
      await blackjack.connect(alice).claimFreeChips();
      await blackjack.connect(alice).joinTable(1, 4_000);

      const topUpAmount = 1_000;
      const walletBefore = await blackjack.getPlayerChips(alice.address);

      await expect(blackjack.connect(alice).topUpTableChips(1, topUpAmount))
        .to.emit(blackjack, "TableChipsToppedUp")
        .withArgs(1, alice.address, topUpAmount);

      expect(await blackjack.getPlayerChips(alice.address)).to.equal(walletBefore - BigInt(topUpAmount));

      await expect(blackjack.connect(alice).leaveTable(1))
        .to.emit(blackjack, "PlayerLeft")
        .withArgs(1, alice.address);

      expect(await blackjack.getPlayerChips(alice.address)).to.equal(10_000);
      expect(await blackjack.getPlayerTableId(alice.address)).to.equal(0);
    });

    it("allows players to cash out their stack when no hand is running", async function () {
      const { blackjack, owner, alice } = await loadFixture(deployFixture);
      await blackjack.connect(owner).createTable(1_000, 10_000);
      await blackjack.connect(alice).claimFreeChips();
      await blackjack.connect(alice).joinTable(1, 6_000);

      await expect(blackjack.connect(alice).cashOut(1))
        .to.emit(blackjack, "PlayerLeft")
        .withArgs(1, alice.address);

      expect(await blackjack.getPlayerChips(alice.address)).to.equal(10_000);
      expect(await blackjack.getPlayerTableId(alice.address)).to.equal(0);
    });

    it("prevents chip purchases or withdrawals while a player is seated", async function () {
      const { blackjack, owner, alice } = await loadFixture(deployFixture);
      await blackjack.connect(owner).createTable(1_000, 10_000);
      await blackjack.connect(alice).claimFreeChips();
      await blackjack.connect(alice).joinTable(1, 4_000);

      await expect(blackjack.connect(alice).buyChips({ value: ethers.parseEther("0.1") }))
        .to.be.revertedWith("Leave table first");

      await expect(blackjack.connect(alice).withdrawChips(1_000))
        .to.be.revertedWith("Leave table first");
    });
  });

  describe("Admin controls", function () {
    it("blocks gameplay while paused and allows recovery via unpause", async function () {
      const { blackjack, owner, alice } = await loadFixture(deployFixture);
      await blackjack.connect(owner).pause();
      await expect(blackjack.connect(alice).claimFreeChips()).to.be.revertedWith("Paused");
      await blackjack.connect(owner).unpause();
      await expect(blackjack.connect(alice).claimFreeChips())
        .to.emit(blackjack, "FreeChipsClaimed")
        .withArgs(alice.address, 10_000);
    });

    it("lets the owner hand off control securely", async function () {
      const { blackjack, owner, alice } = await loadFixture(deployFixture);
      await blackjack.connect(owner).transferOwnership(alice.address);
      await expect(blackjack.connect(owner).pause()).to.be.revertedWith("Only owner");
      await blackjack.connect(alice).pause();
      await blackjack.connect(alice).unpause();
      await blackjack.connect(alice).claimFreeChips();
      expect(await blackjack.getPlayerChips(alice.address)).to.equal(10_000);
    });

    it("enforces the MAX_TABLES limit", async function () {
      const { blackjack, owner } = await loadFixture(deployFixture);
      const maxTables = Number(await blackjack.MAX_TABLES());

      for (let i = 0; i < maxTables; i++) {
        await blackjack.connect(owner).createTable(1_000, 10_000);
      }

      await expect(blackjack.connect(owner).createTable(1_000, 10_000)).to.be.revertedWith("Max tables");
    });
  });
});
