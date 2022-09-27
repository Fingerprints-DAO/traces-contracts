// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;
import '@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol';

// Uncomment this line to use console.log
// import "hardhat/console.sol";

contract Traces is ERC721Enumerable {
  constructor() ERC721('Traces', 'Traces') {}

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
