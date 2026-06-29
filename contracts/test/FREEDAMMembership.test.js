const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FREEDAMMembership", function () {
  let contract;
  let owner, addr1, addr2, addr3;

  beforeEach(async function () {
    [owner, addr1, addr2, addr3] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("FREEDAMMembership");
    contract = await Factory.deploy(owner.address);
    await contract.waitForDeployment();
  });

  // ===== Deployment =====
  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await contract.owner()).to.equal(owner.address);
    });
    it("Should start with zero members", async function () {
      expect(await contract.totalMembers()).to.equal(0);
    });
  });

  // ===== Minting =====
  describe("Minting", function () {
    it("Should mint a standard membership", async function () {
      await contract.mintMembership(addr1.address, 1);
      expect(await contract.hasMembership(addr1.address)).to.be.true;
      expect(await contract.getMembershipType(addr1.address)).to.equal(1);
      expect(await contract.totalMembers()).to.equal(1);
    });
    it("Should mint a founding membership", async function () {
      await contract.mintMembership(addr1.address, 0);
      expect(await contract.getMembershipType(addr1.address)).to.equal(0);
    });
    it("Should mint a delegate membership", async function () {
      await contract.mintMembership(addr1.address, 2);
      expect(await contract.getMembershipType(addr1.address)).to.equal(2);
    });
    it("Should revert if non-owner tries to mint", async function () {
      await expect(contract.connect(addr1).mintMembership(addr2.address, 1))
        .to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });
    it("Should revert if address already has membership", async function () {
      await contract.mintMembership(addr1.address, 1);
      await expect(contract.mintMembership(addr1.address, 1))
        .to.be.revertedWithCustomError(contract, "AlreadyHasMembership");
    });
    it("Should revert with invalid member type", async function () {
      await expect(contract.mintMembership(addr1.address, 3))
        .to.be.revertedWithCustomError(contract, "InvalidMemberType");
    });
  });
