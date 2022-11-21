// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;
import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol';
import '@openzeppelin/contracts/utils/math/SafeMath.sol';
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

/// @title Traces Smart Contract by Fingerprints DAO - v1
/// @author @TheArodEth - thearod.dev
/// @notice It allows $prints(Fingerprints DAO token) holders to mint a wrapped version of a NFT owned by the Fingerprints DAO by staking a quantity of $prints for each one.
/// Only 1 wrapped NFT per NFT is allowed. Also it's possible to outbid a wrapped NFT from another user and unstake the value if wanted.
/// Only NFTs from an ERC721 contracts are allowed to be used here
/// @dev This contract is extended of erc721 and mint NFTs based in the original NFT added by these contract functions.
/// There are only 2 Roles: Admin and Editor.
contract Traces is ERC721Enumerable, AccessControl {
  using ERC165Checker for address;
  using SafeMath for uint256;

  bytes32 public constant EDITOR_ROLE = keccak256('EDITOR_ROLE');
  bytes4 public constant IID_IERC721 = type(IERC721).interfaceId;

  /// @notice Stores the url to WNFT metadata
  string public baseURI;

  /// @notice Stores the Fingerprints DAO vault address
  /// @dev It's used to check the ownership of the DAO when adding a original NFT to be wrapped and used by members
  /// @return A wallet address
  address public vaultAddress;

  /// @notice Stores custom token details as ERC20 smart contract address and decimals used on this token
  /// @dev Current it stores the $prints details. The current token from Fingerprints DAO. It's not possible to get decimals from erc20 contract, that is why we need it set manually.
  /// @return A smart contract address and decimals from this smart contract
  address public customTokenAddress;
  uint256 public customTokenDecimals = 10**18;

  /// @notice Stores a list of wrapped token(NFT) created and minted
  /// @dev The list has 2 keys to access the wrapped token: original token address and original token id
  /// Mapping [ogTokenAddress][ogTokenId] => WrappedToken
  mapping(address => mapping(uint256 => WrappedToken)) public wnftList;

  /// @notice Stores a list with info of original tokens accessed by wnft.id
  /// @dev Used to get details of original token using the wrapped token id
  mapping(uint256 => OgToken) public wrappedIdToOgToken;

  /// @notice Stores a list with info about the original collection added
  /// @dev Used to list collections with wrapped nfts and create a namespace id for each original collection
  /// It's based on address of original erc721 NFT
  mapping(address => CollectionInfo) public collection;

  uint256 public collectionCounter = 1;
  uint256 public constant COLLECTION_MULTIPLIER = 1_000_000;

  struct OgToken {
    address tokenAddress;
    uint256 id;
  }
  struct WrappedToken {
    // original ERC71 smart contract address
    address ogTokenAddress;
    // original ERC71 NFT ID
    uint256 ogTokenId;
    // ID created by this smart contract after minting the wrapped NFT
    uint256 tokenId;
    // Collection ID created(grouped by same nft collections) by this smart contract after minting the wrapped NFT
    uint256 collectionId;
    // Stake price defined when add a new NFT by admin. This price is used when WNFT is unstaked
    uint256 firstStakePrice;
    // If WNFT is staked, this hold the amount staked to get this WNFT
    uint256 stakedAmount;
    // The time (in seconds) users need to wait to outbid this WNFT.
    uint256 minHoldPeriod;
    // The last time (in unix) that this WNFT was outbid
    uint256 lastOutbidTimestamp;
    // The time (in seconds) this wnft will be on dutch auction after an hold period
    uint256 dutchAuctionDuration;
    // The multiplicator used to staked amount when in dutch auction state
    uint256 dutchMultiplier;
  }
  struct CollectionInfo {
    // original erc721 nft address
    address ogTokenAddress;
    // generated id by this contract when adding the first nft of a collection
    uint256 id;
    // number of WNFTs created in this contract of this collection
    uint256 tokenCount;
  }

  /// @notice When adding a token, call this event
  /// @param ogTokenAddress original erc721 contract address
  /// @param ogTokenId original erc721 NFT ID
  /// @param tokenId wnft id created in this contract
  /// firstStakePrice and minHoldPeriod are sent as a not indexed parameters
  event TokenAdded(
    address indexed ogTokenAddress,
    uint256 indexed ogTokenId,
    uint256 indexed tokenId,
    uint256,
    uint256
  );

  /// @notice Starts the contract and name it as Fingerpints Traces with FPTR symbol
  /// @dev Sets the basic needed to run this contract
  /// @param _adminAddress the user to be add the ADMIN and EDITOR roles
  /// @param _vaultAddress vault where allowed NFTs are to be used in this contract (Fingerprints DAO vault)
  /// @param _tokenAddress ERC20 contract address to be used as currency for staking ($PRINTS)
  constructor(
    address _adminAddress,
    address _vaultAddress,
    address _tokenAddress,
    string memory _url
  ) ERC721('Fingerprints Traces', 'FPTR') {
    _grantRole(DEFAULT_ADMIN_ROLE, _adminAddress);
    _grantRole(EDITOR_ROLE, _adminAddress);
    vaultAddress = _vaultAddress;
    customTokenAddress = _tokenAddress;
    baseURI = _url;
  }

  /**
   * @notice Validates contract address
   * @dev Check if the address sent is a contract and an extension of ERC721
   * @param _ogTokenAddress original erc721 contract address
   */
  modifier _isERC721Contract(address _ogTokenAddress) {
    if (!_ogTokenAddress.supportsInterface(IID_IERC721)) {
      revert Invalid721Contract(_ogTokenAddress);
    }
    _;
  }

  /// @notice Checks if WNFT is on hold period
  /// @dev when in holding period, no user can outbid the wnft
  /// @param lastOutbid timestamp of last time that was outbidded
  /// @param minHoldPeriod time required to be hold before someone outbid it
  /// @return bool if it's on hold period or not
  function isHoldPeriod(uint256 lastOutbid, uint256 minHoldPeriod)
    public
    view
    returns (bool)
  {
    if (lastOutbid == 0) return false;
    return lastOutbid.add(minHoldPeriod) > block.timestamp;
  }

  /// @notice Checks if the user has allowed enough tokens to this contract to move and stake
  /// @dev Reverts with TransferNotAllowed error if user has not allowed this contract to move the erc20 tokens
  /// @param _amount amount sent to stake and outbid the wnft
  /// @param _minStake minumum required to stake and outbid the wnft
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
   * @dev Only ADMIN. It sets a new address to vaultAddress variable
   * @param _vaultAddress vault where allowed NFTs are to be used in this contract (Fingerprints DAO vault)
   */
  function setVaultAddress(address _vaultAddress)
    public
    onlyRole(DEFAULT_ADMIN_ROLE)
  {
    vaultAddress = _vaultAddress;
  }

  /// @notice Returns the staked amount of current staked wnft
  /// @dev It access wnftList to get the wnft data and returns stakedAmount
  /// @param _tokenId wnft id created by this contract
  /// @return staked amount
  function getStakedValue(uint256 _tokenId) public view returns (uint256) {
    return
      wnftList[wrappedIdToOgToken[_tokenId].tokenAddress][
        wrappedIdToOgToken[_tokenId].id
      ].stakedAmount;
  }

  /// @notice Returns the WrappedToken
  /// @dev It access wrappedIdToOgToken to get the original wnft info and gets the token from wnftList
  /// @param _tokenId wnft id created by this contract
  /// @return WrappedToken struct
  function getToken(uint256 _tokenId)
    public
    view
    returns (WrappedToken memory)
  {
    return
      wnftList[wrappedIdToOgToken[_tokenId].tokenAddress][
        wrappedIdToOgToken[_tokenId].id
      ];
  }

  /// @notice Returns the current price on according to parameters sent
  /// @dev It is used to calculate the price of a dutch auction
  /// @param priceLimit the minimum price the wnft can have
  /// @param lastTimestamp last time the wnft was outbidded
  /// @param dutchMultiplier base to reach the max price of wnft when in dutch auction phase
  /// @param duration the duration of dutch auction (in seconds)
  /// @return uint256 current price to outbid the wnft
  function getCurrentPrice(
    uint256 priceLimit,
    uint256 lastTimestamp,
    uint256 dutchMultiplier,
    uint256 duration
  ) public view returns (uint256) {
    // Auction ended
    if (block.timestamp >= lastTimestamp.add(duration))
      return priceLimit.mul(customTokenDecimals);

    return
      priceLimit.mul(dutchMultiplier).mul(
        customTokenDecimals.sub(
          (block.timestamp.sub(lastTimestamp)).mul(customTokenDecimals).div(
            duration
          )
        )
      );
    // (block.timestamp - lastTimestamp + guarantee).mul(PRECISION).div(duration)
    // .div(PREC);
  }

  function getWNFTPrice(uint256 _id) public view returns (uint256) {
    WrappedToken memory token = getToken(_id);

    // Auction hasnt started. Current status is hold period
    if (isHoldPeriod(token.lastOutbidTimestamp, token.minHoldPeriod))
      revert HoldPeriod(token.ogTokenAddress, token.ogTokenId);

    // Return original price if token is unstaked
    if (token.stakedAmount == 0) return token.firstStakePrice;

    return
      getCurrentPrice(
        token.stakedAmount.div(customTokenDecimals),
        token.lastOutbidTimestamp.add(token.minHoldPeriod),
        token.dutchMultiplier,
        token.dutchAuctionDuration
      );
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
    uint256 _firstStakePrice,
    uint256 _minHoldPeriod,
    uint256 _dutchMultiplier,
    uint256 _dutchAuctionDuration
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

    uint256 newTokenId = collection[_ogTokenAddress].id.add(
      collection[_ogTokenAddress].tokenCount++
    );

    wnftList[_ogTokenAddress][_ogTokenId] = WrappedToken({
      ogTokenAddress: _ogTokenAddress,
      ogTokenId: _ogTokenId,
      tokenId: newTokenId,
      collectionId: collection[_ogTokenAddress].id,
      firstStakePrice: _firstStakePrice,
      stakedAmount: 0,
      minHoldPeriod: _minHoldPeriod,
      lastOutbidTimestamp: 0,
      dutchMultiplier: _dutchMultiplier,
      dutchAuctionDuration: _dutchAuctionDuration //86400000 // 24 hours
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
      _firstStakePrice,
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

    // getWNFTPrice has isHoldPeriod validation
    uint256 price = getWNFTPrice(token.tokenId);

    hasEnoughToStake(_amount, price);

    if (price > _amount) {
      revert InvalidAmount(_ogTokenAddress, _ogTokenId, price, _amount);
    }

    // if (isHoldPeriod(token.lastOutbidTimestamp, token.minHoldPeriod))
    //   revert HoldPeriod(_ogTokenAddress, _ogTokenId);

    wnftList[_ogTokenAddress][_ogTokenId].lastOutbidTimestamp = block.timestamp;
    wnftList[_ogTokenAddress][_ogTokenId].stakedAmount = _amount;
    address _owner = this.ownerOf(token.tokenId);
    // transfer wnft from this contract to the user
    _safeTransfer(_owner, msg.sender, token.tokenId, '');
    // transfer erc20 custom token from sender to this contract
    IERC20(customTokenAddress).transferFrom(msg.sender, address(this), _amount);
    // transfer erc20 staked token back to the oubidded user
    IERC20(customTokenAddress).approve(address(this), token.stakedAmount);
    IERC20(customTokenAddress).transferFrom(
      address(this),
      _owner,
      token.stakedAmount
    );
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

    WrappedToken memory token = getToken(_id);

    wnftList[wrappedIdToOgToken[_id].tokenAddress][wrappedIdToOgToken[_id].id]
      .stakedAmount = 0;
    wnftList[wrappedIdToOgToken[_id].tokenAddress][wrappedIdToOgToken[_id].id]
      .lastOutbidTimestamp = 0;
    // allowance of this contract
    IERC20(customTokenAddress).approve(address(this), token.stakedAmount);
    // transfer user wnft to this contract
    _safeTransfer(_owner, address(this), _id, '');
    // transfer erc20 custom token from this contract to the user
    IERC20(customTokenAddress).transferFrom(
      address(this),
      _owner,
      token.stakedAmount
    );
  }

  /**
   * @notice Delete unstaked token
   * @dev Only editor and if the token is unstaked (contract is the owner)
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

  function setBaseURI(string memory _newBaseURI)
    public
    onlyRole(DEFAULT_ADMIN_ROLE)
  {
    baseURI = _newBaseURI;
  }

  function _baseURI() internal view virtual override returns (string memory) {
    return baseURI;
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
