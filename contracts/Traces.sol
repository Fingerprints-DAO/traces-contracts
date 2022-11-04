// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;
import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol';
import '@openzeppelin/contracts/utils/math/SafeMath.sol';
// import '@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol';
import '@openzeppelin/contracts/utils/Address.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/utils/introspection/ERC165Checker.sol';

// Uncomment this line to use console.log
import 'hardhat/console.sol';

error DuplicatedToken(address ogTokenAddress, uint256 ogTokenId);
error NotOwnerOfToken(address ogTokenAddress, uint256 ogTokenId, address vault);
error Invalid721Contract(address ogTokenAddress);
error InvalidAmount(
  address ogTokenAddress,
  uint256 ogTokenId,
  uint256 expectedAmount,
  uint256 amountSent
);
error TransferNotAllowed(uint256 expectedAmount);
error InvalidTokenId(address ogTokenAddress, uint256 ogTokenId);
error HoldPeriod(address ogTokenAddress, uint256 ogTokenId);
error NoPermission(uint256 tokenId, address owner);

contract Traces is ERC721Enumerable, AccessControl {
  using ERC165Checker for address;
  using SafeMath for uint256;

  bytes32 public constant EDITOR_ROLE = keccak256('EDITOR_ROLE');
  bytes4 public constant IID_IERC721 = type(IERC721).interfaceId;

  // Address where NFTs are. These NFTs will be allowed to be wrapped
  address public vaultAddress;

  // Address of ERC20 token accepted
  address public customTokenAddress;

  // Enabled tokens to be wrapped
  // Mapping [ogTokenAddress][ogTokenId] => WrappedToken
  mapping(address => mapping(uint256 => WrappedToken)) public wnftList;
  mapping(uint256 => OgToken) public wrappedIdToOgToken;
  mapping(address => CollectionInfo) public collection;

  uint256 public collectionCounter = 1;
  uint256 public constant COLLECTION_MULTIPLIER = 1_000_000;

  struct OgToken {
    address tokenAddress;
    uint256 id;
  }
  struct WrappedToken {
    address ogTokenAddress;
    uint256 ogTokenId;
    uint256 tokenId;
    uint256 collectionId;
    uint256 minStakeValue;
    uint256 minHoldPeriod;
    uint256 lastOutbidTimestamp;
  }
  struct CollectionInfo {
    address ogTokenAddress;
    uint256 id;
    uint256 tokenCount;
  }
  event TokenAdded(
    address indexed ogTokenAddress,
    uint256 indexed ogTokenId,
    uint256 indexed tokenId,
    uint256,
    uint256
  );

  constructor(
    address _adminAddress,
    address _vaultAddress,
    address _tokenAddress
  ) ERC721('TRC', 'Traces') {
    _grantRole(DEFAULT_ADMIN_ROLE, _adminAddress);
    _grantRole(EDITOR_ROLE, _adminAddress);
    vaultAddress = _vaultAddress;
    customTokenAddress = _tokenAddress;
  }

  /**
   * @notice Validate contract address
   * @dev Check if the address sent is a contract and an extension of ERC721
   */
  modifier _isERC721Contract(address _ogTokenAddress) {
    if (!_ogTokenAddress.supportsInterface(IID_IERC721)) {
      revert Invalid721Contract(_ogTokenAddress);
    }
    _;
  }

  function isHoldPeriod(uint256 lastOutbid, uint256 minHoldPeriod)
    public
    view
    returns (bool)
  {
    if (lastOutbid == 0) return false;
    return lastOutbid.add(minHoldPeriod) > block.timestamp;
  }

  function hasEnoughToStake(uint256 _amount, uint256 _minStake) public view {
    uint256 allowedToTransfer = IERC20(customTokenAddress).allowance(
      msg.sender,
      address(this)
    );

    if (allowedToTransfer < _amount || allowedToTransfer < _minStake)
      revert TransferNotAllowed(_amount);
  }

  /**
   * @notice Change Vault Address
   * @dev Only owner. It sets a new address to vaultAddress variable
   */
  function setVaultAddress(address _vaultAddress)
    public
    onlyRole(DEFAULT_ADMIN_ROLE)
  {
    vaultAddress = _vaultAddress;
  }

  function getStakedValue(uint256 _tokenId) public view returns (uint256) {
    return
      wnftList[wrappedIdToOgToken[_tokenId].tokenAddress][
        wrappedIdToOgToken[_tokenId].id
      ].minStakeValue;
  }

  /**
   * @notice Add token to be minted/wrapped
   * @dev Only owner.
   * It adds the token to mapping and mint it to this contract
   * It sets all token properties
   */
  function addToken(
    address _ogTokenAddress,
    uint256 _ogTokenId,
    uint256 _minStakeValue,
    uint256 _minHoldPeriod
  ) public onlyRole(EDITOR_ROLE) _isERC721Contract(_ogTokenAddress) {
    if (IERC721(_ogTokenAddress).ownerOf((_ogTokenId)) != vaultAddress) {
      revert NotOwnerOfToken(_ogTokenAddress, _ogTokenId, vaultAddress);
    }
    if (wnftList[_ogTokenAddress][_ogTokenId].ogTokenId == _ogTokenId) {
      revert DuplicatedToken(_ogTokenAddress, _ogTokenId);
    }

    // Create a collection if it doesn't exist
    // Set collection id, tokenCount and ogTokenAddress
    if (collection[_ogTokenAddress].id < 1) {
      collection[_ogTokenAddress] = CollectionInfo({
        id: (collectionCounter++).mul(COLLECTION_MULTIPLIER),
        tokenCount: 0,
        ogTokenAddress: _ogTokenAddress
      });
    }

    uint256 newTokenId = collection[_ogTokenAddress].tokenCount++;

    wnftList[_ogTokenAddress][_ogTokenId] = WrappedToken({
      ogTokenAddress: _ogTokenAddress,
      ogTokenId: _ogTokenId,
      tokenId: newTokenId,
      collectionId: collection[_ogTokenAddress].id,
      minStakeValue: _minStakeValue,
      minHoldPeriod: _minHoldPeriod,
      lastOutbidTimestamp: 0
    });
    wrappedIdToOgToken[newTokenId] = OgToken({
      tokenAddress: _ogTokenAddress,
      id: _ogTokenId
    });

    // Mint WNFT to this contract
    _safeMint(address(this), newTokenId);

    emit TokenAdded(
      _ogTokenAddress,
      _ogTokenId,
      newTokenId,
      _minStakeValue,
      _minHoldPeriod
    );
  }

  /**
   * @notice Outbid a wrapped NFT
   * @dev It transfer the WNFT to msg.sender and stake the user erc20 token
   */
  function outbid(
    address _ogTokenAddress,
    uint256 _ogTokenId,
    uint256 _amount
  ) public {
    WrappedToken memory token = wnftList[_ogTokenAddress][_ogTokenId];
    if (token.ogTokenId != _ogTokenId)
      revert InvalidTokenId(_ogTokenAddress, _ogTokenId);

    hasEnoughToStake(_amount, token.minStakeValue);

    if (token.minStakeValue > _amount) {
      revert InvalidAmount(
        _ogTokenAddress,
        _ogTokenId,
        token.minStakeValue,
        _amount
      );
    }

    if (isHoldPeriod(token.lastOutbidTimestamp, token.minHoldPeriod))
      revert HoldPeriod(_ogTokenAddress, _ogTokenId);

    wnftList[_ogTokenAddress][_ogTokenId].lastOutbidTimestamp = block.timestamp;
    address _owner = this.ownerOf(token.tokenId);
    IERC20(customTokenAddress).transferFrom(msg.sender, address(this), _amount);
    // TODO: transfer erc20 staked token back to the oubidded user
    _safeTransfer(_owner, msg.sender, token.tokenId, '');
  }

  /**
   * @notice Unstake a wrapped NFT
   * @dev It transfer the WNFT back to this contract
   * and custom erc20 token back to the msg.sender
   */
  function unstake(uint256 _id) public {
    address _owner = this.ownerOf(_id);
    if (msg.sender != _owner && !hasRole(EDITOR_ROLE, msg.sender))
      revert NoPermission(_id, _owner);

    uint256 stakedValue = getStakedValue(_id);

    IERC20(customTokenAddress).approve(address(this), stakedValue);
    _safeTransfer(_owner, address(this), _id, '');
    IERC20(customTokenAddress).transferFrom(address(this), _owner, stakedValue);
  }

  /**
   * @notice Delete unstaked token
   * @dev Only editor.
   * It removes the token from mapping and burn the nft
   */
  function deleteToken(uint256 _id) public onlyRole(EDITOR_ROLE) {
    if (ownerOf(_id) != address(this)) revert NoPermission(_id, ownerOf(_id));

    // Delete WrappedToken from wnftList[tokenAddress][tokenId]
    delete wnftList[wrappedIdToOgToken[_id].tokenAddress][
      wrappedIdToOgToken[_id].id
    ];

    // Decrease tokenCount from CollectionInfo[tokenAddress]
    collection[wrappedIdToOgToken[_id].tokenAddress].tokenCount = collection[
      wrappedIdToOgToken[_id].tokenAddress
    ].tokenCount.sub(1);

    // Delete OgToken from wrappedIdToOgToken[tokenId]
    delete wrappedIdToOgToken[_id];
    _burn(_id);
  }

  function supportsInterface(bytes4 interfaceId)
    public
    view
    virtual
    override(ERC721Enumerable, AccessControl)
    returns (bool)
  {
    return
      interfaceId == type(IERC721Enumerable).interfaceId ||
      super.supportsInterface(interfaceId);
  }

  function onERC721Received(
    address,
    address,
    uint256,
    bytes calldata
  ) external pure returns (bytes4) {
    return IERC721Receiver.onERC721Received.selector;
  }
}
