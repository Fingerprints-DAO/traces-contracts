// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;
import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/Address.sol';
import '@openzeppelin/contracts/utils/introspection/ERC165Checker.sol';

// Uncomment this line to use console.log
import 'hardhat/console.sol';

error DuplicatedToken(address tokenAddress, uint256 tokenId);
error NotOwnerOfToken(address tokenAddress, uint256 tokenId, address vault);
error Invalid721Contract(address tokenAddress);
error InvalidAmount(
  address tokenAddress,
  uint256 tokenId,
  uint256 expectedAmount,
  uint256 amountSent
);
error TransferNotAllowed(uint256 expectedAmount);
error InvalidTokenId(address tokenAddress, uint256 tokenId);
error HoldPeriod(address tokenAddress, uint256 tokenId);

contract Traces is ERC721Enumerable, Ownable {
  using ERC165Checker for address;
  bytes4 public constant IID_IERC721 = type(IERC721).interfaceId;

  // Address where NFTs are. These NFTs will be allowed to be wrapped
  address public vaultAddress;

  // Address of ERC20 token accepted
  address public customTokenAddress;

  // Enabled tokens to be wrapped
  // Mapping [tokenAddress][tokenId] => WrappedToken
  mapping(address => mapping(uint256 => WrappedToken)) public enabledTokens;

  struct WrappedToken {
    address tokenAddress;
    uint256 tokenId;
    uint256 minStakeValue;
    uint256 holdPeriodTimestamp;
  }

  event TokenAdded(
    address indexed tokenAddress,
    uint256 indexed tokenId,
    uint256,
    uint256
  );

  constructor(
    address _adminAddress,
    address _vaultAddress,
    address _tokenAddress
  ) ERC721('Traces', 'Traces') {
    transferOwnership(_adminAddress);
    vaultAddress = _vaultAddress;
    customTokenAddress = _tokenAddress;
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

  function isHoldPeriod(uint256 timestamp) public view returns (bool) {
    return timestamp > block.timestamp;
  }

  function hasEnoughToStake(uint256 _amount, uint256 _minStake)
    public
    view
    returns (bool)
  {
    uint256 allowedToTransfer = IERC20(customTokenAddress).allowance(
      msg.sender,
      address(this)
    );

    return allowedToTransfer < _amount || allowedToTransfer < _minStake;
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
    uint256 _minStakeValue,
    uint256 _holdPeriodTimestamp
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
    token.holdPeriodTimestamp = _holdPeriodTimestamp;

    enabledTokens[_tokenAddress][_tokenId] = token;

    emit TokenAdded(
      _tokenAddress,
      _tokenId,
      _minStakeValue,
      _holdPeriodTimestamp
    );
  }

  /**
   * @notice Outbid a wrapped NFT
   * @dev It transfer the WNFT to msg.sender and stake the user erc20 token
   */
  function outbid(
    address _tokenAddress,
    uint256 _tokenId,
    uint256 _amount
  ) public {
    WrappedToken memory token = enabledTokens[_tokenAddress][_tokenId];
    if (token.tokenId != _tokenId)
      revert InvalidTokenId(_tokenAddress, _tokenId);

    if (hasEnoughToStake(_amount, token.minStakeValue))
      revert TransferNotAllowed(_amount);

    if (token.minStakeValue > _amount) {
      revert InvalidAmount(
        _tokenAddress,
        _tokenId,
        token.minStakeValue,
        _amount
      );
    }
    if (isHoldPeriod(token.holdPeriodTimestamp))
      revert HoldPeriod(_tokenAddress, _tokenId);

    IERC20(customTokenAddress).transferFrom(msg.sender, address(this), _amount);
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
