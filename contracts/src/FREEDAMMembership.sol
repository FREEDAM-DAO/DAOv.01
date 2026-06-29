// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

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
    
    // Track if an address has been minted a membership (for duplicate checks)
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
    error MembershipRevoked(address member);
    error NoMembership(address member);
    error InvalidMemberType(uint256 memberType);
    error Soulbound__CannotTransfer();
    
    // ============ Constructor ============
    constructor(address initialOwner) 
        ERC1155("") 
        Ownable(initialOwner)
    {}
    
    // ============ Soulbound Enforcement ============
    /**
     * @dev Override _update to block all transfers except minting and burning.
     * This is what makes the token "soulbound" — it stays with the address forever.
     */
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override {
        // Allow minting (from = address(0))
        if (from != address(0)) {
            revert Soulbound__CannotTransfer();
        }
        super._update(from, to, ids, values);
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
        if (_revoked[to]) revert MembershipRevoked(to);
        if (memberType > DELEGATE) revert InvalidMemberType(memberType);
        
        _hasMembership[to] = true;
        _membershipType[to] = memberType;
        totalMembers++;
        
        _mint(to, memberType, 1, "");
        
        emit MembershipMinted(to, memberType);
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
            if (_revoked[to]) revert MembershipRevoked(to);
            if (mType > DELEGATE) revert InvalidMemberType(mType);
            
            _hasMembership[to] = true;
            _membershipType[to] = mType;
            totalMembers++;
            
            _mint(to, mType, 1, "");
            
            emit MembershipMinted(to, mType);
        }
    }
