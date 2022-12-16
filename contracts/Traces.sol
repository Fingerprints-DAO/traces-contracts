// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;
import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol';
import '@openzeppelin/contracts/utils/math/SafeMath.sol';
import '@openzeppelin/contracts/utils/Address.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/utils/introspection/ERC165Checker.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/security/Pausable.sol';

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
contract Traces is
  ERC721Enumerable,
  Pausable,
  AccessControl,
  ReentrancyGuard,
  IERC721Receiver
{
  using ERC165Checker for address;
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

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
  IERC20 public customTokenAddress;
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
    uint256 price,
    uint256 minHoldPeriod
  );

  /// @notice When deleting a token, call this event
  /// @param ogTokenAddress original erc721 contract address
  /// @param ogTokenId original erc721 NFT ID
  /// @param tokenId wnft id created in this contract
  event TokenDeleted(
    address indexed ogTokenAddress,
    uint256 indexed ogTokenId,
    uint256 indexed tokenId
  );

  /// @notice When adding a token and the collection wasnt created yet, call this event
  /// @param collectionId created collection id
  /// @param ogTokenAddress original erc721 contract address
  event CollectionAdded(
    uint256 indexed collectionId,
    address indexed ogTokenAddress
  );

  // create outbid event with important data
  event Outbid(
    address ogTokenAddress,
    uint256 ogTokenId,
    uint256 indexed tokenId,
    uint256 amount,
    uint256 price,
    address indexed owner
  );

  /// @notice Starts the contract and name it as Fingerpints Traces with FPTR symbol
  /// @dev Sets the basic needed to run this contract
  /// @param _adminAddress the user to be add the ADMIN and EDITOR roles
  /// @param _vaultAddress vault where allowed NFTs are to be used in this contract (Fingerprints DAO vault)
  /// @param _tokenAddress ERC20 contract address to be used as currency for staking ($PRINTS)
  constructor(
    address _adminAddress,
    address _vaultAddress,
    IERC20 _tokenAddress,
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
    uint256 allowedToTransfer = customTokenAddress.allowance(
      msg.sender,
      address(this)
    );

    if (allowedToTransfer < _amount || allowedToTransfer < _minStake) {
      revert TransferNotAllowed(_amount);
    }
  }

  /**
   * @notice Change Vault Address
   * @dev Only ADMIN. It sets a new address to vaultAddress variable
   * @param _vaultAddress vault where allowed NFTs are to be used in this contract (Fingerprints DAO vault)
   */
  function setVaultAddress(address _vaultAddress)
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
  {
    vaultAddress = _vaultAddress;
  }

  /// @notice Returns the staked amount of current staked wnft
  /// @dev It access wnftList to get the wnft data and returns stakedAmount
  /// @param _tokenId wnft id created by this contract
  /// @return staked amount
  function getStakedValue(uint256 _tokenId) external view returns (uint256) {
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
  /// @return uint256 current price to outbid the wnft with the same base of erc20 token decimals (usually 18)
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
  }

  /// @notice Get the current price of a WNFT
  /// @dev It can returns the current price when in a dutch auction, also when it is finished
  /// returns error when wnt is on hold period
  /// @param _tokenId the wnft id generated by this contract
  /// @return uin256 with the current price of wnft requested
  function getWNFTPrice(uint256 _tokenId) public view returns (uint256) {
    WrappedToken memory token = getToken(_tokenId);

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
   * @param _ogTokenAddress the original nft contract address
   * @param _ogTokenId the original nft id
   * @param _firstStakePrice first minimum price to stake
   * @param _minHoldPeriod miminum time (in seconds) which no one can outbid the wnft
   * @param _dutchMultiplier multiplier used to calculate the price of dutch auction after hold period
   * @param _dutchAuctionDuration how long (in seconds) the dutch auction will take untill get the firstStakePrice
   */
  function addToken(
    address _ogTokenAddress,
    uint256 _ogTokenId,
    uint256 _firstStakePrice,
    uint256 _minHoldPeriod,
    uint256 _dutchMultiplier,
    uint256 _dutchAuctionDuration
  )
    external
    nonReentrant
    whenNotPaused
    onlyRole(EDITOR_ROLE)
    _isERC721Contract(_ogTokenAddress)
  {
    // throws error if original nft contract is not an erc721
    if (IERC721(_ogTokenAddress).ownerOf((_ogTokenId)) != vaultAddress) {
      revert NotOwnerOfToken(_ogTokenAddress, _ogTokenId, vaultAddress);
    }
    // throws error if nft is already added
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
      // emit CollectionAdded event when storing it on collection mapping
      emit CollectionAdded(collection[_ogTokenAddress].id, _ogTokenAddress);
    }

    // create the wnft id - sum of collection.id, collection.count and 1
    // also increment collection.tokenCount
    uint256 newTokenId = collection[_ogTokenAddress].id.add(
      collection[_ogTokenAddress].tokenCount++
    );

    // create WrappedToken struct to store
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
    // create OgToken struct to store
    wrappedIdToOgToken[newTokenId] = OgToken({
      tokenAddress: _ogTokenAddress,
      id: _ogTokenId
    });

    // Mint WNFT to this contract
    _safeMint(address(this), newTokenId);

    // emit event with ogTokenAddress, ogTokenId and newTokenId indexed for future features
    emit TokenAdded(
      _ogTokenAddress,
      _ogTokenId,
      newTokenId,
      _firstStakePrice,
      _minHoldPeriod
    );
    console.log(_ogTokenAddress, _ogTokenId, newTokenId);
    console.log(_firstStakePrice, _minHoldPeriod);
  }

  /**
   * @notice Outbid a wrapped NFT
   * @dev It transfer the WNFT to msg.sender and stake the user erc20 token
   * @param _ogTokenAddress the original nft contract address
   * @param _ogTokenId the original nft id
   * @param _amount the amount this function will try to use to stake - it verifies allowance and if matches the current price
   */
  function outbid(
    address _ogTokenAddress,
    uint256 _ogTokenId,
    uint256 _amount
  ) external whenNotPaused nonReentrant {
    // gets wnft data
    WrappedToken memory token = wnftList[_ogTokenAddress][_ogTokenId];
    console.log(token.ogTokenId, _ogTokenId);
    // throws error if this token doesn't exist
    if (token.ogTokenId != _ogTokenId)
      revert InvalidTokenId(_ogTokenAddress, _ogTokenId);

    console.log('After id checking');
    // get the current price of this wnft
    // Also, getWNFTPrice has isHoldPeriod validation
    uint256 price = getWNFTPrice(token.tokenId);

    console.log('After price', price);
    // checks this contract allowance to outbid the wnft
    hasEnoughToStake(_amount, price);

    console.log('After Enough to stake', _amount);
    // throws error if price is bigger than amount sent
    if (price > _amount) {
      revert InvalidAmount(_ogTokenAddress, _ogTokenId, price, _amount);
    }
    console.log('After price > amount');

    // starts outbid process

    // stores current timestamp (used to dutch auction maths)
    wnftList[_ogTokenAddress][_ogTokenId].lastOutbidTimestamp = block.timestamp;
    // updates staked amount
    wnftList[_ogTokenAddress][_ogTokenId].stakedAmount = _amount;

    address _owner = this.ownerOf(token.tokenId);

    console.log('before transfering');
    // transfer wnft from current owner to the outbidder
    _safeTransfer(_owner, msg.sender, token.tokenId, '');
    // transfer erc20 custom token from outbidder to this contract
    customTokenAddress.safeTransferFrom(msg.sender, address(this), _amount);
    // allowance to transfer erc20 staked token back to previous oubidder
    customTokenAddress.safeApprove(address(this), token.stakedAmount);
    // transfer the staked amount to previous outbidder
    customTokenAddress.safeTransferFrom(
      address(this),
      _owner,
      token.stakedAmount
    );
    console.log('before event');

    // emits an event when outbid happens with important data
    emit Outbid(
      _ogTokenAddress,
      _ogTokenId,
      token.tokenId,
      token.stakedAmount,
      _amount,
      msg.sender
    );
  }

  /**
   * @notice Unstake a wrapped NFT
   * @dev It transfer the WNFT back to this contract
   * and custom erc20 token back to the msg.sender
   * Only current owner and Editor can unstake the wnft
   * @param _tokenId token id to unstake
   */
  function unstake(uint256 _tokenId) external whenNotPaused nonReentrant {
    address _owner = this.ownerOf(_tokenId);
    // throws error if it is not the owner or EDITOR calling this
    if (msg.sender != _owner && !hasRole(EDITOR_ROLE, msg.sender))
      revert NoPermission(_tokenId, _owner);

    WrappedToken memory token = getToken(_tokenId);

    // reset staked amount
    wnftList[wrappedIdToOgToken[_tokenId].tokenAddress][
      wrappedIdToOgToken[_tokenId].id
    ].stakedAmount = 0;
    // reset outbid timestamp
    wnftList[wrappedIdToOgToken[_tokenId].tokenAddress][
      wrappedIdToOgToken[_tokenId].id
    ].lastOutbidTimestamp = 0;
    // allowance to transfer erc20 tokens from this contract
    customTokenAddress.safeApprove(address(this), token.stakedAmount);
    // transfer outbidder wnft back to this contract
    _safeTransfer(_owner, address(this), _tokenId, '');
    // transfer erc20 custom token from this contract back to the user
    customTokenAddress.safeTransferFrom(
      address(this),
      _owner,
      token.stakedAmount
    );
  }

  /**
   * @notice Delete unstaked token
   * @dev Only editor can call this. Also, the token must be unstaked (when contract is the owner)
   * It removes the token from mapping and burn the nft
   * @param _tokenId token id to unstake
   */
  function deleteToken(uint256 _tokenId)
    external
    whenNotPaused
    onlyRole(EDITOR_ROLE)
  {
    if (ownerOf(_tokenId) != address(this))
      revert NoPermission(_tokenId, ownerOf(_tokenId));

    // emits delete event before removing data from mappings
    emit TokenDeleted(
      wrappedIdToOgToken[_tokenId].tokenAddress, // ogTokenAddress
      wrappedIdToOgToken[_tokenId].id, // ogTokenId
      _tokenId // tokenId
    );

    // Deletes WrappedToken from wnftList[tokenAddress][tokenId]
    delete wnftList[wrappedIdToOgToken[_tokenId].tokenAddress][
      wrappedIdToOgToken[_tokenId].id
    ];

    // Decreases tokenCount from CollectionInfo[tokenAddress]
    collection[wrappedIdToOgToken[_tokenId].tokenAddress]
      .tokenCount = collection[wrappedIdToOgToken[_tokenId].tokenAddress]
      .tokenCount
      .sub(1);

    // Deletes OgToken from wrappedIdToOgToken[tokenId]
    delete wrappedIdToOgToken[_tokenId];
    _burn(_tokenId);
  }

  /// @notice Change erc20 tokens settings
  /// @dev Only admin can call this
  /// @param _customTokenAddress the new erc20 contract adress
  /// @param _customTokenDecimals the decimals base used on erc20 contract address
  function setERC20Token(
    IERC20 _customTokenAddress,
    uint256 _customTokenDecimals
  ) external onlyRole(DEFAULT_ADMIN_ROLE) {
    require(
      address(_customTokenAddress) != address(0) && _customTokenDecimals > 10,
      'Invalid address or decimals'
    );
    customTokenAddress = _customTokenAddress;
    customTokenDecimals = _customTokenDecimals;
  }

  /// @notice Change the base uri (path of stored metadata)
  /// @dev Only admin can call this
  /// @param _newBaseURI the new url where metadata is stored. (need to include slash "/" at the end)
  function setBaseURI(string memory _newBaseURI)
    external
    onlyRole(DEFAULT_ADMIN_ROLE)
  {
    baseURI = _newBaseURI;
  }

  /// @notice Override _baseURI internal function to return baseURI variable set in this contract
  /// @return a string with actual value of baseURI
  function _baseURI() internal view virtual override returns (string memory) {
    return baseURI;
  }

  /**
   * @notice Pause this contract
   * @dev This function can only be called by the admin
   */
  function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
    _pause();
  }

  /**
   * @notice Unpause this contract
   * @dev This function can only be called by the admin
   */
  function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
    _unpause();
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
