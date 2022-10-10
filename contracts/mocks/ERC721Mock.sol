// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import 'hardhat/console.sol';
import '@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol';

contract ERC721Mock is ERC721Enumerable {
  constructor(
    string memory name,
    string memory symbol,
    uint256 tokenId
  ) ERC721(name, symbol) {
    _mint(msg.sender, tokenId);
  }

  function mint(address addr, uint256 tokenId) public {
    _mint(addr, tokenId);
  }

  function testMintMany(
    address addr,
    uint256 n,
    uint56 start
  ) public {
    for (uint256 i = start; i < n + start; i++) {
      _mint(addr, i);
    }
  }

  function transfer(
    address from,
    address to,
    uint256 tokenId
  ) public {
    _transfer(from, to, tokenId);
  }
}
