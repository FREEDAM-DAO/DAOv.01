// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title FREEDAM Membership Token (FRDM-ID)
 * @dev ERC-1155 soulbound (non-transferable) membership credential.
 *
 * Token IDs:
 *   0 = Founding Member
 *   1 = Standard Member
 *   2 = Delegate
 *
 * Members are minted one membership token that cannot be transferred.
 * The DAO owner (multisig/governance) can mint and revoke memberships.
 */
contract FREEDAMMembership is ERC1155, Ownable, ReentrancyGuard {

    // Token type IDs
    uint256 public constant FOUNDING_MEMBER = 0;
    uint256 public constant STANDARD_MEMBER = 1;
    uint256 public constant DELEGATE = 2;

    // Track which token ID each address holds (one membership per address)
    mapping(address => uint256) private _membershipType;

    // Track if an address has been minted a membership
    mapping(address => bool) private _hasMembership;

    // Total member count
    uint256 public totalMembers;

    // Revoked members (cannot re-mint)
    mapping(address => bool) private _revoked;

    // ============ Events ============
    event MembershipMinted(address indexed member, uint256 memberType);
    event MembershipRevoked(address indexed member);
    event MetadataURIUpdated(string newURI);

    // ============ Errors ============
    error AlreadyHasMembership(address member);
    error MembershipAlreadyRevoked(address member);
    error NoMembership(address member);
    error InvalidMemberType(uint256 memberType);
    error Soulbound__CannotTransfer();

    // ============ Constructor ============
    constructor(address initialOwner)
        ERC1155("")
        Ownable()
    {
        _transferOwnership(initialOwner);
    }

    // ============ Soulbound Enforcement ============
    /**
     * @dev Override _beforeTokenTransfer to block all transfers except minting and burning.
     * This is what makes the token "soulbound".
     */
    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal override {
        // Allow minting (from = address(0)) and burning (to = address(0))
        if (from != address(0) && to != address(0)) {
            revert Soulbound__CannotTransfer();
        }
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);
    }

    // ============ Minting ============
    /**
     * @notice Mint a membership token to an address.
     * @param to Address receiving membership.
     * @param memberType 0=Founding, 1=Standard, 2=Delegate.
     */
    function mintMembership(address to, uint256 memberType)
        external
        onlyOwner
        nonReentrant
    {
        if (_hasMembership[to]) revert AlreadyHasMembership(to);
        if (_revoked[to]) revert MembershipAlreadyRevoked(to);
        if (memberType > DELEGATE) revert InvalidMemberType(memberType);

        _hasMembership[to] = true;
        _membershipType[to] = memberType;
        totalMembers++;

        _mint(to, memberType, 1, "");

        emit MembershipMinted(to, memberType);
    }

    /**
     * @notice Permissionless self-mint of a standard membership.
     * @dev Anyone can call this to mint a STANDARD_MEMBER (type 1) token to themselves.
     *      Founding and delegate memberships remain owner-controlled via mintMembership().
     *      This is what makes FRDM-ID "permissionless" — no gatekeeper needed to join.
     */
    function selfMint() external nonReentrant {
        if (_hasMembership[msg.sender]) revert AlreadyHasMembership(msg.sender);
        if (_revoked[msg.sender]) revert MembershipAlreadyRevoked(msg.sender);

        _hasMembership[msg.sender] = true;
        _membershipType[msg.sender] = STANDARD_MEMBER;
        totalMembers++;

        _mint(msg.sender, STANDARD_MEMBER, 1, "");

        emit MembershipMinted(msg.sender, STANDARD_MEMBER);
    }

    /**
     * @notice Batch mint memberships to multiple addresses.
     * @param tos Array of addresses.
     * @param memberTypes Array of member types (same length as tos).
     */
    function batchMintMemberships(address[] calldata tos, uint256[] calldata memberTypes)
        external
        onlyOwner
        nonReentrant
    {
        if (tos.length != memberTypes.length) revert InvalidMemberType(999);

        for (uint256 i = 0; i < tos.length; i++) {
            address to = tos[i];
            uint256 mType = memberTypes[i];

            if (_hasMembership[to]) revert AlreadyHasMembership(to);
            if (_revoked[to]) revert MembershipAlreadyRevoked(to);
            if (mType > DELEGATE) revert InvalidMemberType(mType);

            _hasMembership[to] = true;
            _membershipType[to] = mType;
            totalMembers++;

            _mint(to, mType, 1, "");

            emit MembershipMinted(to, mType);
        }
    }

    // ============ Revocation ============
    /**
     * @notice Revoke a member's membership (burn token).
     * @param member Address to revoke.
     */
    function revokeMembership(address member)
        external
        onlyOwner
        nonReentrant
    {
        if (!_hasMembership[member]) revert NoMembership(member);

        uint256 mType = _membershipType[member];

        _burn(member, mType, 1);

        _hasMembership[member] = false;
        _revoked[member] = true;
        _membershipType[member] = 0;
        totalMembers--;

        emit MembershipRevoked(member);
    }

    // ============ View Functions ============
    /**
     * @notice Check if an address holds FRDM-ID membership.
     */
    function hasMembership(address account) external view returns (bool) {
        return _hasMembership[account];
    }

    /**
     * @notice Get the membership type of an address.
     */
    function getMembershipType(address account) external view returns (uint256) {
        require(_hasMembership[account], "No membership");
        return _membershipType[account];
    }

    /**
     * @notice Check if an address was previously revoked.
     */
    function isRevoked(address account) external view returns (bool) {
        return _revoked[account];
    }

    // ============ Metadata ============
    /**
     * @notice Update the metadata URI for token metadata.
     */
    function setURI(string memory newURI) external onlyOwner {
        _setURI(newURI);
        emit MetadataURIUpdated(newURI);
    }
}
