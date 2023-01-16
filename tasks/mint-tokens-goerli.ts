import { parseUnits } from 'ethers/lib/utils'
import { task, types } from 'hardhat/config'
import { contractAddresses } from '../logs/deploy-goerli.json'

task('mint-tokens-goerli', 'Mints custom tokens')
  .addOptionalParam(
    'erc20Mock',
    'The `Custom erc20` contract address',
    contractAddresses.ERC20Mock,
    types.string
  )
  .addOptionalParam('amount', 'Amount to mint', '1000000', types.string)
  .setAction(async ({ erc20Mock, amount }, { ethers }) => {
    const nftFactory = await ethers.getContractFactory('ERC20Mock')
    const nftContract = nftFactory.attach(erc20Mock)
    const addresses = [
      '0xDd3e9d0eE979E5c1689A18992647312b42d6d8F3', // Shira
      '0x0dAb8FDeFfc501bf080615952Dcd7bf116D5B506', // Igor
      '0x586bc43937c2ec42348cc83acf44ced42fe3d5f7', // Lucas
      '0xfD7c1b12eD5727DAa36600f701c7B418EccF8816', // Lobão
      '0x2cCEA256ed55c5E17a75269cE5687A711371b5dD', // Studio
      '0x2aCB6c756A7CCEED16B3742fD60Abad0A644e641', // Lobão
    ]

    let gasPrice = await ethers.provider.getGasPrice()

    // const promises = []
    for (const address of addresses) {
      console.log('Minting tokens to', address)

      await nftContract.mint(address, parseUnits(amount, 18), {
        gasPrice,
      })
      console.log(`${amount.toString()} $prints minted to account ${address}`)
    }

    console.log('Done')
  })
