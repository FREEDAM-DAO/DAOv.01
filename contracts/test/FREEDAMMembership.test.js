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
        .to.be.revertedWithCustomError(contract, "ArrayLengthMismatch");
    });
    it("Should revert on empty arrays", async function () {
      await expect(contract.batchMintMemberships([], []))
        .to.be.revertedWithCustomError(contract, "ArrayLengthMismatch");
    });
    it("Should revert on duplicate in batch", async function () {
      const addrs = [addr1.address, addr1.address];
      const types = [0, 1];
      await expect(contract.batchMintMemberships(addrs, types))
        .to.be.revertedWithCustomError(contract, "AlreadyHasMembership");
    });
  });

  // ===== Self-Mint (Permissionless) =====
  describe("Self-Mint (Open Mode)", function () {
    it("Should allow anyone to self-mint a standard membership", async function () {
      await contract.connect(addr1).selfMint([]);
      expect(await contract.hasMembership(addr1.address)).to.be.true;
      expect(await contract.getMembershipType(addr1.address)).to.equal(1);
      expect(await contract.totalMembers()).to.equal(1);
    });

    it("Should allow multiple users to self-mint independently", async function () {
      await contract.connect(addr1).selfMint([]);
      await contract.connect(addr2).selfMint([]);
      await contract.connect(addr3).selfMint([]);
      expect(await contract.totalMembers()).to.equal(3);
      expect(await contract.getMembershipType(addr1.address)).to.equal(1);
      expect(await contract.getMembershipType(addr2.address)).to.equal(1);
      expect(await contract.getMembershipType(addr3.address)).to.equal(1);
    });

    it("Should revert if already has membership (self-mint after owner mint)", async function () {
      await contract.mintMembership(addr1.address, 0); // owner mints founding
      await expect(contract.connect(addr1).selfMint([]))
        .to.be.revertedWithCustomError(contract, "AlreadyHasMembership");
    });

    it("Should revert if self-minting twice", async function () {
      await contract.connect(addr1).selfMint([]);
      await expect(contract.connect(addr1).selfMint([]))
        .to.be.revertedWithCustomError(contract, "AlreadyHasMembership");
    });

    it("Should revert if self-minting after revocation", async function () {
      await contract.mintMembership(addr1.address, 1);
      await contract.revokeMembership(addr1.address);
      await expect(contract.connect(addr1).selfMint([]))
        .to.be.revertedWithCustomError(contract, "MembershipAlreadyRevoked");
    });

    it("Self-mint should NOT grant founding or delegate membership", async function () {
      await contract.connect(addr1).selfMint([]);
      const memberType = await contract.getMembershipType(addr1.address);
      expect(memberType).to.equal(1); // STANDARD_MEMBER only
      expect(memberType).to.not.equal(0); // not FOUNDING_MEMBER
      expect(memberType).to.not.equal(2); // not DELEGATE
    });
  });

  // ===== Self-Mint (Allowlist Mode) =====
  describe("Self-Mint (Allowlist Mode)", function () {
    it("Should revert with no proof when root is set", async function () {
      // Set a dummy non-zero root
      await contract.setMerkleRoot(ethers.keccak256("0x1234"));
      await expect(contract.connect(addr1).selfMint([]))
        .to.be.revertedWithCustomError(contract, "NotAllowlisted");
    });

    it("Should allow minting with valid proof", async function () {
      // Build a merkle tree with addr1 using abi.encode (matching contract)
      const leaf = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [addr1.address]);
      const leafHash = ethers.keccak256(leaf);
      const root = leafHash; // single-leaf tree, root = leafHash
      await contract.setMerkleRoot(root);

      await contract.connect(addr1).selfMint([]); // proof is empty — single leaf has no siblings
      expect(await contract.hasMembership(addr1.address)).to.be.true;
    });

    it("Should revert with invalid proof", async function () {
      // Root allows addr1, addr2 tries to mint
      const leaf = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [addr1.address]);
      const leafHash = ethers.keccak256(leaf);
      const root = leafHash;
      await contract.setMerkleRoot(root);

      await expect(contract.connect(addr2).selfMint([]))
        .to.be.revertedWithCustomError(contract, "NotAllowlisted");
    });

    it("Should revert to open mode when root set to zero", async function () {
      await contract.setMerkleRoot(ethers.keccak256("0x1234"));
      await contract.setMerkleRoot(ethers.ZeroHash);
      await contract.connect(addr1).selfMint([]);
      expect(await contract.hasMembership(addr1.address)).to.be.true;
    });

    it("Should revert if non-owner sets merkle root", async function () {
      await expect(contract.connect(addr1).setMerkleRoot(ethers.ZeroHash))
        .to.be.revertedWith("Ownable: caller is not the owner");
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
    it("Should not underflow totalMembers when revoking last member", async function () {
      await contract.mintMembership(addr1.address, 1);
      expect(await contract.totalMembers()).to.equal(1);
      await contract.revokeMembership(addr1.address);
      expect(await contract.totalMembers()).to.equal(0); // 0.8.x reverts on underflow, this confirms no wrap
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
        .to.be.revertedWithCustomError(contract, "NoMembership");
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
