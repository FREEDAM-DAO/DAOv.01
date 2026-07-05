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
        .to.be.revertedWith("Ownable: caller is not the owner");
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

  // ===== Batch Minting =====
  describe("Batch Minting", function () {
    it("Should batch mint memberships", async function () {
      const addrs = [addr1.address, addr2.address, addr3.address];
      const types = [0, 1, 2];
      await contract.batchMintMemberships(addrs, types);
      expect(await contract.totalMembers()).to.equal(3);
      expect(await contract.hasMembership(addr1.address)).to.be.true;
      expect(await contract.hasMembership(addr2.address)).to.be.true;
      expect(await contract.hasMembership(addr3.address)).to.be.true;
    });
    it("Should revert on length mismatch", async function () {
      const addrs = [addr1.address, addr2.address];
      const types = [0];
      await expect(contract.batchMintMemberships(addrs, types))
        .to.be.revertedWithCustomError(contract, "InvalidMemberType");
    });
    it("Should revert on duplicate in batch", async function () {
      const addrs = [addr1.address, addr1.address];
      const types = [0, 1];
      await expect(contract.batchMintMemberships(addrs, types))
        .to.be.revertedWithCustomError(contract, "AlreadyHasMembership");
    });
  });

  // ===== Soulbound Enforcement =====
  describe("Soulbound (Non-Transferable)", function () {
    it("Should prevent safeTransferFrom", async function () {
      await contract.mintMembership(addr1.address, 1);
      await expect(
        contract.connect(addr1).safeTransferFrom(addr1.address, addr2.address, 1, 1, "0x")
      ).to.be.revertedWithCustomError(contract, "Soulbound__CannotTransfer");
    });
    it("Should prevent safeBatchTransferFrom", async function () {
      await contract.mintMembership(addr1.address, 1);
      await expect(
        contract.connect(addr1).safeBatchTransferFrom(addr1.address, addr2.address, [1], [1], "0x")
      ).to.be.revertedWithCustomError(contract, "Soulbound__CannotTransfer");
    });
  });

  // ===== Revocation =====
  describe("Revocation", function () {
    it("Should revoke a membership", async function () {
      await contract.mintMembership(addr1.address, 1);
      await contract.revokeMembership(addr1.address);
      expect(await contract.hasMembership(addr1.address)).to.be.false;
      expect(await contract.isRevoked(addr1.address)).to.be.true;
      expect(await contract.totalMembers()).to.equal(0);
    });
    it("Should revert if revoking non-member", async function () {
      await expect(contract.revokeMembership(addr1.address))
        .to.be.revertedWithCustomError(contract, "NoMembership");
    });
    it("Should prevent re-minting after revocation", async function () {
      await contract.mintMembership(addr1.address, 1);
      await contract.revokeMembership(addr1.address);
      await expect(contract.mintMembership(addr1.address, 1))
        .to.be.revertedWithCustomError(contract, "MembershipAlreadyRevoked");
    });
    it("Should revert if non-owner tries to revoke", async function () {
      await contract.mintMembership(addr1.address, 1);
      await expect(contract.connect(addr2).revokeMembership(addr1.address))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  // ===== View Functions =====
  describe("View Functions", function () {
    it("Should return correct membership type", async function () {
      await contract.mintMembership(addr1.address, 2);
      expect(await contract.getMembershipType(addr1.address)).to.equal(2);
    });
    it("Should revert on getMembershipType for non-member", async function () {
      await expect(contract.getMembershipType(addr1.address))
        .to.be.revertedWith("No membership");
    });
    it("Should return false for isRevoked on fresh address", async function () {
      expect(await contract.isRevoked(addr1.address)).to.be.false;
    });
  });

  // ===== URI =====
  describe("Metadata URI", function () {
    it("Should update URI (owner only)", async function () {
      await contract.setURI("https://freedamdao.org/metadata/{id}.json");
      // URI is stored internally; we just verify no revert
    });
    it("Should revert if non-owner sets URI", async function () {
      await expect(contract.connect(addr1).setURI("https://example.com"))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});
