import { TASK_COMPILE, TASK_NODE } from 'hardhat/builtin-tasks/task-names'
import { task } from 'hardhat/config'

task(
  'run-local',
  'Start a hardhat node, deploy contracts, and execute setup transactions'
).setAction(async (_, { ethers, run }) => {
  const [deployer, DAOVault, bob, marcia] = await ethers.getSigners()

  const { chainId } = await ethers.provider.getNetwork()

  // const accounts = {
  //   'Account #0': {
  //     Address: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
  //     'Private Key':
  //       '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  //   },
  //   'Account #1': {
  //     Address: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
  //     'Private Key':
  //       '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  //   },
  // }

  // console.table(accounts)

  await run(TASK_COMPILE)

  await Promise.race([
    run(TASK_NODE, { hostname: '0.0.0.0' }),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ])

  const contracts = await run('deploy-local')

  await Promise.all([
    run('mint-nfts', {
      erc721Mock: contracts.ERC721Mock.address,
      mintTo: DAOVault.address,
      qty: 100,
    }),
    run('mint-tokens', {
      erc721Mock: contracts.ERC20Mock.address,
      mintTo: deployer.address,
      qty: '100000',
    }),
    run('mint-tokens', {
      erc721Mock: contracts.ERC20Mock.address,
      mintTo: bob.address,
      qty: '10000',
    }),
    run('mint-tokens', {
      erc721Mock: contracts.ERC20Mock.address,
      mintTo: marcia.address,
      qty: '1000',
    }),
  ])

  await run('traces-add-nft', {
    traces: contracts.Traces.address,
    ogTokenAddress: contracts.ERC721Mock.address,
    ogTokenId: 11,
    minStake: 400,
    minHoldPeriod: 1000 * 60 * 10, // 10 minutes
  })

  console.log(
    `Trace contracts deployed to local node at http://localhost:8545 (Chain ID: ${chainId})`
  )
  console.log(`ERC721 Mock address: ${contracts.ERC721Mock.instance.address}`)
  console.log(
    `ERC20 Mock ($PRINTS) address: ${contracts.ERC20Mock.instance.address}`
  )
  console.log(`Traces address: ${contracts.Traces.instance.address}`)
  console.log('DAOVault.address', DAOVault.address)
  console.log('Minted $prints tokens to:')
  console.log(deployer.address, bob.address, marcia.address)

  await ethers.provider.send('evm_setIntervalMining', [12_000])

  await new Promise(() => {
    /* keep node alive until this process is killed */
  })
})
