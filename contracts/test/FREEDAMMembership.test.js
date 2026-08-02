const { expect } = require("chai");
const { ethers } = require("hardhat");

const TIER = { Founder: 0, Leader: 1, Member: 2 };
const LEADER_DONATION = ethers.parseEther("0.01");
const MEMBER_DONATION = ethers.parseEther("0.001");
const TOO_LOW = ethers.parseEther("0.0005");

describe("FREEDAMMembership (refactored)", function () {
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

    it("Should start with nextMemberNumber at 1", async function () {
      expect(await contract.nextMemberNumber()).to.equal(1);
    });

    it("Should start with zero donations", async function () {
      expect(await contract.totalDonations()).to.equal(0);
    });

    it("Should have correct constants", async function () {
      expect(await contract.FRDM_ID_TOKEN()).to.equal(0);
      expect(await contract.LEADER_THRESHOLD()).to.equal(LEADER_DONATION);
      expect(await contract.MEMBER_MINIMUM()).to.equal(MEMBER_DONATION);
    });
  });

  // ===== Founder Mint =====
  describe("Founder Mint", function () {
    it("Should mint Founder to owner with member number 1", async function () {
      await contract.founderMint();
      expect(await contract.hasMembership(owner.address)).to.be.true;
      expect(await contract.getTier(owner.address)).to.equal(TIER.Founder);
      expect(await contract.getMemberNumber(owner.address)).to.equal(1);
      expect(await contract.totalMembers()).to.equal(1);
      expect(await contract.nextMemberNumber()).to.equal(2); // next available after Founder
    });

    it("Should mint the FRDM_ID_TOKEN (ID 0)", async function () {
      await contract.founderMint();
      expect(await contract.balanceOf(owner.address, 0)).to.equal(1);
    });

    it("Should revert if non-owner tries to mint Founder", async function () {
      await expect(contract.connect(addr1).founderMint())
        .to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should revert if Founder already minted", async function () {
      await contract.founderMint();
      await expect(contract.founderMint())
        .to.be.revertedWithCustomError(contract, "AlreadyHasMembership");
    });
  });

  // ===== Payable Mint — Member Tier =====
  describe("Mint With Donation (Member)", function () {
    it("Should mint Member tier with minimum donation", async function () {
      await contract.connect(addr1).mintWithDonation([], { value: MEMBER_DONATION });
      expect(await contract.hasMembership(addr1.address)).to.be.true;
      expect(await contract.getTier(addr1.address)).to.equal(TIER.Member);
      expect(await contract.balanceOf(addr1.address, 0)).to.equal(1);
    });

    it("Should assign sequential member numbers", async function () {
      await contract.founderMint();
      await contract.connect(addr1).mintWithDonation([], { value: MEMBER_DONATION });
      await contract.connect(addr2).mintWithDonation([], { value: MEMBER_DONATION });
      expect(await contract.getMemberNumber(addr1.address)).to.equal(2);
      expect(await contract.getMemberNumber(addr2.address)).to.equal(3);
    });

    it("Should track totalMembers", async function () {
      await contract.founderMint();
      await contract.connect(addr1).mintWithDonation([], { value: MEMBER_DONATION });
      await contract.connect(addr2).mintWithDonation([], { value: MEMBER_DONATION });
      expect(await contract.totalMembers()).to.equal(3);
    });

    it("Should track donation amounts in totalDonations", async function () {
      await contract.connect(addr1).mintWithDonation([], { value: MEMBER_DONATION });
      await contract.connect(addr2).mintWithDonation([], { value: MEMBER_DONATION });
      expect(await contract.totalDonations()).to.equal(MEMBER_DONATION * 2n);
    });

    it("Should reject donations below minimum", async function () {
      await expect(
        contract.connect(addr1).mintWithDonation([], { value: TOO_LOW })
      ).to.be.revertedWithCustomError(contract, "DonationTooLow");
    });
  });

  // ===== Payable Mint — Leader Tier =====
  describe("Mint With Donation (Leader)", function () {
    it("Should mint Leader tier with LEADER_THRESHOLD", async function () {
      await contract.connect(addr1).mintWithDonation([], { value: LEADER_DONATION });
      expect(await contract.getTier(addr1.address)).to.equal(TIER.Leader);
    });

    it("Should mint Leader tier with donation above threshold", async function () {
      const bigDonation = ethers.parseEther("1.0");
      await contract.connect(addr1).mintWithDonation([], { value: bigDonation });
      expect(await contract.getTier(addr1.address)).to.equal(TIER.Leader);
    });
  });

  // ===== Duplicate & Revocation Guards =====
  describe("Duplicate and Revocation Guards", function () {
    it("Should reject duplicate mint", async function () {
      await contract.connect(addr1).mintWithDonation([], { value: MEMBER_DONATION });
      await expect(
        contract.connect(addr1).mintWithDonation([], { value: MEMBER_DONATION })
      ).to.be.revertedWithCustomError(contract, "AlreadyHasMembership");
    });

    it("Should reject if already has membership from owner mint", async function () {
      await contract.founderMint();
      await expect(
        contract.connect(owner).mintWithDonation([], { value: MEMBER_DONATION })
      ).to.be.revertedWithCustomError(contract, "AlreadyHasMembership");
    });

    it("Should reject mint after revocation", async function () {
      await contract.connect(addr1).mintWithDonation([], { value: MEMBER_DONATION });
      await contract.revokeMembership(addr1.address);
      await expect(
        contract.connect(addr1).mintWithDonation([], { value: MEMBER_DONATION })
      ).to.be.revertedWithCustomError(contract, "MembershipAlreadyRevoked");
    });
  });

  // ===== Allowlist Mode =====
  describe("Allowlist Mode", function () {
    it("Should revert without proof when root is set", async function () {
      await contract.setMerkleRoot(ethers.keccak256("0x1234"));
      await expect(
        contract.connect(addr1).mintWithDonation([], { value: MEMBER_DONATION })
      ).to.be.revertedWithCustomError(contract, "NotAllowlisted");
    });

    it("Should allow minting with valid proof", async function () {
      const leaf = ethers.keccak256(ethers.solidityPacked(["address"], [addr1.address]));
      await contract.setMerkleRoot(leaf);

      await contract.connect(addr1).mintWithDonation([], { value: MEMBER_DONATION });
      expect(await contract.hasMembership(addr1.address)).to.be.true;
    });

    it("Should reject invalid proof", async function () {
      const leaf = ethers.keccak256(ethers.solidityPacked(["address"], [addr1.address]));
      await contract.setMerkleRoot(leaf);

      await expect(
        contract.connect(addr2).mintWithDonation([], { value: MEMBER_DONATION })
      ).to.be.revertedWithCustomError(contract, "NotAllowlisted");
    });

    it("Should return to open mode when root set to zero", async function () {
      await contract.setMerkleRoot(ethers.keccak256("0x1234"));
      await contract.setMerkleRoot(ethers.ZeroHash);
      await contract.connect(addr1).mintWithDonation([], { value: MEMBER_DONATION });
      expect(await contract.hasMembership(addr1.address)).to.be.true;
    });

    it("Should reject non-owner setting merkle root", async function () {
      await expect(contract.connect(addr1).setMerkleRoot(ethers.ZeroHash))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  // ===== Soulbound Enforcement =====
  describe("Soulbound (Non-Transferable)", function () {
    it("Should prevent safeTransferFrom", async function () {
      await contract.connect(addr1).mintWithDonation([], { value: MEMBER_DONATION });
      await expect(
        contract.connect(addr1).safeTransferFrom(addr1.address, addr2.address, 0, 1, "0x")
      ).to.be.revertedWithCustomError(contract, "Soulbound__CannotTransfer");
    });

    it("Should prevent safeBatchTransferFrom", async function () {
      await contract.connect(addr1).mintWithDonation([], { value: MEMBER_DONATION });
      await expect(
        contract.connect(addr1).safeBatchTransferFrom(addr1.address, addr2.address, [0], [1], "0x")
      ).to.be.revertedWithCustomError(contract, "Soulbound__CannotTransfer");
    });
  });

  // ===== Revocation =====
  describe("Revocation", function () {
    it("Should revoke a membership", async function () {
      await contract.connect(addr1).mintWithDonation([], { value: MEMBER_DONATION });
      await contract.revokeMembership(addr1.address);

      expect(await contract.hasMembership(addr1.address)).to.be.false;
      expect(await contract.isRevoked(addr1.address)).to.be.true;
      // Token should be burned — balance is 0
      expect(await contract.balanceOf(addr1.address, 0)).to.equal(0);
    });

    it("Should decrease totalMembers", async function () {
      await contract.connect(addr1).mintWithDonation([], { value: MEMBER_DONATION });
      await contract.connect(addr2).mintWithDonation([], { value: MEMBER_DONATION });
      expect(await contract.totalMembers()).to.equal(2);

      await contract.revokeMembership(addr1.address);
      expect(await contract.totalMembers()).to.equal(1);
    });

    it("Should not underflow on last member revocation", async function () {
      await contract.connect(addr1).mintWithDonation([], { value: MEMBER_DONATION });
      expect(await contract.totalMembers()).to.equal(1);
      await contract.revokeMembership(addr1.address);
      expect(await contract.totalMembers()).to.equal(0);
    });

    it("Should revert on revoking non-member", async function () {
      await expect(contract.revokeMembership(addr1.address))
        .to.be.revertedWithCustomError(contract, "NoMembership");
    });

    it("Should revert if non-owner tries to revoke", async function () {
      await contract.connect(addr1).mintWithDonation([], { value: MEMBER_DONATION });
      await expect(contract.connect(addr2).revokeMembership(addr1.address))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  // ===== Donation Withdrawal =====
  describe("Donation Withdrawal", function () {
    it("Should allow owner to withdraw accumulated donations", async function () {
      await contract.connect(addr1).mintWithDonation([], { value: MEMBER_DONATION });
      await contract.connect(addr2).mintWithDonation([], { value: LEADER_DONATION });
      const expected = MEMBER_DONATION + LEADER_DONATION;
      expect(await contract.totalDonations()).to.equal(expected);

      await contract.withdrawDonations(owner.address);
      expect(await contract.totalDonations()).to.equal(0);
    });

    it("Should transfer ETH to the specified address", async function () {
      await contract.connect(addr1).mintWithDonation([], { value: MEMBER_DONATION });
      const balanceBefore = await ethers.provider.getBalance(owner.address);
      const tx = await contract.withdrawDonations(owner.address);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(owner.address);
      expect(balanceAfter - (balanceBefore - gasCost)).to.equal(MEMBER_DONATION);
    });

    it("Should revert if no donations to withdraw", async function () {
      await expect(contract.withdrawDonations(owner.address))
        .to.be.revertedWithCustomError(contract, "NoDonationsToWithdraw");
    });

    it("Should revert if non-owner tries to withdraw", async function () {
      await contract.connect(addr1).mintWithDonation([], { value: MEMBER_DONATION });
      await expect(contract.connect(addr1).withdrawDonations(addr1.address))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  // ===== View Functions =====
  describe("View Functions", function () {
    it("Should return correct tier", async function () {
      await contract.founderMint();
      await contract.connect(addr1).mintWithDonation([], { value: LEADER_DONATION });
      await contract.connect(addr2).mintWithDonation([], { value: MEMBER_DONATION });

      expect(await contract.getTier(owner.address)).to.equal(TIER.Founder);
      expect(await contract.getTier(addr1.address)).to.equal(TIER.Leader);
      expect(await contract.getTier(addr2.address)).to.equal(TIER.Member);
    });

    it("Should return correct member numbers", async function () {
      await contract.founderMint();
      await contract.connect(addr1).mintWithDonation([], { value: MEMBER_DONATION });
      await contract.connect(addr2).mintWithDonation([], { value: LEADER_DONATION });

      expect(await contract.getMemberNumber(owner.address)).to.equal(1);
      expect(await contract.getMemberNumber(addr1.address)).to.equal(2);
      expect(await contract.getMemberNumber(addr2.address)).to.equal(3);
    });

    it("Should revert getTier and getMemberNumber for non-members", async function () {
      await expect(contract.getTier(addr1.address))
        .to.be.revertedWithCustomError(contract, "NoMembership");
      await expect(contract.getMemberNumber(addr1.address))
        .to.be.revertedWithCustomError(contract, "NoMembership");
    });

    it("Should return correct hasMembership", async function () {
      expect(await contract.hasMembership(addr1.address)).to.be.false;
      await contract.connect(addr1).mintWithDonation([], { value: MEMBER_DONATION });
      expect(await contract.hasMembership(addr1.address)).to.be.true;
    });

    it("Should return correct isRevoked", async function () {
      expect(await contract.isRevoked(addr1.address)).to.be.false;
      await contract.connect(addr1).mintWithDonation([], { value: MEMBER_DONATION });
      await contract.revokeMembership(addr1.address);
      expect(await contract.isRevoked(addr1.address)).to.be.true;
    });
  });

  // ===== Metadata URI =====
  describe("Metadata URI", function () {
    it("Should update URI (owner only)", async function () {
      await contract.setURI("https://freedamdao.org/metadata/{id}.json");
    });

    it("Should revert if non-owner sets URI", async function () {
      await expect(contract.connect(addr1).setURI("https://example.com"))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});