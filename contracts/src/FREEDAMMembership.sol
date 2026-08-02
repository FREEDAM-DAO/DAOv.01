// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title FREEDAM Membership Token (FRDM-ID)
 * @dev ERC-1155 soulbound (non-transferable) membership credential.
 *
 * All members hold token ID 0 — the FRDM-ID credential itself.
 * Member numbers are sequential (Founder = #1, next = #2, etc.)
 * and stored on-chain alongside the membership tier.
 *
 * Tiers:
 *   Founder — reserved for the DAO founder (minted by owner once)
 *   Leader  — donated >= LEADER_THRESHOLD
 *   Member  — donated >= MEMBER_MINIMUM
 *
 * Donations accumulate in the contract and are withdrawable by the owner.
 */
contract FREEDAMMembership is ERC1155, Ownable {

    // ============ Types ============

    /// @notice Membership tier — determines governance weight / privileges.
    enum Tier { Founder, Leader, Member }

    // ============ Constants ============

    /// @notice All members hold this single ERC-1155 token ID as their credential.
    uint256 public constant FRDM_ID_TOKEN = 0;

    /// @notice Donation threshold for Leader tier (testnet convention: ~$10 worth of Sepolia ETH).
    uint256 public constant LEADER_THRESHOLD = 0.01 ether;

    /// @notice Minimum donation to mint any membership (~$1 worth of Sepolia ETH).
    uint256 public constant MEMBER_MINIMUM = 0.001 ether;

    // ============ State ============

    /// @notice Whether an address holds a membership.
    mapping(address => bool) private _hasMembership;

    /// @notice Membership tier for each address.
    mapping(address => Tier) private _tier;

    /// @notice Sequential member number (1-based — Founder = 1, next mint = 2, etc.).
    ///        0 means no membership.
    mapping(address => uint256) private _memberNumber;

    /// @notice Previously revoked members (cannot re-mint).
    mapping(address => bool) private _revoked;

    /// @notice Next member number to assign. Starts at 1 (reserved for Founder).
    uint256 public nextMemberNumber;

    /// @notice Total active members.
    uint256 public totalMembers;

    /// @notice Total ETH donations accumulated in the contract.
    uint256 public totalDonations;

    /// @notice Merkle root for self-mint allowlist. Zero root = open minting.
    bytes32 public merkleRoot;

    // ============ Events ============

    event MembershipMinted(address indexed member, uint256 memberNumber, Tier tier, uint256 donation);
    event MembershipRevoked(address indexed member, uint256 memberNumber);
    event DonationWithdrawn(address indexed to, uint256 amount);
    event MetadataURIUpdated(string newURI);
    event MerkleRootUpdated(bytes32 newRoot);

    // ============ Errors ============

    error AlreadyHasMembership(address member);
    error MembershipAlreadyRevoked(address member);
    error NoMembership(address member);
    error DonationTooLow(uint256 sent, uint256 minimum);
    error NotAllowlisted(address member);
    error Soulbound__CannotTransfer();
    error NoDonationsToWithdraw();

    // ============ Constructor ============

    constructor(address initialOwner)
        ERC1155("")
        Ownable()
    {
        _transferOwnership(initialOwner);
        // Member numbers start at 1 (reserved for Founder)
        nextMemberNumber = 1;
    }

    // ============ Soulbound Enforcement ============

    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal override {
        // Allow minting (from == address(0)) and burning (to == address(0))
        if (from != address(0) && to != address(0)) {
            revert Soulbound__CannotTransfer();
        }
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);
    }

    // ============ Founder Mint ============

    /**
     * @notice Mint the Founder membership to the contract owner.
     * @dev Only callable once. Founder always gets member number 1.
     *      Call this immediately after deployment.
     */
    function founderMint() external onlyOwner {
        if (_hasMembership[msg.sender]) revert AlreadyHasMembership(msg.sender);

        uint256 number = nextMemberNumber; // should be 1 (first mint)
        _hasMembership[msg.sender] = true;
        _tier[msg.sender] = Tier.Founder;
        _memberNumber[msg.sender] = number;
        totalMembers++;
        nextMemberNumber++;

        _mint(msg.sender, FRDM_ID_TOKEN, 1, "");

        emit MembershipMinted(msg.sender, number, Tier.Founder, 0);
    }

    // ============ Payable Self-Mint ============

    /**
     * @notice Self-mint a membership with a donation.
     * @dev Amount determines tier: >= LEADER_THRESHOLD → Leader, >= MEMBER_MINIMUM → Member.
     *      Donation ETH accumulates in the contract for DAO withdrawal.
     * @param proof Merkle proof for allowlist (empty array if open mode).
     */
    function mintWithDonation(bytes32[] calldata proof) external payable {
        if (_hasMembership[msg.sender]) revert AlreadyHasMembership(msg.sender);
        if (_revoked[msg.sender]) revert MembershipAlreadyRevoked(msg.sender);
        if (msg.value < MEMBER_MINIMUM) revert DonationTooLow(msg.value, MEMBER_MINIMUM);

        // Allowlist check (zero root = open minting)
        if (merkleRoot != bytes32(0)) {
            if (!MerkleProof.verify(proof, merkleRoot, keccak256(abi.encodePacked(msg.sender)))) {
                revert NotAllowlisted(msg.sender);
            }
        }

        // Determine tier by donation amount
        Tier tier = msg.value >= LEADER_THRESHOLD ? Tier.Leader : Tier.Member;

        uint256 number = nextMemberNumber;
        _hasMembership[msg.sender] = true;
        _tier[msg.sender] = tier;
        _memberNumber[msg.sender] = number;
        totalMembers++;
        totalDonations += msg.value;
        nextMemberNumber++;

        _mint(msg.sender, FRDM_ID_TOKEN, 1, "");

        emit MembershipMinted(msg.sender, number, tier, msg.value);
    }

    // ============ Revocation ============

    /**
     * @notice Revoke a member's membership (burn their token).
     * @param member Address to revoke.
     */
    function revokeMembership(address member) external onlyOwner {
        if (!_hasMembership[member]) revert NoMembership(member);

        _burn(member, FRDM_ID_TOKEN, 1);

        uint256 number = _memberNumber[member];
        _hasMembership[member] = false;
        _revoked[member] = true;
        _tier[member] = Tier.Member; // reset to default
        _memberNumber[member] = 0;
        totalMembers--;

        emit MembershipRevoked(member, number);
    }

    // ============ Donation Withdrawal ============

    /**
     * @notice Withdraw accumulated donations to the DAO treasury.
     * @param to Address to send the ETH to.
     */
    function withdrawDonations(address payable to) external onlyOwner {
        uint256 amount = totalDonations;
        if (amount == 0) revert NoDonationsToWithdraw();
        totalDonations = 0;
        (bool sent, ) = to.call{value: amount}("");
        require(sent, "Withdraw failed");
        emit DonationWithdrawn(to, amount);
    }

    // ============ View Functions ============

    /**
     * @notice Check if an address holds FRDM-ID membership.
     */
    function hasMembership(address account) external view returns (bool) {
        return _hasMembership[account];
    }

    /**
     * @notice Get the membership tier of an address.
     */
    function getTier(address account) external view returns (Tier) {
        if (!_hasMembership[account]) revert NoMembership(account);
        return _tier[account];
    }

    /**
     * @notice Get the member number of an address (1-based sequential).
     * @return uint256 Member number (Founder = 1, mint order = 2, 3, ...).
     */
    function getMemberNumber(address account) external view returns (uint256) {
        uint256 number = _memberNumber[account];
        if (number == 0) revert NoMembership(account);
        return number;
    }

    /**
     * @notice Check if an address was previously revoked.
     */
    function isRevoked(address account) external view returns (bool) {
        return _revoked[account];
    }

    // ============ Allowlist ============

    /**
     * @notice Set the merkle root for mint allowlist.
     * @dev Set to bytes32(0) to disable allowlist (open minting).
     */
    function setMerkleRoot(bytes32 root) external onlyOwner {
        merkleRoot = root;
        emit MerkleRootUpdated(root);
    }

    // ============ Metadata ============

    /**
     * @notice Update the metadata URI for token metadata.
     * @dev Uses ERC-1155's {id} substitution — all members share the same token ID (0).
     */
    function setURI(string memory newURI) external onlyOwner {
        _setURI(newURI);
        emit MetadataURIUpdated(newURI);
    }
}