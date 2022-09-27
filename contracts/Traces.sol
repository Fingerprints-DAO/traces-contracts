// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;
import '@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

// Uncomment this line to use console.log
// import "hardhat/console.sol";

contract Traces is ERC721Enumerable, Ownable {
  // Address where NFTs are. These NFTs will be allowed to be wrapped
  address public vaultAddress;

  constructor(address _adminAddress, address _vaultAddress)
    ERC721('Traces', 'Traces')
  {
    transferOwnership(_adminAddress);
    vaultAddress = _vaultAddress;
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
