// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;
import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import '@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/Address.sol';
import '@openzeppelin/contracts/utils/introspection/ERC165Checker.sol';

// Uncomment this line to use console.log
import 'hardhat/console.sol';

error DuplicatedToken(address tokenAddress, uint256 tokenId);
error NotOwnerOfToken(address tokenAddress, uint256 tokenId, address vault);
error Invalid721Contract(address tokenAddress);

contract Traces is ERC721Enumerable, Ownable {
  using ERC165Checker for address;
  bytes4 public constant IID_IERC721 = type(IERC721).interfaceId;

  // Address where NFTs are. These NFTs will be allowed to be wrapped
  address public vaultAddress;

  // Enabled tokens to be wrapped
  // Mapping [tokenAddress][tokenId] => WrappedToken
  mapping(address => mapping(uint256 => WrappedToken)) public enabledTokens;

  struct WrappedToken {
    address tokenAddress;
    uint256 tokenId;
    uint256 minStakeValue;
  }

  event TokenAdded(
    address indexed tokenAddress,
    uint256 indexed tokenId,
    uint256
  );

  constructor(address _adminAddress, address _vaultAddress)
    ERC721('Traces', 'Traces')
  {
    transferOwnership(_adminAddress);
    vaultAddress = _vaultAddress;
  }

  /**
   * @notice Validate contract address
   * @dev Check if the address sent is a contract and an extension of ERC721
   */
  modifier _isERC721Contract(address _tokenAddress) {
    if (!_tokenAddress.supportsInterface(IID_IERC721)) {
      revert Invalid721Contract(_tokenAddress);
    }
    _;
  }

  /**
   * @notice Change Vault Address
   * @dev Only owner. It sets a new address to vaultAddress variable
   */
  function setVaultAddress(address _vaultAddress) public onlyOwner {
    vaultAddress = _vaultAddress;
  }

  /**
   * @notice Add token to be minted/wrapped
   * @dev Only owner.
   * It adds the token to mapping and mint it to this contract
   * It sets all token properties
   */
  function addToken(
    address _tokenAddress,
    uint256 _tokenId,
    uint256 _minStakeValue
  ) public onlyOwner _isERC721Contract(_tokenAddress) {
    if (IERC721(_tokenAddress).ownerOf((_tokenId)) != vaultAddress) {
      revert NotOwnerOfToken(_tokenAddress, _tokenId, vaultAddress);
    }
    if (enabledTokens[_tokenAddress][_tokenId].tokenId == _tokenId) {
      revert DuplicatedToken(_tokenAddress, _tokenId);
    }

    WrappedToken memory token;

    token.tokenAddress = _tokenAddress;
    token.tokenId = _tokenId;
    token.minStakeValue = _minStakeValue;

    enabledTokens[_tokenAddress][_tokenId] = token;

    emit TokenAdded(_tokenAddress, _tokenId, _minStakeValue);
  }

  function supportsInterface(bytes4 interfaceId)
    public
    view
    virtual
    override(ERC721Enumerable)
    returns (bool)
  {
    return
      interfaceId == type(IERC721Enumerable).interfaceId ||
      super.supportsInterface(interfaceId);
  }
}
