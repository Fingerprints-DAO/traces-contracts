import { task, types } from 'hardhat/config'

task('mint-tokens', 'Mints custom tokens')
  .addOptionalParam(
    'erc20Mock',
    'The `Custom erc20` contract address',
    '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    types.string
  )
  .addOptionalParam(
    'mintTo',
    'Mint to address',
    '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    types.string
  )
  .addOptionalParam('amount', 'Amount to mint', 100_000_000, types.int)
  .setAction(async ({ erc20Mock, mintTo, amount }, { ethers }) => {
    const nftFactory = await ethers.getContractFactory('ERC20Mock')
    const nftContract = nftFactory.attach(erc20Mock)

    await nftContract.mint(mintTo, amount)

    console.log(`${amount.toString()} $prints minted to account ${mintTo}`)
  })
