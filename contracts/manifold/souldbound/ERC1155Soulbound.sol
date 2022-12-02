// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@manifoldxyz/creator-core-solidity/contracts/core/IERC1155CreatorCore.sol";
import "@manifoldxyz/creator-core-solidity/contracts/extensions/ERC1155/IERC1155CreatorExtensionApproveTransfer.sol";
import "@manifoldxyz/libraries-solidity/contracts/access/IAdminControl.sol";

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";

/**
 * @title Soulbound token
 * @author manifold.xyz
 * @notice Souldbound shared extension for Manifold Creator contracts.
 */
contract ERC1155Soulbound is IERC165, IERC1155CreatorExtensionApproveTransfer {

    bytes4 private constant IERC1155CreatorExtensionApproveTransfer_v1 = 0x93a80b14;
    mapping(address => mapping(uint256 => bool)) private _nonSoulbound;

    function supportsInterface(bytes4 interfaceId) public view virtual override(IERC165) returns (bool) {
        return interfaceId == type(IERC1155CreatorExtensionApproveTransfer).interfaceId ||
            interfaceId == IERC1155CreatorExtensionApproveTransfer_v1 ||
            interfaceId == type(IERC165).interfaceId;
    }

    /**
     * @notice This extension is shared, not single-creator. So we must ensure
     * that a burn redeems's initializer is an admin on the creator contract
     * @param creatorContractAddress    the address of the creator contract to check the admin against
     */
    modifier creatorAdminRequired(address creatorContractAddress) {
        require(IAdminControl(creatorContractAddress).isAdmin(msg.sender), "Wallet is not an admin");
        _;
    }

    /**
     * @dev Set whether or not the creator will check the extension for approval of token transfer
     */
    function setApproveTransfer(address creatorContractAddress, bool enabled) external creatorAdminRequired(creatorContractAddress) {
        require(ERC165Checker.supportsInterface(creatorContractAddress, type(IERC1155CreatorCore).interfaceId), "creator must implement IERC1155CreatorCore");
        IERC1155CreatorCore(creatorContractAddress).setApproveTransferExtension(enabled);
    }

    /**
     * @dev Called by creator contract to approve a transfer
     */
    function approveTransfer(address, address from, address, uint256[] calldata tokenIds, uint256[] calldata) external view returns (bool) {
        return _approveTransfer(from, tokenIds);
    }

    /**
     * @dev Called by creator contract to approve a transfer (v1)
     */
    function approveTransfer(address from, address, uint256[] calldata tokenIds, uint256[] calldata) external view returns (bool) {
        return _approveTransfer(from, tokenIds);
    }

    function _approveTransfer(address from, uint256[] calldata tokenIds) private view returns (bool) {
        if (from == address(0)) return true;
        for (uint i; i < tokenIds.length;) {
          if (!_nonSoulbound[msg.sender][tokenIds[i]]) return false;
          unchecked { ++i; }
        }
        return true;
    }

    /**
     * @dev Set whether or not a token is soulbound
     */
    function setSoulbound(address creatorContractAddress, uint256 tokenId, bool soulbound) external creatorAdminRequired(creatorContractAddress) {
        _nonSoulbound[creatorContractAddress][tokenId] = !soulbound;
    }

    /**
     * @dev Set whether or not a set of tokens are soulbound
     */
    function setSoulbound(address creatorContractAddress, uint256[] memory tokenIds, bool soulbound) external creatorAdminRequired(creatorContractAddress) {
        for (uint i; i < tokenIds.length;) {
            _nonSoulbound[creatorContractAddress][tokenIds[i]] = !soulbound;
            unchecked { ++i; }
        }
    }

    /**
     * @dev Mint a new soulbound token
     */
    function mintNewToken(address creatorContractAddress, address[] calldata recipients, uint256[] calldata amounts, string[] calldata tokenURIs) external creatorAdminRequired(creatorContractAddress) {
        IERC1155CreatorCore(creatorContractAddress).mintExtensionNew(recipients, amounts, tokenURIs);
    }

    /**
     * @dev Mint an existing soulbound token
     */
    function mintExistingToken(address creatorContractAddress, address[] calldata recipients, uint256[] calldata tokenIds, uint256[] calldata amounts) external creatorAdminRequired(creatorContractAddress) {
        IERC1155CreatorCore(creatorContractAddress).mintExtensionExisting(recipients, tokenIds, amounts);
    }

    /**
     * @dev Set the token uri for one token
     */
    function setTokenURI(address creatorContractAddress, uint256 tokenId, string calldata uri) external creatorAdminRequired(creatorContractAddress) {
        IERC1155CreatorCore(creatorContractAddress).setTokenURIExtension(tokenId, uri);
    }

    /**
     * @dev Set the token uri for multiple tokens
     */
    function setTokenURI(address creatorContractAddress, uint256[] memory tokenId, string[] calldata uri) external creatorAdminRequired(creatorContractAddress) {
        IERC1155CreatorCore(creatorContractAddress).setTokenURIExtension(tokenId, uri);
    }

}
